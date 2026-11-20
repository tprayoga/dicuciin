/**
 * Batch 2 — alur rekonsiliasi & refund.
 *
 *   sistem (dana tak bisa diterapkan) ─┐
 *                                      ├─> OPEN/REQUESTED ─approve─> APPROVED ─execute─> REFUNDED
 *   customer (permintaan refund) ──────┘         └─reject─> REJECTED / close─> CLOSED
 *
 * - Customer hanya bisa MENGAJUKAN. Persetujuan & eksekusi hanya SUPER_ADMIN/OWNER.
 * - Eksekusi tepat sekali: baris dikunci (`FOR UPDATE`), transisi APPROVED →
 *   REFUNDED bersyarat, dan kredit saldo memakai idempotencyKey unik di ledger.
 * - Tidak ada refund otomatis ke provider: metode EXTERNAL hanya MENCATAT refund
 *   yang dilakukan admin di luar sistem (dashboard Midtrans / transfer).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReconciliationReason,
  ReconciliationStatus,
  RefundMethod,
  WalletType,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WalletLedgerService } from "../wallets/wallet-ledger.service";
import { releaseBookingForOrderInTx } from "../bookings/booking-lifecycle";
import { restoreVoucherAfterRefundInTx } from "../orders/voucher-refund-policy";
import {
  ORDER_REFUND_REASONS,
  recordReconciliationInTx,
} from "./reconciliation-record";

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
  ) {}

  // ── Customer ────────────────────────────────────────────────────────────
  async requestRefund(userId: string, orderId: string, reason: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer)
      throw new ForbiddenException(
        "Hanya customer yang bisa mengajukan refund",
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== customer.id)
        throw new ForbiddenException("Order bukan milik Anda");
      if (order.status !== OrderStatus.PAID || !order.paidPaymentId) {
        throw new BadRequestException(
          "Refund hanya bisa diajukan untuk order yang sudah dibayar dan belum diproses",
        );
      }
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: order.paidPaymentId },
      });
      const { row, created } = await recordReconciliationInTx(tx, {
        payment,
        order,
        reason: ReconciliationReason.CUSTOMER_REQUEST,
        status: ReconciliationStatus.REQUESTED,
        note: reason,
        requestedBy: userId,
      });
      if (!created)
        throw new ConflictException(
          "Permintaan refund untuk order ini sudah diajukan",
        );
      return this.view(row);
    });
  }

  async listMine(userId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) return [];
    const rows = await this.prisma.paymentReconciliation.findMany({
      where: { customerId: customer.id },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.view(r));
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  async list(params: {
    status?: ReconciliationStatus;
    reason?: ReconciliationReason;
    outletScope: string[] | null;
  }) {
    const rows = await this.prisma.paymentReconciliation.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.outletScope
          ? { order: { outletId: { in: params.outletScope } } }
          : {}),
      },
      include: {
        order: { select: { orderNumber: true, outletId: true, status: true } },
        customer: {
          select: {
            memberCode: true,
            user: { select: { name: true, phone: true } },
          },
        },
        payment: {
          select: {
            paymentNumber: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((r) => this.view(r));
  }

  async history(id: string) {
    return this.prisma.auditLog.findMany({
      where: { entity: "PaymentReconciliation", entityId: id },
      orderBy: { createdAt: "asc" },
    });
  }

  private async lockRow(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM payment_reconciliations WHERE id = ${id} FOR UPDATE`;
    const row = await tx.paymentReconciliation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Data rekonsiliasi tidak ditemukan");
    return row;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    adminUserId: string,
    action: string,
    id: string,
    changes: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action,
        entity: "PaymentReconciliation",
        entityId: id,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  async review(
    id: string,
    adminUserId: string,
    decision: "APPROVE" | "REJECT" | "CLOSE",
    note: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockRow(tx, id);
      const reviewable: ReconciliationStatus[] = [
        ReconciliationStatus.OPEN,
        ReconciliationStatus.REQUESTED,
      ];
      if (!reviewable.includes(row.status)) {
        throw new ConflictException(
          `Status ${row.status} tidak bisa ditinjau lagi`,
        );
      }
      const status =
        decision === "APPROVE"
          ? ReconciliationStatus.APPROVED
          : decision === "REJECT"
            ? ReconciliationStatus.REJECTED
            : ReconciliationStatus.CLOSED;
      const updated = await tx.paymentReconciliation.update({
        where: { id },
        data: {
          status,
          reviewedBy: adminUserId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      await this.audit(tx, adminUserId, `RECONCILIATION_${decision}`, id, {
        from: row.status,
        to: status,
        note,
      });
      return this.view(updated);
    });
  }

  /** Eksekusi refund yang sudah disetujui — TEPAT SEKALI. */
  async execute(
    id: string,
    adminUserId: string,
    method: RefundMethod,
    reference?: string,
    note?: string,
  ) {
    if (method === RefundMethod.EXTERNAL && !reference?.trim()) {
      throw new BadRequestException(
        "Refund EXTERNAL wajib menyertakan referensi (no. refund Midtrans / bukti transfer)",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const pre = await tx.paymentReconciliation.findUnique({
        where: { id },
        select: { orderId: true, topupId: true },
      });
      if (!pre)
        throw new NotFoundException("Data rekonsiliasi tidak ditemukan");
      if (pre.topupId) {
        return this.executeTopupRefund(tx, id, pre.topupId, adminUserId, method, reference, note);
      }
      if (!pre.orderId) {
        throw new ConflictException("Rekonsiliasi tanpa order/top-up tidak dapat dieksekusi");
      }
      const orderId = pre.orderId;
      // Urutan kunci order → rekonsiliasi (sama dengan settlement).
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const row = await this.lockRow(tx, id);
      if (row.status === ReconciliationStatus.REFUNDED) {
        throw new ConflictException("Refund ini sudah dieksekusi");
      }
      if (row.status !== ReconciliationStatus.APPROVED) {
        throw new ConflictException(
          "Refund harus disetujui sebelum dieksekusi",
        );
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { machineBooking: { select: { status: true } } },
      });
      const isOrderRefund = ORDER_REFUND_REASONS.includes(row.reason);
      const paymentId = isOrderRefund ? order.paidPaymentId : row.paymentId;
      if (!paymentId)
        throw new ConflictException("Pembayaran yang direfund tidak ditemukan");
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (payment.status !== PaymentStatus.PAID) {
        throw new ConflictException(
          `Pembayaran berstatus ${payment.status} — tidak bisa direfund`,
        );
      }
      if (isOrderRefund) {
        if (order.status !== OrderStatus.PAID) {
          throw new ConflictException(
            `Order berstatus ${order.status} — tidak bisa direfund lewat alur ini`,
          );
        }
        const used: BookingStatus[] = [
          BookingStatus.IN_USE,
          BookingStatus.DONE,
        ];
        if (
          order.machineBooking &&
          used.includes(order.machineBooking.status)
        ) {
          throw new ConflictException(
            "Mesin sudah dipakai — refund tidak dapat dieksekusi otomatis",
          );
        }
      }

      let executionRef = reference?.trim() ?? null;
      if (method === RefundMethod.WALLET_CREDIT) {
        if (!row.customerId) {
          throw new BadRequestException(
            "Pembayaran tamu (tanpa akun) hanya bisa direfund EXTERNAL",
          );
        }
        const wallet =
          (await tx.wallet.findUnique({
            where: { customerId: row.customerId },
          })) ??
          (await tx.wallet.create({ data: { customerId: row.customerId } }));
        const ledger = await this.walletLedger.credit(WalletType.MAIN_BALANCE, {
          tx,
          walletId: wallet.id,
          amount: row.refundAmount,
          orderId: order.id,
          referenceType: "REFUND",
          referenceId: row.id,
          description: `Refund ${row.reason} order ${order.orderNumber}`,
          // Order refund berbagi kunci dengan refund admin langsung → tidak mungkin dua kali.
          idempotencyKey: isOrderRefund
            ? `refund-order-${order.id}`
            : `refund-recon-${row.id}`,
        });
        executionRef = ledger.id;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          notes: `Direfund (${method}) via rekonsiliasi ${row.id}`,
        },
      });
      if (isOrderRefund) {
        // Batch 4: voucher kembali hanya bila layanan belum dikonsumsi (kebijakan).
        await restoreVoucherAfterRefundInTx(tx, order.id, adminUserId);
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.REFUNDED,
            cancelReason: note ?? row.note ?? "Refund disetujui admin",
          },
        });
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: OrderStatus.REFUNDED,
            notes: `Refund (${row.reason})`,
            createdBy: adminUserId,
          },
        });
        await releaseBookingForOrderInTx(tx, order.id);
      }
      const done = await tx.paymentReconciliation.updateMany({
        where: { id, status: ReconciliationStatus.APPROVED },
        data: {
          status: ReconciliationStatus.REFUNDED,
          refundMethod: method,
          executedBy: adminUserId,
          executedAt: new Date(),
          executionRef,
        },
      });
      if (done.count !== 1)
        throw new ConflictException("Refund ini sudah dieksekusi");
      await this.audit(tx, adminUserId, "RECONCILIATION_EXECUTED", id, {
        method,
        executionRef,
        amount: row.refundAmount.toString(),
        orderRefund: isOrderRefund,
        note,
      });
      return this.view(
        await tx.paymentReconciliation.findUniqueOrThrow({ where: { id } }),
      );
    });
  }

  /**
   * Batch 4 — refund EKSTERNAL atas top-up yang terlambat lunas (saldo sudah
   * dikreditkan). Uang dikembalikan di luar sistem HANYA bersama debit
   * kompensasi saldo sebesar nominal kredit, dalam transaksi yang sama →
   * tidak mungkin saldo tetap bertambah sementara dana juga dikembalikan.
   * Saldo sudah terpakai → ditolak (tidak boleh minus). Tepat sekali: kunci
   * baris rekonsiliasi & top-up, transisi bersyarat, idempotencyKey ledger.
   */
  private async executeTopupRefund(
    tx: Prisma.TransactionClient,
    id: string,
    topupId: string,
    adminUserId: string,
    method: RefundMethod,
    reference?: string,
    note?: string,
  ) {
    if (method !== RefundMethod.EXTERNAL) {
      throw new BadRequestException(
        "Top-up sudah dikreditkan ke saldo — refund hanya EXTERNAL (transfer balik) dengan debit kompensasi",
      );
    }
    const row = await this.lockRow(tx, id);
    if (row.status === ReconciliationStatus.REFUNDED) {
      throw new ConflictException("Refund ini sudah dieksekusi");
    }
    if (row.status !== ReconciliationStatus.APPROVED) {
      throw new ConflictException("Refund harus disetujui sebelum dieksekusi");
    }
    await tx.$queryRaw`SELECT id FROM wallet_topups WHERE id = ${topupId} FOR UPDATE`;
    const topup = await tx.walletTopup.findUniqueOrThrow({ where: { id: topupId } });
    if (topup.status !== "PAID" || !topup.ledgerId) {
      throw new ConflictException(`Top-up berstatus ${topup.status} — tidak bisa direfund`);
    }
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: topup.walletId } });
    if (wallet.balance.lt(topup.amount)) {
      throw new ConflictException(
        "Saldo customer sudah terpakai — kredit top-up tidak bisa dibalik, refund eksternal ditolak",
      );
    }
    // Debit kompensasi (guard saldo cukup di ledger; tidak pernah minus).
    const compensation = await this.walletLedger.debit(WalletType.MAIN_BALANCE, {
      tx,
      walletId: topup.walletId,
      amount: topup.amount,
      referenceType: "TOPUP_REFUND",
      referenceId: topup.id,
      description: `Pembalikan top-up ${topup.topupNumber} (refund eksternal ${reference})`,
      idempotencyKey: `topup-refund-${topup.id}`,
    });
    await tx.walletTopup.update({
      where: { id: topup.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    const done = await tx.paymentReconciliation.updateMany({
      where: { id, status: ReconciliationStatus.APPROVED },
      data: {
        status: ReconciliationStatus.REFUNDED,
        refundMethod: RefundMethod.EXTERNAL,
        refundAmount: topup.chargeAmount,
        executedBy: adminUserId,
        executedAt: new Date(),
        executionRef: reference!.trim(),
      },
    });
    if (done.count !== 1) throw new ConflictException("Refund ini sudah dieksekusi");
    await this.audit(tx, adminUserId, "RECONCILIATION_EXECUTED", id, {
      method: RefundMethod.EXTERNAL,
      executionRef: reference,
      topupId: topup.id,
      compensatingLedgerId: compensation.id,
      debited: topup.amount.toString(),
      refundedToCustomer: topup.chargeAmount.toString(),
      note,
    });
    return this.view(await tx.paymentReconciliation.findUniqueOrThrow({ where: { id } }));
  }

  private view(
    r: { amount: Prisma.Decimal; refundAmount: Prisma.Decimal } & Record<
      string,
      unknown
    >,
  ) {
    return {
      ...r,
      amount: Number(r.amount),
      refundAmount: Number(r.refundAmount),
    };
  }
}
