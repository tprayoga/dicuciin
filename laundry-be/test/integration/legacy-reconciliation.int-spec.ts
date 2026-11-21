/**
 * Batch 1.5 — rekonsiliasi booking lama & audit outlet staf (PostgreSQL nyata).
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  BookingStatus,
  OrderStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import {
  applyLegacyBookingActions,
  buildLegacyBookingReport,
} from "../../src/modules/bookings/legacy-booking-reconciliation";
import { auditStaffOutlets } from "../../src/common/auth/staff-outlet-audit";
import {
  createCustomer,
  createMachine,
  createOutlet,
  createUser,
  inMinutes,
  resetDb,
} from "./helpers";

describe("Batch 1.5 — rekonsiliasi booking lama (PostgreSQL nyata)", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  const ids: Record<string, string> = {};
  let n = 0;
  async function booking(
    deviceId: string,
    customerId: string,
    status: BookingStatus,
    opts: { orderId?: string; expiresAt?: Date } = {},
  ) {
    const b = await prisma.machineBooking.create({
      data: {
        deviceId,
        customerId,
        status,
        orderId: opts.orderId ?? null,
        bookingCode: `BK-LEG-${++n}`,
        expiresAt: opts.expiresAt ?? inMinutes(-60),
        startedAt: status === BookingStatus.IN_USE ? inMinutes(-20) : null,
      },
    });
    return b.id;
  }
  async function order(
    outletId: string,
    customerId: string,
    status: OrderStatus,
  ) {
    return prisma.order.create({
      data: {
        orderNumber: `ORD-LEG-${++n}`,
        customerId,
        outletId,
        sourcePlatform: "MOBILE_APP",
        subtotal: 10000,
        totalAmount: 10000,
        status,
      },
    });
  }

  beforeAll(async () => {
    await resetDb(prisma);
    const outlet = await createOutlet(prisma);
    const c = await createCustomer(prisma);
    const m = await Promise.all(
      Array.from({ length: 7 }, () => createMachine(prisma, outlet.id)),
    );
    ids.abandoned = await booking(
      m[0].id,
      c.customer.id,
      BookingStatus.RESERVED,
    );
    ids.active = await booking(m[1].id, c.customer.id, BookingStatus.HOLD, {
      expiresAt: inMinutes(5),
    });
    ids.inUse = await booking(m[2].id, c.customer.id, BookingStatus.IN_USE);
    await prisma.iotCommand.create({
      data: {
        deviceId: m[2].id,
        command: "START_MACHINE",
        status: "RUNNING",
        idempotencyKey: "leg-run-1",
      },
    });
    // Kedaluwarsa tanpa order, TETAPI mesinnya terlihat berjalan → manual.
    ids.abandonedRunning = await booking(
      m[3].id,
      c.customer.id,
      BookingStatus.RESERVED,
    );
    await prisma.iotEvent.create({
      data: { deviceId: m[3].id, eventType: "RUNNING", payload: {} },
    });
    ids.historical = await booking(m[4].id, c.customer.id, BookingStatus.DONE);
    const cancelled = await order(
      outlet.id,
      c.customer.id,
      OrderStatus.CANCELLED,
    );
    ids.closedOrder = await booking(
      m[5].id,
      c.customer.id,
      BookingStatus.RESERVED,
      { orderId: cancelled.id, expiresAt: inMinutes(20) },
    );
    const paid = await order(outlet.id, c.customer.id, OrderStatus.PAID);
    ids.paidLost = await booking(
      m[6].id,
      c.customer.id,
      BookingStatus.CANCELLED,
      { orderId: paid.id },
    );
    await prisma.payment.create({
      data: {
        orderId: cancelled.id,
        paymentNumber: "PG-LEG-1",
        paymentMethod: "QRIS",
        amount: 10000,
        status: "PAID",
        paidAt: new Date(),
      },
    });
  });

  it("dry-run mengklasifikasikan semua kategori tanpa menulis apa pun", async () => {
    const before = await prisma.machineBooking.findMany({
      orderBy: { id: "asc" },
    });
    const r = await buildLegacyBookingReport(prisma);
    const byId = Object.fromEntries(r.findings.map((f) => [f.bookingId, f]));
    expect(byId[ids.abandoned]).toMatchObject({
      category: "ABANDONED_NO_ORDER",
      action: "EXPIRE",
    });
    expect(byId[ids.active]).toMatchObject({
      category: "ACTIVE_NO_ORDER",
      action: "NONE",
    });
    expect(byId[ids.inUse]).toMatchObject({
      category: "IN_USE_NO_ORDER",
      action: "MANUAL_REVIEW",
    });
    expect(byId[ids.inUse].machineEvidence).toMatch(/RUNNING/);
    expect(byId[ids.abandonedRunning]).toMatchObject({
      category: "ABANDONED_NO_ORDER",
      action: "MANUAL_REVIEW",
    });
    expect(byId[ids.historical]).toMatchObject({
      category: "HISTORICAL_NO_ORDER",
      action: "NONE",
    });
    expect(byId[ids.closedOrder]).toMatchObject({
      category: "ACTIVE_CLOSED_ORDER",
      action: "CANCEL",
    });
    expect(byId[ids.paidLost]).toMatchObject({
      category: "PAID_ORDER_BOOKING_LOST",
      action: "MANUAL_REVIEW",
    });
    expect(r.actions).toEqual({
      EXPIRE: 1,
      CANCEL: 1,
      MANUAL_REVIEW: 3,
      NONE: 2,
    });
    expect(r.paidOnClosedOrders).toHaveLength(1);
    expect(
      await prisma.machineBooking.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(before);
  });

  it("skrip CLI dry-run berjalan dan menulis laporan, tanpa mengubah DB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "legacy-"));
    const out = join(dir, "r.json");
    execFileSync(
      "npx",
      ["ts-node", "scripts/reconcile-legacy-bookings.ts", "--out", out],
      {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: "pipe",
      },
    );
    const file = JSON.parse(readFileSync(out, "utf8"));
    expect(file.mode).toBe("DRY_RUN");
    expect(file.report.actions.EXPIRE).toBe(1);
    expect(
      (
        await prisma.machineBooking.findUniqueOrThrow({
          where: { id: ids.abandoned },
        })
      ).status,
    ).toBe(BookingStatus.RESERVED);
    expect(() =>
      execFileSync(
        "npx",
        [
          "ts-node",
          "scripts/reconcile-legacy-bookings.ts",
          "--apply",
          "--out",
          out,
        ],
        { stdio: "pipe" },
      ),
    ).toThrow(); // --apply tanpa --actor ditolak
  }, 120_000);

  it("apply: hanya EXPIRE/CANCEL; IN_USE & bukti mesin jalan tidak disentuh; tanpa hapus; AuditLog; baris berubah dilewati", async () => {
    const counts = async () => ({
      bookings: await prisma.machineBooking.count(),
      orders: await prisma.order.count(),
      payments: await prisma.payment.count(),
    });
    const before = await counts();
    const report = await buildLegacyBookingReport(prisma);
    // Simulasi perubahan setelah dry-run: booking yang mau di-CANCEL berubah status.
    await prisma.machineBooking.update({
      where: { id: ids.closedOrder },
      data: { status: BookingStatus.HOLD },
    });
    const res = await applyLegacyBookingActions(
      prisma,
      report,
      "uji-integrasi",
    );
    expect(res.applied).toEqual([
      {
        bookingId: ids.abandoned,
        from: BookingStatus.RESERVED,
        to: BookingStatus.EXPIRED,
      },
    ]);
    expect(res.skipped).toEqual([
      { bookingId: ids.closedOrder, reason: "status berubah sejak dry-run" },
    ]);

    const status = async (id: string) =>
      (await prisma.machineBooking.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(ids.inUse)).toBe(BookingStatus.IN_USE);
    expect(await status(ids.abandonedRunning)).toBe(BookingStatus.RESERVED);
    expect(await status(ids.active)).toBe(BookingStatus.HOLD);
    expect(await status(ids.paidLost)).toBe(BookingStatus.CANCELLED);
    expect(await counts()).toEqual(before);
    const audit = await prisma.auditLog.findMany({
      where: { entity: "MachineBooking" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "LEGACY_BOOKING_EXPIRE",
      entityId: ids.abandoned,
    });

    // Dry-run ulang → kini usulan CANCEL untuk HOLD atas order batal; apply idempoten.
    const again = await applyLegacyBookingActions(
      prisma,
      await buildLegacyBookingReport(prisma),
      "uji-integrasi",
    );
    expect(again.applied).toEqual([
      {
        bookingId: ids.closedOrder,
        from: BookingStatus.HOLD,
        to: BookingStatus.CANCELLED,
      },
    ]);
    const third = await applyLegacyBookingActions(
      prisma,
      await buildLegacyBookingReport(prisma),
      "uji-integrasi",
    );
    expect(third.applied).toEqual([]);
  });
});

describe("Batch 1.5 — audit outlet staf (PostgreSQL nyata)", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it("mendeteksi staf tanpa outlet / multi-outlet / outlet nonaktif; tidak mengubah data", async () => {
    await resetDb(prisma);
    const o1 = await createOutlet(prisma, "O1");
    const o2 = await createOutlet(prisma, "O2");
    const oOff = await prisma.outlet.update({
      where: { id: (await createOutlet(prisma, "Off")).id },
      data: { isActive: false },
    });
    const owner = await createUser(prisma, UserRole.OWNER);
    const cashierNone = await createUser(
      prisma,
      UserRole.CASHIER,
      "Kasir Tanpa Outlet",
    );
    const cashierMulti = await createUser(
      prisma,
      UserRole.CASHIER,
      "Kasir Dua Outlet",
    );
    const techOff = await createUser(
      prisma,
      UserRole.TECHNICIAN,
      "Teknisi Outlet Mati",
    );
    const adminOk = await createUser(
      prisma,
      UserRole.ADMIN_OUTLET,
      "Admin Dua Outlet",
    );
    const inactive = await prisma.user.update({
      where: {
        id: (await createUser(prisma, UserRole.OPERATOR, "Operator Nonaktif"))
          .id,
      },
      data: { isActive: false },
    });
    await createCustomer(prisma);
    await prisma.outletUser.createMany({
      data: [
        { userId: cashierMulti.id, outletId: o1.id },
        { userId: cashierMulti.id, outletId: o2.id },
        { userId: techOff.id, outletId: oOff.id },
        { userId: adminOk.id, outletId: o1.id },
        { userId: adminOk.id, outletId: o2.id },
      ],
    });
    const before = await prisma.outletUser.count();

    const r = await auditStaffOutlets(prisma);
    const f = (id: string) => r.rows.find((x) => x.userId === id)!.finding;
    expect(f(owner.id)).toBe("OK");
    expect(f(cashierNone.id)).toBe("NO_OUTLET");
    expect(f(cashierMulti.id)).toBe("MULTI_OUTLET_KIOSK_STAFF");
    expect(f(techOff.id)).toBe("INACTIVE_OUTLET_ONLY");
    expect(f(adminOk.id)).toBe("OK");
    expect(f(inactive.id)).toBe("NO_OUTLET");
    expect(r.summary).toMatchObject({
      staffTotal: 6,
      globalAdmins: 1,
      activeNoOutlet: 1,
      activeMultiOutletKioskStaff: 1,
      activeInactiveOutletOnly: 1,
    });
    expect(r.rows.some((x) => x.role === UserRole.CUSTOMER)).toBe(false);
    expect(await prisma.outletUser.count()).toBe(before);
  });
});
