/**
 * Batch 4 — kebijakan voucher saat refund (PostgreSQL nyata): voucher kembali
 * hanya bila layanan belum dikonsumsi & voucher masih berlaku; diaudit; idempoten.
 */
import { Test } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { WalletsService } from "../../src/modules/wallets/wallets.service";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { ReconciliationService } from "../../src/modules/payments/reconciliation.service";
import { restoreVoucherAfterRefundInTx } from "../../src/modules/orders/voucher-refund-policy";
import {
  createCustomer,
  createMachine,
  createOutlet,
  createUser,
  resetDb,
} from "./helpers";

describe("Batch 4 — kebijakan voucher saat refund (PostgreSQL nyata)", () => {
  let prisma: PrismaService;
  let wallets: WalletsService;
  let recon: ReconciliationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        WalletsService,
        WalletLedgerService,
        ReconciliationService,
        { provide: PromosService, useValue: { commitUsage: jest.fn() } },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    wallets = moduleRef.get(WalletsService);
    recon = moduleRef.get(ReconciliationService);
  });
  afterAll(() => prisma.$disconnect());

  let outlet: any, owner: any;
  beforeEach(async () => {
    await resetDb(prisma);
    delete process.env.REFUND_RESTORE_VOUCHER;
    outlet = await createOutlet(prisma);
    owner = await createUser(prisma, UserRole.OWNER);
  });

  let n = 0;
  /** Order PAID (saldo) yang memakai voucher (redemption APPLIED), opsional booking mesin. */
  async function paidOrderWithVoucher(
    opts: {
      booking?: "RESERVED" | "IN_USE";
      started?: boolean;
      voucherExpired?: boolean;
    } = {},
  ) {
    const c = await createCustomer(prisma, { balance: 0 });
    const tpl = await prisma.voucherTemplate.create({
      data: {
        code: `V-${++n}-${Date.now()}`,
        name: "Hemat",
        voucherType: "NOMINAL_DISCOUNT",
        value: new Prisma.Decimal(5000),
      },
    });
    const uv = await prisma.userVoucher.create({
      data: {
        templateId: tpl.id,
        customerId: c.customer.id,
        segment: "RETAIL",
        code: `UV-${n}-${Date.now()}`,
        status: "USED",
        usedAt: new Date(),
        expiresAt: opts.voucherExpired ? new Date(Date.now() - 60_000) : null,
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-V-${n}`,
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        subtotal: 20000,
        discountAmount: 5000,
        totalAmount: 15000,
        status: "DRAFT",
      },
    });
    const pay = await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentNumber: `PAY-${order.orderNumber}`,
        paymentMethod: "WALLET",
        amount: 15000,
        status: "PAID",
        paidAt: new Date(),
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidPaymentId: pay.id },
    });
    await prisma.voucherRedemption.create({
      data: {
        userVoucherId: uv.id,
        orderId: order.id,
        customerId: c.customer.id,
        discountApplied: 5000,
        status: "APPLIED",
      },
    });
    if (opts.booking) {
      const m = await createMachine(prisma, outlet.id);
      await prisma.machineBooking.create({
        data: {
          deviceId: m.id,
          customerId: c.customer.id,
          orderId: order.id,
          bookingCode: `BK-V-${n}`,
          status: opts.booking,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      if (opts.started) {
        await prisma.iotCommand.create({
          data: {
            deviceId: m.id,
            orderId: order.id,
            command: "START_MACHINE",
            status: "PUBLISHED",
            idempotencyKey: `start-machine-${order.id}`,
          },
        });
      }
    }
    return { c, order, uv };
  }
  const voucher = (id: string) =>
    prisma.userVoucher.findUniqueOrThrow({ where: { id } });
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action } });

  it("refund admin, layanan belum dipakai → voucher ACTIVE kembali, redemption REVERSED, diaudit", async () => {
    const { order, uv } = await paidOrderWithVoucher({ booking: "RESERVED" });
    await wallets.refundByAdmin(
      order.id,
      owner.id,
      "mesin rusak sebelum dipakai",
    );
    expect((await voucher(uv.id)).status).toBe("ACTIVE");
    expect(
      (
        await prisma.voucherRedemption.findUniqueOrThrow({
          where: { orderId: order.id },
        })
      ).status,
    ).toBe("REVERSED");
    expect(await audits("VOUCHER_RESTORED")).toHaveLength(1);
  });

  it("START mesin sudah terkirim (layanan dikonsumsi) → refund tetap jalan, voucher TIDAK kembali", async () => {
    const { order, uv } = await paidOrderWithVoucher({
      booking: "RESERVED",
      started: true,
    });
    await wallets.refundByAdmin(order.id, owner.id, "refund kebijakan");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("REFUNDED");
    expect((await voucher(uv.id)).status).toBe("USED");
    const skipped = await audits("VOUCHER_RESTORE_SKIPPED");
    expect(skipped).toHaveLength(1);
    expect((skipped[0].changes as any).reason).toBe("SERVICE_CONSUMED");
  });

  it("kebijakan dimatikan (REFUND_RESTORE_VOUCHER=false) → voucher tidak kembali, alasan tercatat", async () => {
    process.env.REFUND_RESTORE_VOUCHER = "false";
    const { order, uv } = await paidOrderWithVoucher();
    await wallets.refundByAdmin(order.id, owner.id, "refund");
    expect((await voucher(uv.id)).status).toBe("USED");
    expect(
      ((await audits("VOUCHER_RESTORE_SKIPPED"))[0].changes as any).reason,
    ).toBe("POLICY_DISABLED");
  });

  it("voucher sudah kedaluwarsa → tidak dikembalikan", async () => {
    const { order, uv } = await paidOrderWithVoucher({ voucherExpired: true });
    await wallets.refundByAdmin(order.id, owner.id, "refund");
    expect((await voucher(uv.id)).status).toBe("USED");
    expect(
      ((await audits("VOUCHER_RESTORE_SKIPPED"))[0].changes as any).reason,
    ).toBe("VOUCHER_EXPIRED");
  });

  it("alur rekonsiliasi (permintaan customer → setujui → eksekusi) memakai kebijakan yang sama", async () => {
    const { c, order, uv } = await paidOrderWithVoucher({
      booking: "RESERVED",
    });
    const r = await recon.requestRefund(
      c.user.id,
      order.id,
      "batal datang ke outlet",
    );
    await recon.review((r as any).id, owner.id, "APPROVE", "ok");
    await recon.execute((r as any).id, owner.id, "WALLET_CREDIT");
    expect((await voucher(uv.id)).status).toBe("ACTIVE");
  });

  it("idempoten: pemulihan dipanggil dua kali → sekali saja", async () => {
    const { order } = await paidOrderWithVoucher();
    const results = await prisma.$transaction(async (tx) => [
      await restoreVoucherAfterRefundInTx(tx, order.id, owner.id),
      await restoreVoucherAfterRefundInTx(tx, order.id, owner.id),
    ]);
    expect(results[0]).toEqual({ restored: true });
    expect(results[1]).toEqual({
      restored: false,
      reason: "NO_APPLIED_VOUCHER",
    });
    expect(await audits("VOUCHER_RESTORED")).toHaveLength(1);
  });
});
