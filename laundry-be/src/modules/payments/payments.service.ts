import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReconciliationReason,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from '../../common/utils/money.util';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from './gateway/payment-gateway.interface';
import { CreateGatewayPaymentDto, PaymentWebhookDto } from './dto/payment.dto';
import { PromosService } from '../promos/promos.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { CampaignService } from '../campaigns/campaign.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';
import { IotMachineService } from '../iot/iot-machine.service';
import {
  bookingConfig,
  findConflictingBooking,
  lockDevice,
  promoteBookingOnPaidInTx,
} from '../bookings/booking-lifecycle';
import { recordReconciliationInTx } from './reconciliation-record';
import { WalletTopupService } from './wallet-topup.service';
import { confirmOrderPricingInTx } from '../orders/pricing-reservation';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private promosService: PromosService,
    private walletLedger: WalletLedgerService,
    private pointService: PointService,
    private membershipTierService: MembershipTierService,
    private b2bPartnerService: B2BPartnerService,
    private campaignService: CampaignService,
    private loyaltyConfig: LoyaltyConfigService,
    private iotMachineService: IotMachineService,
    // Batch 4: webhook top-up saldo memakai endpoint Midtrans yang sama.
    @Optional() private topups?: WalletTopupService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════
  // Batch 2 — siklus hidup pembayaran (T4/T5)
  //
  //  Satu order → banyak PERCOBAAN pembayaran (riwayat lengkap), tetapi:
  //   - paling banyak SATU percobaan PENDING (`payments.pendingSlot` unik);
  //   - paling banyak SATU pembayaran yang melunasi (`orders.paidPaymentId` unik);
  //   - dana lain yang tetap masuk → `payment_reconciliations` (refund).
  //  Setiap perubahan mengunci baris order (`SELECT … FOR UPDATE`). Panggilan
  //  ke gateway (jaringan) TIDAK dilakukan di dalam transaksi DB; hasilnya
  //  diperiksa ulang di bawah kunci sesudahnya.
  // ══════════════════════════════════════════════════════════════════════

  private get expiryGraceMs() {
    const n = Number(process.env.PAYMENT_EXPIRY_GRACE_SECONDS);
    return (Number.isFinite(n) && n >= 0 ? n : 60) * 1000;
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { machineBooking: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private assertPayable(order: { status: OrderStatus }) {
    if (order.status === OrderStatus.PAID) {
      throw new ConflictException('Order sudah dibayar');
    }
    if (
      order.status !== OrderStatus.DRAFT &&
      order.status !== OrderStatus.WAITING_PAYMENT
    ) {
      throw new BadRequestException(
        `Order berstatus ${order.status} tidak bisa dibayar`,
      );
    }
  }

  /**
   * Booking mesin order (bila ada) harus masih bisa dipertahankan sebelum
   * menagih pelanggan. HOLD yang kedaluwarsa diperpanjang hanya bila slotnya
   * belum diambil orang lain.
   */
  private async assertBookingHoldable(
    tx: Prisma.TransactionClient,
    order: { machineBooking: { id: string; status: BookingStatus; deviceId: string; scheduledAt: Date | null; expiresAt: Date; durationMinutes: number | null } | null },
    now: Date,
  ) {
    const b = order.machineBooking;
    if (!b) return;
    if (b.status !== BookingStatus.HOLD) {
      throw new ConflictException(
        'Booking mesin untuk order ini sudah tidak berlaku. Silakan buat pesanan baru.',
      );
    }
    if (b.expiresAt.getTime() > now.getTime()) return;
    await lockDevice(tx, b.deviceId);
    const conflict = await findConflictingBooking(
      tx,
      b.deviceId,
      b.scheduledAt ?? now,
      now,
      b.id,
      b.durationMinutes,
    );
    if (conflict) {
      throw new ConflictException(
        'Slot mesin sudah diambil pelanggan lain. Silakan buat pesanan baru.',
      );
    }
    await tx.machineBooking.update({
      where: { id: b.id },
      data: {
        expiresAt: new Date(now.getTime() + bookingConfig().holdMinutes * 60_000),
      },
    });
  }

  /** Tandai percobaan aktif sebagai CANCELLED (DB) — pembatalan di gateway menyusul. */
  private async supersedeActiveAttempt(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const active = await tx.payment.findUnique({ where: { pendingSlot: orderId } });
    if (!active) return null;
    if (!active.externalId && active.paymentMethod !== PaymentMethod.WALLET) {
      throw new ConflictException(
        'Tagihan sedang dibuat. Tunggu beberapa detik lalu coba lagi.',
      );
    }
    await tx.payment.update({
      where: { id: active.id },
      data: {
        status: PaymentStatus.CANCELLED,
        pendingSlot: null,
        cancelledAt: new Date(),
      },
    });
    return active;
  }

  /**
   * Batalkan tagihan lama di gateway. Bila ternyata SUDAH dibayar (balapan),
   * pembayaran itu di-settle (uang nyata) dan `true` dikembalikan.
   */
  private async cancelAtGatewayOrSettle(paymentNumber: string, paymentId: string) {
    if (!this.gateway.cancelCharge) return false;
    let status: string;
    try {
      status = await this.gateway.cancelCharge(paymentNumber);
    } catch (err) {
      this.logger.warn(
        `Gagal membatalkan tagihan ${paymentNumber} di gateway: ${(err as Error).message} — bila tetap dibayar akan tercatat untuk rekonsiliasi`,
      );
      return false;
    }
    if (status === 'PAID') {
      await this.settlePaid(paymentId);
      return true;
    }
    return false;
  }

  /**
   * Minta tagihan QRIS/VA untuk order (mobile & kiosk). Idempoten untuk metode
   * yang sama; mengganti metode/bank → percobaan lama dibatalkan (DB + gateway)
   * dan percobaan baru dengan nomor unik dibuat.
   */
  async requestGatewayCharge(
    orderId: string,
    dto: CreateGatewayPaymentDto,
    owner: { userId?: string; kioskId?: string },
  ) {
    const method = dto.method;
    const bank = method === 'VA' ? (dto.bank ?? '').trim().toUpperCase() : null;
    const now = new Date();

    // Fase 1 — di bawah kunci order: validasi, pakai ulang atau ganti percobaan.
    const phase1 = await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (owner.kioskId) {
        if (order.kioskId !== owner.kioskId || order.sourcePlatform !== 'KIOSK') {
          throw new ForbiddenException('Order bukan milik kiosk ini');
        }
      } else {
        const c = order.customerId
          ? await tx.customer.findUnique({ where: { id: order.customerId }, select: { userId: true } })
          : null;
        if (!c || c.userId !== owner.userId) {
          throw new ForbiddenException('Order bukan milik Anda');
        }
      }
      this.assertPayable(order);

      const active = await tx.payment.findUnique({ where: { pendingSlot: orderId } });
      if (active && active.externalId && active.paymentMethod !== PaymentMethod.WALLET) {
        const meta = (active.externalResponse ?? {}) as Record<string, unknown>;
        const sameMethod =
          (meta.method as string | undefined) === method &&
          (method !== 'VA' || String(meta.bank ?? '').toUpperCase() === bank);
        const fresh =
          !!active.expiresAt && active.expiresAt.getTime() > now.getTime() + 30_000;
        if (sameMethod && fresh) return { reuse: active as typeof active | null };
      }

      await this.assertBookingHoldable(tx, order, now);
      const superseded = await this.supersedeActiveAttempt(tx, orderId);
      const attempt =
        (await tx.payment.count({
          where: { orderId, paymentNumber: { startsWith: `PG-${order.orderNumber}` } },
        })) + 1;
      const paymentNumber =
        attempt === 1 ? `PG-${order.orderNumber}` : `PG-${order.orderNumber}-${attempt}`;
      const reserved = await tx.payment.create({
        data: {
          orderId,
          paymentNumber,
          paymentMethod: method === 'QRIS' ? PaymentMethod.QRIS : PaymentMethod.TRANSFER,
          amount: order.totalAmount,
          status: PaymentStatus.PENDING,
          pendingSlot: orderId,
          provider: this.gateway.name,
          notes: `Percobaan ${attempt} (${method}${bank ? ` ${bank}` : ''})`,
        },
      });
      return { reuse: null, order, superseded, reserved };
    });
    if (phase1.reuse) return this.toPaymentView(phase1.reuse);
    const { order, superseded, reserved } = phase1 as Exclude<typeof phase1, { order?: undefined }>;

    const abandonReserved = async (status: PaymentStatus, note: string) => {
      await this.prisma.payment.updateMany({
        where: { id: reserved.id, status: PaymentStatus.PENDING },
        data: { status, pendingSlot: null, cancelledAt: new Date(), notes: note },
      });
    };

    // Fase 2 — batalkan tagihan lama di gateway (bisa ternyata sudah dibayar).
    if (superseded && superseded.paymentMethod !== PaymentMethod.WALLET) {
      if (await this.cancelAtGatewayOrSettle(superseded.paymentNumber, superseded.id)) {
        await abandonReserved(PaymentStatus.CANCELLED, 'Dibatalkan: tagihan sebelumnya sudah dibayar');
        throw new ConflictException('Order sudah dibayar dengan tagihan sebelumnya');
      }
    }

    // Fase 3 — buat tagihan di gateway (jaringan, di luar transaksi).
    let charge: Awaited<ReturnType<PaymentGateway['createCharge']>>;
    try {
      charge = await this.gateway.createCharge({
        orderNumber: order.orderNumber,
        paymentNumber: reserved.paymentNumber,
        amount: toNum(order.totalAmount),
        method,
        bank: bank ?? undefined,
      });
    } catch (err) {
      await abandonReserved(PaymentStatus.FAILED, `Gagal membuat tagihan: ${(err as Error).message}`);
      throw err;
    }

    // Fase 4 — simpan tagihan; periksa ulang order di bawah kunci.
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockOrder(tx, orderId);
      const row = await tx.payment.findUniqueOrThrow({ where: { id: reserved.id } });
      if (row.status !== PaymentStatus.PENDING || current.status !== order.status) {
        return null;
      }
      const updated = await tx.payment.update({
        where: { id: reserved.id },
        data: {
          externalId: charge.externalId,
          expiresAt: charge.expiresAt,
          notes: row.notes,
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
      // HOLD mesin bertahan selama tagihan masih bisa dibayar.
      await tx.machineBooking.updateMany({
        where: {
          orderId,
          status: BookingStatus.HOLD,
          expiresAt: { lt: new Date(charge.expiresAt.getTime() + this.expiryGraceMs) },
        },
        data: { expiresAt: new Date(charge.expiresAt.getTime() + this.expiryGraceMs) },
      });
      return updated;
    });
    if (!saved) {
      // Order berubah selama tagihan dibuat (mis. dibayar via tagihan lama) →
      // tagihan baru dibatalkan; bila tetap dibayar → rekonsiliasi.
      await abandonReserved(PaymentStatus.CANCELLED, 'Dibatalkan: order berubah saat tagihan dibuat');
      await this.cancelAtGatewayOrSettle(reserved.paymentNumber, reserved.id);
      throw new ConflictException('Status order berubah. Muat ulang halaman pembayaran.');
    }
    return this.toPaymentView(saved);
  }

  /** Buat tagihan QRIS/VA (mobile). */
  async createGatewayPayment(userId: string, dto: CreateGatewayPaymentDto) {
    return this.requestGatewayCharge(dto.orderId, dto, { userId });
  }

  /** Buat tagihan QRIS/VA untuk order kiosk (tamu). */
  async createKioskGatewayPayment(
    orderId: string,
    dto: CreateGatewayPaymentDto,
    kioskId: string,
  ) {
    return this.requestGatewayCharge(orderId, dto, { kioskId });
  }

  /**
   * Status pembayaran untuk polling. Kedaluwarsa ditentukan SERVER: percobaan
   * PENDING yang lewat `expiresAt` (+ toleransi) diverifikasi ke gateway dulu
   * — bisa ternyata PAID — sebelum dinyatakan EXPIRED.
   */
  async getStatus(paymentNumber: string) {
    let payment = await this.prisma.payment.findUnique({ where: { paymentNumber } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (
      payment.status === PaymentStatus.PENDING &&
      payment.expiresAt &&
      Date.now() > payment.expiresAt.getTime() + this.expiryGraceMs
    ) {
      await this.syncPendingPayment(payment.id);
      payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }
    return this.toPaymentView(payment);
  }

  /**
   * Sinkronkan satu percobaan PENDING yang sudah lewat waktu dengan gateway.
   * Idempoten & aman paralel (settle/ubah status hanya dari PENDING).
   */
  async syncPendingPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.PENDING) return payment?.status ?? null;
    if (!payment.externalId) {
      // Percobaan yang tertinggal saat pembuatan tagihan (crash di tengah).
      if (Date.now() - payment.createdAt.getTime() < 5 * 60_000) return payment.status;
      await this.markAttempt(payment.id, PaymentStatus.FAILED);
      return PaymentStatus.FAILED;
    }
    let status: string = 'PENDING';
    try {
      status = this.gateway.getChargeStatus
        ? await this.gateway.getChargeStatus(payment.paymentNumber)
        : 'PENDING';
      if (status === 'PENDING' && this.gateway.cancelCharge) {
        // Lewat batas waktu tetapi provider masih PENDING → paksa expire.
        status = await this.gateway.cancelCharge(payment.paymentNumber);
      }
    } catch (err) {
      this.logger.warn(
        `Sinkronisasi ${payment.paymentNumber} gagal: ${(err as Error).message} — dicoba lagi oleh scheduler`,
      );
      return payment.status;
    }
    if (status === 'PAID') {
      await this.settlePaid(payment.id);
      return PaymentStatus.PAID;
    }
    if (status === 'PENDING') return payment.status;
    const final = status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.EXPIRED;
    await this.markAttempt(payment.id, final);
    return final;
  }

  /** Status akhir non-lunas (hanya dari PENDING; tidak pernah menimpa PAID). */
  private async markAttempt(paymentId: string, status: PaymentStatus) {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status, pendingSlot: null },
    });
  }

  /** Callback generik (HANYA gateway mock / pengembangan). */
  async handleWebhook(dto: PaymentWebhookDto) {
    this.assertMockGateway();
    const payment = await this.prisma.payment.findFirst({
      where: { externalId: dto.externalId },
    });
    if (!payment) {
      const topup = await this.topups?.handleGatewayEvent({ externalId: dto.externalId, status: dto.status });
      if (topup) return topup;
      throw new NotFoundException('Payment not found');
    }
    if (dto.status === 'PAID') {
      await this.settlePaid(payment.id);
    } else {
      await this.markAttempt(
        payment.id,
        dto.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.EXPIRED,
      );
    }
    return { received: true };
  }

  /** Webhook asli provider: signature diverifikasi oleh implementasi gateway. */
  async handleProviderWebhook(payload: Record<string, unknown>) {
    if (!this.gateway.parseWebhook) {
      throw new BadRequestException(
        `Gateway ${this.gateway.name} tidak mendukung webhook provider`,
      );
    }
    const event = this.gateway.parseWebhook(payload);
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(event.paymentNumber
            ? [{ paymentNumber: event.paymentNumber }]
            : []),
          ...(event.externalId ? [{ externalId: event.externalId }] : []),
        ],
      },
    });
    if (!payment) {
      // Batch 4: order_id top-up saldo (TOP-…) → layanan top-up.
      const topup = await this.topups?.handleGatewayEvent(event);
      if (topup) return topup;
      // Signature sah tetapi transaksinya bukan milik kita (mis. "Test
      // notification URL" dari dashboard Midtrans) → 200, tidak mengubah apa pun.
      this.logger.warn(
        `Webhook untuk pembayaran tak dikenal diabaikan (order_id=${event.paymentNumber ?? '-'}, transaction_id=${event.externalId ?? '-'})`,
      );
      return { received: true, ignored: true };
    }
    if (
      event.grossAmount !== undefined &&
      !payment.amount.equals(event.grossAmount)
    ) {
      throw new BadRequestException(
        'Nominal webhook tidak sama dengan nominal pembayaran',
      );
    }
    if (event.status === 'PAID') {
      await this.settlePaid(payment.id);
    } else if (event.status !== 'PENDING') {
      await this.markAttempt(
        payment.id,
        event.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.EXPIRED,
      );
    }
    return { received: true };
  }

  /** Simulasi & callback generik hanya untuk gateway tiruan (bukan Midtrans). */
  private assertMockGateway() {
    if (this.gateway.name !== 'mock') {
      throw new ForbiddenException(
        'Simulasi pembayaran hanya tersedia dengan gateway mock',
      );
    }
  }

  /** Dev-only: simulasikan gateway mengonfirmasi pembayaran berhasil. */
  async simulatePaid(paymentNumber: string) {
    this.assertMockGateway();
    const payment = await this.prisma.payment.findUnique({
      where: { paymentNumber },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.externalId) {
      throw new BadRequestException('Pembayaran ini bukan via gateway');
    }
    return this.handleWebhook({
      externalId: payment.externalId,
      status: 'PAID',
    });
  }

  /**
   * SATU-SATUNYA tempat order menjadi PAID dari sebuah pembayaran. Di dalam
   * transaksi pemanggil, mengunci baris order. Idempoten (pembayaran yang sudah
   * PAID/REFUNDED dilewati). Dana yang tidak bisa diterapkan dicatat sebagai
   * rekonsiliasi — tidak pernah melunasi order dua kali.
   */
  private async settlePaidInTx(
    tx: Prisma.TransactionClient,
    paymentId: string,
    note = 'Dibayar via payment gateway',
  ): Promise<{ paidOrderId: string | null; supersededAttempts: { id: string; paymentNumber: string }[] }> {
    const none = { paidOrderId: null, supersededAttempts: [] };
    const first = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (first.status === PaymentStatus.PAID || first.status === PaymentStatus.REFUNDED) {
      return none;
    }
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${first.orderId} FOR UPDATE`;
    // Baca ulang di bawah kunci (webhook paralel untuk pembayaran yang sama).
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
      return none;
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PAID, paidAt: new Date(), pendingSlot: null },
    });

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          status: order.status,
          notes: `Pembayaran ${payment.paymentNumber} diterima setelah order ${order.status} — PERLU REFUND MANUAL`,
        },
      });
      await recordReconciliationInTx(tx, {
        payment,
        order,
        reason: ReconciliationReason.PAID_AFTER_CANCEL,
        note: `Dana masuk setelah order ${order.status}`,
      });
      this.logger.error(
        `Pembayaran ${payment.paymentNumber} diterima untuk order ${order.orderNumber} berstatus ${order.status} — perlu refund manual`,
      );
      return none;
    }
    if (
      order.paidPaymentId ||
      (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.WAITING_PAYMENT)
    ) {
      await recordReconciliationInTx(tx, {
        payment,
        order,
        reason: ReconciliationReason.DUPLICATE_PAYMENT,
        note: `Order ${order.orderNumber} sudah dilunasi pembayaran lain`,
      });
      this.logger.error(
        `Pembayaran ganda ${payment.paymentNumber} untuk order ${order.orderNumber} — dicatat untuk refund`,
      );
      return none;
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID, paidPaymentId: payment.id },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        status: OrderStatus.PAID,
        notes: note,
        createdBy: order.customerId ?? undefined,
      },
    });

    // Percobaan lain yang masih aktif tidak lagi berlaku.
    const others = await tx.payment.findMany({
      where: { orderId: order.id, status: PaymentStatus.PENDING, id: { not: payment.id } },
      select: { id: true, paymentNumber: true, externalId: true },
    });
    if (others.length) {
      await tx.payment.updateMany({
        where: { id: { in: others.map((o) => o.id) }, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELLED, pendingSlot: null, cancelledAt: new Date() },
      });
    }

    await this.promosService.commitUsage(tx, order.id);
    // Batch 3: voucher (RESERVED → APPLIED) & pemakaian aturan B2B — reservasi
    // sudah dipegang sejak order dibuat, jadi pelunasan tidak pernah gagal di sini.
    await confirmOrderPricingInTx(tx, order);
    await this.settlePromotionLoyalty(tx, order);

    const promotion = await promoteBookingOnPaidInTx(tx, order.id);
    if (promotion.bookingId && !promotion.promoted) {
      await recordReconciliationInTx(tx, {
        payment,
        order,
        reason: ReconciliationReason.PAID_BOOKING_UNAVAILABLE,
        note: 'Order dibayar tetapi slot mesin sudah tidak tersedia — jadwalkan ulang atau refund',
      });
      this.logger.error(
        `Order ${order.orderNumber} PAID tetapi booking ${promotion.bookingId} tidak bisa dipertahankan (slot terambil) — perlu tindak lanjut admin`,
      );
    }
    return {
      paidOrderId: order.id,
      supersededAttempts: others.filter((o) => o.externalId).map((o) => ({ id: o.id, paymentNumber: o.paymentNumber })),
    };
  }

  private async settlePaid(paymentId: string) {
    const result = await this.prisma.$transaction((tx) =>
      this.settlePaidInTx(tx, paymentId),
    );
    await this.afterSettled(result);
  }

  /**
   * Batalkan di gateway percobaan yang sudah ditandai CANCELLED di DB (mis.
   * order dibatalkan). Bila ternyata sudah dibayar → settle → rekonsiliasi.
   */
  async cancelAttemptsAtGateway(attempts: { id: string; paymentNumber: string }[]) {
    for (const a of attempts) {
      await this.cancelAtGatewayOrSettle(a.paymentNumber, a.id);
    }
  }

  /** Efek setelah commit: batalkan tagihan lain di gateway + aktivasi mesin. */
  private async afterSettled(result: { paidOrderId: string | null; supersededAttempts: { id: string; paymentNumber: string }[] }) {
    for (const a of result.supersededAttempts) {
      await this.cancelAtGatewayOrSettle(a.paymentNumber, a.id);
    }
    if (result.paidOrderId) {
      await this.iotMachineService.activateMachineForOrder(result.paidOrderId);
    }
  }

  /**
   * Bayar order YANG SUDAH ADA memakai saldo (BONUS dulu, lalu MAIN) —
   * order yang sama dengan jalur QRIS/VA. Nominal = total order (server).
   */
  async payOrderWithWallet(userId: string, orderId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) throw new ForbiddenException('Hanya customer yang bisa membayar dengan saldo');
    return this.payOrderWithWalletForCustomer(customer.id, orderId);
  }

  /**
   * Inti bayar-saldo (dipakai `POST /payments/wallet` dan rute lama
   * `/wallets/customer/:id/pay`). Batch 2: pelanggan BOLEH beralih dari
   * QRIS/VA ke saldo — tagihan aktif dibatalkan dulu (DB + gateway); bila
   * ternyata sudah dibayar, saldo tidak dipotong.
   */
  async payOrderWithWalletForCustomer(customerId: string, orderId: string) {
    return this.payOrderWithWalletForPayer({ customerId }, orderId);
  }

  /**
   * Batch 3: pembayar = customer ATAU partner B2B (dompet partner) — satu jalur
   * pelunasan untuk semua checkout saldo (mobile, kiosk, B2B).
   */
  async payOrderWithWalletForPayer(
    payer: { customerId?: string; partnerId?: string },
    orderId: string,
  ) {
    const owns = (o: { customerId: string | null; partnerId: string | null }) =>
      payer.partnerId ? o.partnerId === payer.partnerId : !!payer.customerId && o.customerId === payer.customerId;
    // Fase 1 — kunci order, validasi, batalkan percobaan QRIS/VA aktif.
    const superseded = await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!owns(order)) {
        throw new ForbiddenException('Order bukan milik Anda');
      }
      this.assertPayable(order);
      return this.supersedeActiveAttempt(tx, orderId);
    });
    if (superseded && superseded.paymentMethod !== PaymentMethod.WALLET) {
      if (await this.cancelAtGatewayOrSettle(superseded.paymentNumber, superseded.id)) {
        throw new ConflictException('Order sudah dibayar lewat QRIS/VA. Saldo tidak dipotong.');
      }
    }

    // Fase 2 — potong saldo & lunasi, di bawah kunci order.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const order = await this.lockOrder(tx, orderId);
        this.assertPayable(order);
        if (await tx.payment.findUnique({ where: { pendingSlot: orderId } })) {
          throw new ConflictException('Ada pembayaran lain yang sedang diproses untuk order ini');
        }
        if (!owns(order)) throw new ForbiddenException('Order bukan milik Anda');
        const amount = order.totalAmount;
        const wallet = await this.getOrCreateWalletInTx(
          tx,
          payer.partnerId ? { partnerId: payer.partnerId } : { customerId: payer.customerId },
        );
        if (amount.gt(0)) {
          await this.walletLedger.payWithWallet(tx, {
            walletId: wallet.id,
            amount,
            orderId,
            allowBonus: true,
            referenceType: 'PAYMENT',
            description: `Pembayaran order ${order.orderNumber}`,
          });
        }
        const payment = await tx.payment.create({
          data: {
            orderId,
            paymentNumber: `PAY-${order.orderNumber}`,
            paymentMethod: PaymentMethod.WALLET,
            amount,
            status: PaymentStatus.PENDING,
            pendingSlot: orderId,
            provider: 'wallet',
            notes: 'Pembayaran via saldo wallet',
          },
        });
        const settled = await this.settlePaidInTx(tx, payment.id, 'Dibayar via saldo wallet');
        return { settled, orderNumber: order.orderNumber, amount: toNum(amount) };
      });
      await this.afterSettled(result.settled);
      return { orderId, orderNumber: result.orderNumber, amount: result.amount, status: OrderStatus.PAID };
    } catch (err) {
      // paymentNumber / pendingSlot unik → request paralel untuk order yang sama.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Order sudah dibayar');
      }
      throw err;
    }
  }

  private async settlePromotionLoyalty(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      customerId: string | null;
      partnerId: string | null;
      totalAmount: Prisma.Decimal;
      deliveryFee: Prisma.Decimal;
    },
  ) {
    const spendingAmount = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      order.totalAmount.minus(order.deliveryFee),
    );

    if (order.customerId) {
      const status = await this.membershipTierService.ensureStatus(
        order.customerId,
      );
      const benefits = await this.membershipTierService.getBenefits(
        status.currentTier,
      );
      const wallet = await this.getOrCreateWalletInTx(tx, {
        customerId: order.customerId,
      });
      const pointsToEarn = Math.floor(
        Math.floor(toNum(spendingAmount) / this.loyaltyConfig.pointEarnRate) *
          toNum(benefits.pointMultiplier),
      );
      if (pointsToEarn > 0) {
        await this.pointService.earn({
          walletId: wallet.id,
          points: pointsToEarn,
          orderId: order.id,
          sourceType: 'ORDER',
          idempotencyKey: `point-earn-${order.id}`,
          tx,
        });
      }
      const cashback = spendingAmount
        .mul(benefits.cashbackRate)
        .div(100)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      if (cashback.gt(0)) {
        await this.walletLedger.creditCashback({
          walletId: wallet.id,
          amount: cashback,
          orderId: order.id,
          referenceType: 'TIER_CASHBACK',
          referenceId: order.id,
          idempotencyKey: `cashback-tier-${order.id}`,
          tx,
        });
      }
      await this.membershipTierService.recordSuccessfulTransaction(
        tx,
        order.customerId,
        toNum(spendingAmount),
      );
      await this.campaignService.qualifyReferralOnFirstTransaction(
        tx,
        order.customerId,
        order.id,
      );
      return;
    }

    if (order.partnerId) {
      await this.b2bPartnerService.recordSuccessfulTransaction(
        tx,
        order.partnerId,
        toNum(spendingAmount),
      );
    }
  }

  private async getOrCreateWalletInTx(
    tx: Prisma.TransactionClient,
    owner: { customerId?: string; partnerId?: string },
  ) {
    const where = owner.customerId
      ? { customerId: owner.customerId }
      : { partnerId: owner.partnerId };
    let wallet = await tx.wallet.findFirst({ where });
    if (!wallet) {
      wallet = await tx.wallet.create({ data: where });
    }
    return wallet;
  }

  private toPaymentView(payment: {
    paymentNumber: string;
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    status: PaymentStatus;
    externalResponse: Prisma.JsonValue;
    expiresAt?: Date | null;
  }) {
    const meta = (payment.externalResponse ?? {}) as Record<string, unknown>;
    const now = Date.now();
    const expiresAt =
      payment.expiresAt?.toISOString() ?? (meta.expiresAt as string | null) ?? null;
    return {
      // Batch 2: waktu server + sisa detik → hitung mundur klien selaras server;
      // status tetap ditentukan server (klien tidak menyimpulkan EXPIRED sendiri).
      serverTime: new Date(now).toISOString(),
      secondsRemaining:
        payment.status === PaymentStatus.PENDING && expiresAt
          ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
          : 0,
      canRetry:
        payment.status === PaymentStatus.EXPIRED ||
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.CANCELLED,
      paymentNumber: payment.paymentNumber,
      method: payment.paymentMethod,
      amount: toNum(payment.amount),
      status: payment.status,
      qrString: (meta.qrString as string | null) ?? null,
      vaNumber: (meta.vaNumber as string | null) ?? null,
      bank: (meta.bank as string | null) ?? null,
      expiresAt,
    };
  }
}
