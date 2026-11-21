/**
 * Audit penugasan outlet staf (Batch 1.5, Prioritas 4). BACA-SAJA.
 *
 * Sejak Batch 1, staf non-global (ADMIN_OUTLET, CASHIER, OPERATOR, TECHNICIAN)
 * hanya melihat order/dashboard/laporan outlet yang ditugaskan lewat
 * `outlet_users`. Staf tanpa penugasan menerima 403 (gagal aman). Audit ini
 * mendaftar akun yang terdampak agar owner menugaskan outlet SEBELUM deploy.
 * Tidak ada penugasan otomatis: data penugasan yang benar hanya diketahui owner.
 */
import { PrismaClient, UserRole } from "@prisma/client";
import { GLOBAL_ROLES, STAFF_ROLES } from "./access-policy";

export type StaffOutletFinding =
  | "NO_OUTLET" // akan 403 di daftar order, dashboard, laporan keuangan
  | "MULTI_OUTLET_KIOSK_STAFF" // mode kiosk staf (/kiosks/assigned) mensyaratkan tepat 1 outlet
  | "INACTIVE_OUTLET_ONLY" // hanya ditugaskan ke outlet nonaktif
  | "OK";

export interface StaffOutletRow {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  outlets: { id: string; name: string; isActive: boolean }[];
  finding: StaffOutletFinding;
  impact: string;
}

export async function auditStaffOutlets(prisma: PrismaClient) {
  const scoped = STAFF_ROLES.filter((r) => !GLOBAL_ROLES.includes(r));
  const users = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      outletUsers: {
        select: {
          outlet: { select: { id: true, name: true, isActive: true } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const rows: StaffOutletRow[] = users.map((u) => {
    const outlets = u.outletUsers.map((ou) => ou.outlet);
    let finding: StaffOutletFinding = "OK";
    let impact = GLOBAL_ROLES.includes(u.role)
      ? "Akses global (tidak bergantung penugasan outlet)."
      : `Akses laporan: ${outlets.map((o) => o.name).join(", ")}.`;
    if (scoped.includes(u.role)) {
      if (outlets.length === 0) {
        finding = "NO_OUTLET";
        impact =
          "403 pada daftar order, dashboard, dan laporan keuangan; tidak bisa membuka kiosk staf.";
      } else if (outlets.every((o) => !o.isActive)) {
        finding = "INACTIVE_OUTLET_ONLY";
        impact = "Hanya terhubung ke outlet nonaktif — laporan kosong.";
      } else if (
        outlets.length > 1 &&
        (u.role === UserRole.CASHIER || u.role === UserRole.OPERATOR)
      ) {
        finding = "MULTI_OUTLET_KIOSK_STAFF";
        impact =
          "Laporan = gabungan outlet; mode kiosk staf menolak (harus tepat 1 outlet).";
      }
    }
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      outlets,
      finding,
      impact,
    };
  });

  const count = (f: StaffOutletFinding) =>
    rows.filter((r) => r.finding === f && r.isActive).length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      staffTotal: rows.length,
      globalAdmins: rows.filter((r) => GLOBAL_ROLES.includes(r.role)).length,
      activeNoOutlet: count("NO_OUTLET"),
      activeMultiOutletKioskStaff: count("MULTI_OUTLET_KIOSK_STAFF"),
      activeInactiveOutletOnly: count("INACTIVE_OUTLET_ONLY"),
      byRoleNoOutlet: Object.fromEntries(
        scoped.map((r) => [
          r,
          rows.filter(
            (x) => x.role === r && x.finding === "NO_OUTLET" && x.isActive,
          ).length,
        ]),
      ),
    },
    rows,
  };
}
