/**
 * Batch 4 — top-up saldo mandiri lewat Midtrans (QRIS / VA).
 *
 * Prinsip (sama dengan siklus pembayaran order, Batch 2):
 *  - Nominal ditentukan SERVER (min/maks/biaya admin dari konfigurasi).
 *  - Setiap percobaan = `wallet_topups` baris baru dengan `topupNumber` unik
 *    (= order_id Midtrans). Paling banyak SATU top-up PENDING per customer
 *    (`pendingSlot` unik); ganti metode/nominal → percobaan lama dibatalkan
 *    (DB + gateway).
 *  - Saldo dikreditkan HANYA dari pelunasan terverifikasi: webhook bertanda
 *    tangan (signature diverifikasi adaptor) atau status API provider. Respons
 *    "sukses" dari aplikasi tidak pernah dipercaya.
 *  - Kredit TEPAT SEKALI: baris top-up dikunci (`FOR UPDATE`), transisi ke PAID
 *    bersyarat, `ledgerId` unik, dan idempotencyKey ledger `topup-<id>`.
 *  - Pelunasan setelah EXPIRED/CANCELLED (balapan dengan provider) tetap
 *    dikreditkan karena uang benar-benar diterima dan terverifikasi, lalu dicatat
 *    sebagai rekonsiliasi `TOPUP_LATE_SETTLEMENT` untuk ditinjau admin.
 *  - Panggilan jaringan ke gateway tidak pernah di dalam transaksi DB.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TopupStatus, WalletTopup } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toNum } from "../../common/utils/money.util";
import { generateDailySequence } from "../../common/utils/sequence.util";
import { WalletLedgerService } from "../wallets/wallet-ledger.service";
import { CampaignService } from "../campaigns/campaign.service";
import {
  GatewayWebhookResult,
  PAYMENT_GATEWAY,
  PaymentGateway,
} from "./gateway/payment-gateway.interface";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** Default pengembangan — BUKAN kebijakan komersial final (lihat 18-wallet-topup.md). */
export function topupPolicy() {
  return {
    minAmount: num(process.env.TOPUP_MIN_AMOUNT, 10_000),
    maxAmount: num(process.env.TOPUP_MAX_AMOUNT, 1_000_000),
    adminFee: num(process.env.TOPUP_ADMIN_FEE, 0),
    graceMs: num(process.env.PAYMENT_EXPIRY_GRACE_SECONDS, 60) * 1000,
  };
}

const ENDED: TopupStatus[] = [
  TopupStatus.EXPIRED,
  TopupStatus.CANCELLED,
  TopupStatus.FAILED,
];

@Injectable()
export class WalletTopupService {
  private readonly logger = new Logger(WalletTopupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly walletLedger: WalletLedgerService,
    private readonly campaigns: CampaignService,
  ) {}

  private async customerOf(userId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer)
      throw new ForbiddenException("Hanya customer yang bisa top-up saldo");
    return customer.id;
  }

  // ── Permintaan top-up ────────────────────────────────────────────────────
  async requestTopup(
    userId: string,
    input: { amount: number; method: "QRIS" | "VA"; bank?: string },
  ) {
    const policy = topupPolicy();
    const amount = Number(input.amount);
    if (!Number.isInteger(amount))
      throw new BadRequestException(
        "Nominal top-up harus bilangan bulat rupiah",
      );
    if (amount < policy.minAmount || amount > policy.maxAmount) {
      throw new BadRequestException(
        `Nominal top-up harus antara Rp${policy.minAmount.toLocaleString("id-ID")} dan Rp${policy.maxAmount.toLocaleString("id-ID")}`,
      );
    }
    const method = input.method;
    const bank =
      method === "VA" ? (input.bank ?? "").trim().toUpperCase() : null;
    if (method === "VA" && !bank)
      throw new BadRequestException("Pilih bank Virtual Account");
    const customerId = await this.customerOf(userId);
    const wallet = await this.walletLedger.getOrCreateWallet({ customerId });
    const now = new Date();
    const chargeAmount = amount + policy.adminFee;

    // Nomor dibuat di luar transaksi (sequence atomik tersendiri).
    const topupNumber = await generateDailySequence(
      this.prisma,
      "TOP",
      "walletTopup",
      "topupNumber",
      6,
    );

    // Fase 1 — kunci customer: pakai ulang / gantikan percobaan aktif, cadangkan yang baru.
    const phase1 = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
      const active = await tx.walletTopup.findUnique({
        where: { pendingSlot: customerId },
      });
      if (active) {
        if (!active.externalId) {
          throw new ConflictException(
            "Top-up sebelumnya sedang dibuat. Tunggu sebentar lalu coba lagi.",
          );
        }
        const same =
          active.method === method &&
          (active.bank ?? null) === bank &&
          toNum(active.amount) === amount &&
          !!active.expiresAt &&
          active.expiresAt.getTime() > now.getTime() + 30_000;
        if (same)
          return {
            reuse: active as WalletTopup | null,
            superseded: null,
            reserved: null,
          };
        await tx.walletTopup.update({
          where: { id: active.id },
          data: {
            status: TopupStatus.CANCELLED,
            pendingSlot: null,
            cancelledAt: now,
          },
        });
      }
      const reserved = await tx.walletTopup.create({
        data: {
          topupNumber,
          customerId,
          walletId: wallet.id,
          amount: new Prisma.Decimal(amount),
          adminFee: new Prisma.Decimal(policy.adminFee),
          chargeAmount: new Prisma.Decimal(chargeAmount),
          method,
          bank,
          provider: this.gateway.name,
          pendingSlot: customerId,
        },
      });
      return { reuse: null, superseded: active, reserved };
    });
    if (phase1.reuse) return this.view(phase1.reuse);
    const reserved = phase1.reserved!;

    const abandon = (status: TopupStatus) =>
      this.prisma.walletTopup.updateMany({
        where: { id: reserved.id, status: TopupStatus.PENDING },
        data: { status, pendingSlot: null, cancelledAt: new Date() },
      });

    // Fase 2 — batalkan tagihan lama di gateway (bisa ternyata sudah dibayar).
    if (phase1.superseded?.externalId) {
      if (
        (await this.cancelAtGateway(phase1.superseded.topupNumber)) === "PAID"
      ) {
        await this.settle(phase1.superseded.id, "GATEWAY_STATUS");
        await abandon(TopupStatus.CANCELLED);
        throw new ConflictException(
          "Top-up sebelumnya sudah dibayar — saldo sudah ditambahkan.",
        );
      }
    }

    // Fase 3 — buat tagihan (jaringan, di luar transaksi).
    let charge: Awaited<ReturnType<PaymentGateway["createCharge"]>>;
    try {
      charge = await this.gateway.createCharge({
        orderNumber: topupNumber,
        paymentNumber: topupNumber,
        amount: chargeAmount,
        method,
        bank: bank ?? undefined,
      });
    } catch (err) {
      await abandon(TopupStatus.FAILED);
      throw err;
    }

    // Fase 4 — simpan tagihan bila percobaan masih aktif.
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallet_topups WHERE id = ${reserved.id} FOR UPDATE`;
      const row = await tx.walletTopup.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      if (row.status !== TopupStatus.PENDING) return null;
      return tx.walletTopup.update({
        where: { id: reserved.id },
        data: {
          externalId: charge.externalId,
          expiresAt: charge.expiresAt,
          externalResponse: {
            provider: this.gateway.name,
            method,
            qrString: charge.qrString ?? null,
            vaNumber: charge.vaNumber ?? null,
            bank: charge.bank ?? bank ?? null,
            expiresAt: charge.expiresAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    });
    if (!saved) {
      await this.cancelAtGateway(reserved.topupNumber);
      throw new ConflictException(
        "Top-up dibatalkan saat tagihan dibuat. Coba lagi.",
      );
    }
    return this.view(saved);
  }

  // ── Pelunasan (satu-satunya jalur kredit saldo top-up) ───────────────────
  /**
   * Kredit saldo untuk top-up yang pelunasannya TERVERIFIKASI. Idempoten &
   * aman paralel. `source` hanya untuk audit.
   */
  async settle(topupId: string, source: "WEBHOOK" | "GATEWAY_STATUS") {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallet_topups WHERE id = ${topupId} FOR UPDATE`;
      const t = await tx.walletTopup.findUniqueOrThrow({
        where: { id: topupId },
      });
      // Sudah dikredit (PAID) atau kreditnya sudah dibalik (REFUNDED) → no-op.
      if (t.status === TopupStatus.PAID || t.status === TopupStatus.REFUNDED) {
        return { credited: false, topup: t };
      }
      const previous = t.status;

      const ledger = await this.walletLedger.topUp({
        walletId: t.walletId,
        amount: t.amount,
        idempotencyKey: `topup-${t.id}`,
        referenceType: "TOPUP",
        referenceId: t.id,
        description: `Top-up ${t.topupNumber} (${t.method}${t.bank ? ` ${t.bank}` : ""})`,
        tx,
      });
      const updated = await tx.walletTopup.update({
        where: { id: t.id },
        data: {
          status: TopupStatus.PAID,
          paidAt: new Date(),
          pendingSlot: null,
          ledgerId: ledger.id,
        },
      });
      // Cashback top-up hanya bila ada kampanye CASHBACK_TOPUP aktif (default: tidak ada).
      await this.campaigns.handleTopupCashback(tx, {
        customerId: t.customerId,
        walletId: t.walletId,
        topupAmount: toNum(t.amount),
        sourceRefId: ledger.id,
      });
      await tx.auditLog.create({
        data: {
          action: "TOPUP_SETTLED",
          entity: "WalletTopup",
          entityId: t.id,
          changes: {
            from: previous,
            source,
            amount: t.amount.toString(),
            ledgerId: ledger.id,
          },
        },
      });
      if (ENDED.includes(previous)) {
        const created = await tx.paymentReconciliation.createMany({
          data: [
            {
              topupId: t.id,
              customerId: t.customerId,
              amount: t.chargeAmount,
              refundAmount: new Prisma.Decimal(0),
              provider: t.provider,
              providerRef: t.externalId,
              reason: "TOPUP_LATE_SETTLEMENT",
              status: "OPEN",
              note: `Top-up lunas setelah berstatus ${previous}; saldo sudah dikreditkan (terverifikasi ${source})`,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count) {
          const rec = await tx.paymentReconciliation.findUniqueOrThrow({
            where: {
              topupId_reason: {
                topupId: t.id,
                reason: "TOPUP_LATE_SETTLEMENT",
              },
            },
          });
          await tx.auditLog.create({
            data: {
              action: "RECONCILIATION_CREATED",
              entity: "PaymentReconciliation",
              entityId: rec.id,
              changes: {
                reason: "TOPUP_LATE_SETTLEMENT",
                topupId: t.id,
                previousStatus: previous,
                credited: t.amount.toString(),
                ledgerId: ledger.id,
                source,
              },
            },
          });
          this.logger.warn(
            `Top-up ${t.topupNumber} lunas setelah ${previous} — dikreditkan & dicatat untuk rekonsiliasi`,
          );
        }
      }
      return { credited: true, topup: updated };
    });
  }

  private async markEnded(topupId: string, status: TopupStatus) {
    await this.prisma.walletTopup.updateMany({
      where: { id: topupId, status: TopupStatus.PENDING },
      data: { status, pendingSlot: null },
    });
  }

  private async cancelAtGateway(topupNumber: string): Promise<string> {
    if (!this.gateway.cancelCharge) return "UNKNOWN";
    try {
      return await this.gateway.cancelCharge(topupNumber);
    } catch (err) {
      this.logger.warn(
        `Gagal membatalkan tagihan top-up ${topupNumber}: ${(err as Error).message}`,
      );
      return "UNKNOWN";
    }
  }

  // ── Webhook (dipanggil PaymentsService bila order_id bukan pembayaran order) ──
  /** Mengembalikan null bila event bukan milik top-up mana pun. */
  async handleGatewayEvent(event: GatewayWebhookResult) {
    const t = await this.prisma.walletTopup.findFirst({
      where: {
        OR: [
          ...(event.paymentNumber
            ? [{ topupNumber: event.paymentNumber }]
            : []),
          ...(event.externalId ? [{ externalId: event.externalId }] : []),
        ],
      },
    });
    if (!t) return null;
    if (
      event.grossAmount !== undefined &&
      !t.chargeAmount.equals(event.grossAmount)
    ) {
      throw new BadRequestException(
        "Nominal webhook tidak sama dengan nominal top-up",
      );
    }
    if (event.status === "PAID") await this.settle(t.id, "WEBHOOK");
    else if (event.status === "EXPIRED")
      await this.markEnded(t.id, TopupStatus.EXPIRED);
    else if (event.status === "FAILED")
      await this.markEnded(t.id, TopupStatus.FAILED);
    return { received: true };
  }

  // ── Status, sinkronisasi, pembatalan ────────────────────────────────────
  /** Verifikasi top-up PENDING yang lewat batas ke provider (tidak pernah menebak). */
  async syncPending(topupId: string) {
    const t = await this.prisma.walletTopup.findUnique({
      where: { id: topupId },
    });
    if (!t || t.status !== TopupStatus.PENDING) return t?.status ?? null;
    if (!t.externalId) {
      if (Date.now() - t.createdAt.getTime() > 5 * 60_000)
        await this.markEnded(t.id, TopupStatus.FAILED);
      return t.status;
    }
    let status = "PENDING";
    try {
      status = this.gateway.getChargeStatus
        ? await this.gateway.getChargeStatus(t.topupNumber)
        : "PENDING";
      if (status === "PENDING" && this.gateway.cancelCharge)
        status = await this.gateway.cancelCharge(t.topupNumber);
    } catch (err) {
      this.logger.warn(
        `Sinkronisasi top-up ${t.topupNumber} gagal: ${(err as Error).message}`,
      );
      return t.status;
    }
    if (status === "PAID") {
      await this.settle(t.id, "GATEWAY_STATUS");
      return TopupStatus.PAID;
    }
    if (status === "PENDING") return t.status;
    const final =
      status === "FAILED" ? TopupStatus.FAILED : TopupStatus.EXPIRED;
    await this.markEnded(t.id, final);
    return final;
  }

  private async ownTopup(userId: string, topupNumber: string) {
    const customerId = await this.customerOf(userId);
    const t = await this.prisma.walletTopup.findUnique({
      where: { topupNumber },
    });
    if (!t || t.customerId !== customerId)
      throw new NotFoundException("Top-up tidak ditemukan");
    return t;
  }

  async getStatus(userId: string, topupNumber: string) {
    let t = await this.ownTopup(userId, topupNumber);
    if (
      t.status === TopupStatus.PENDING &&
      t.expiresAt &&
      Date.now() > t.expiresAt.getTime() + topupPolicy().graceMs
    ) {
      await this.syncPending(t.id);
      t = await this.prisma.walletTopup.findUniqueOrThrow({
        where: { id: t.id },
      });
    }
    return this.view(t);
  }

  async cancel(userId: string, topupNumber: string) {
    const t = await this.ownTopup(userId, topupNumber);
    if (t.status !== TopupStatus.PENDING) return this.view(t);
    await this.prisma.walletTopup.updateMany({
      where: { id: t.id, status: TopupStatus.PENDING },
      data: {
        status: TopupStatus.CANCELLED,
        pendingSlot: null,
        cancelledAt: new Date(),
      },
    });
    if (
      t.externalId &&
      (await this.cancelAtGateway(t.topupNumber)) === "PAID"
    ) {
      await this.settle(t.id, "GATEWAY_STATUS"); // sudah dibayar → kredit + rekonsiliasi
    }
    return this.view(
      await this.prisma.walletTopup.findUniqueOrThrow({ where: { id: t.id } }),
    );
  }

  async list(userId: string) {
    const customerId = await this.customerOf(userId);
    const rows = await this.prisma.walletTopup.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => this.view(r));
  }

  /** Dev-only (gateway mock): simulasikan pelunasan lewat jalur webhook. */
  async simulatePaid(userId: string, topupNumber: string) {
    if (this.gateway.name !== "mock") {
      throw new ForbiddenException(
        "Simulasi pembayaran hanya tersedia dengan gateway mock",
      );
    }
    const t = await this.ownTopup(userId, topupNumber);
    await this.handleGatewayEvent({
      paymentNumber: t.topupNumber,
      status: "PAID",
    });
    return this.getStatus(userId, topupNumber);
  }

  /** Bentuk respons sama dengan pembayaran order → widget QRIS/VA app dipakai ulang. */
  view(t: WalletTopup) {
    const meta = (t.externalResponse ?? {}) as Record<string, unknown>;
    const now = Date.now();
    return {
      topupNumber: t.topupNumber,
      paymentNumber: t.topupNumber,
      method: t.method === "QRIS" ? "QRIS" : "TRANSFER",
      amount: toNum(t.chargeAmount),
      creditAmount: toNum(t.amount),
      adminFee: toNum(t.adminFee),
      status: t.status,
      qrString: (meta.qrString as string | null) ?? null,
      vaNumber: (meta.vaNumber as string | null) ?? null,
      bank: (meta.bank as string | null) ?? t.bank,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      serverTime: new Date(now).toISOString(),
      secondsRemaining:
        t.status === TopupStatus.PENDING && t.expiresAt
          ? Math.max(0, Math.floor((t.expiresAt.getTime() - now) / 1000))
          : 0,
      canRetry: ENDED.includes(t.status),
      paidAt: t.paidAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
