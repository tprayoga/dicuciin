import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
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
import { promoteBookingOnPaidInTx } from '../bookings/booking-lifecycle';

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
  ) {}

  /** Buat tagihan QRIS/VA untuk sebuah order via gateway (status awal PENDING). */
  async createGatewayPayment(userId: string, dto: CreateGatewayPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { customer: { select: { userId: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Hanya pemilik order yang boleh membuat pembayaran.
    if (order.customer && order.customer.userId !== userId) {
      throw new UnauthorizedException('Order bukan milik Anda');
    }

    return this.issueChargeForOrder(order, dto);
  }

  /**
   * Buat tagihan QRIS/VA untuk order kiosk (tamu, tanpa customer). Dipakai oleh
   * KiosksService setelah memvalidasi order milik kiosk yang ber-enroll.
   */
  async createKioskGatewayPayment(
    orderId: string,
    dto: CreateGatewayPaymentDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sourcePlatform !== 'KIOSK') {
      throw new UnauthorizedException('Order ini bukan dari kiosk');
    }
    return this.issueChargeForOrder(order, dto);
  }

  /** Inti pembuatan tagihan gateway (idempoten) untuk sebuah order. */
  private async issueChargeForOrder(
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
      totalAmount: Prisma.Decimal;
    },
    dto: CreateGatewayPaymentDto,
  ) {
    if (order.status === OrderStatus.PAID) {
      throw new ConflictException('Order sudah dibayar');
    }

    const paymentNumber = `PG-${order.orderNumber}`;

    // Idempoten: kalau sudah ada tagihan gateway untuk order ini, pakai yang ada.
    const existing = await this.prisma.payment.findUnique({
      where: { paymentNumber },
    });
    if (existing) {
      if (existing.status === PaymentStatus.PAID) {
        throw new ConflictException('Order sudah dibayar');
      }
      return this.toPaymentView(existing);
    }

    const amount = toNum(order.totalAmount);
    const charge = await this.gateway.createCharge({
      orderNumber: order.orderNumber,
      amount,
      method: dto.method,
      bank: dto.bank,
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        paymentNumber,
        paymentMethod:
          dto.method === 'QRIS' ? PaymentMethod.QRIS : PaymentMethod.TRANSFER,
        amount,
        status: PaymentStatus.PENDING,
        externalId: charge.externalId,
        externalResponse: {
          provider: this.gateway.name,
          method: dto.method,
          qrString: charge.qrString ?? null,
          vaNumber: charge.vaNumber ?? null,
          bank: charge.bank ?? null,
          expiresAt: charge.expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return this.toPaymentView(payment);
  }

  /** Status pembayaran untuk polling dari klien. */
  async getStatus(paymentNumber: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentNumber },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.toPaymentView(payment);
  }

  /** Callback dari gateway (provider-agnostic). Idempoten. */
  async handleWebhook(dto: PaymentWebhookDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { externalId: dto.externalId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (dto.status === 'PAID') {
      await this.settlePaid(payment.id);
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status:
            dto.status === 'FAILED'
              ? PaymentStatus.FAILED
              : PaymentStatus.EXPIRED,
        },
      });
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
      // Signature sudah sah (diverifikasi di parseWebhook), tapi transaksinya
      // bukan milik kita — mis. "Test notification URL" dari dashboard Midtrans.
      // Balas 200 agar tidak dianggap gagal / dikirim ulang; tidak ada yang diubah.
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
    } else if (
      event.status !== 'PENDING' &&
      payment.status !== PaymentStatus.PAID
    ) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status:
            event.status === 'FAILED'
              ? PaymentStatus.FAILED
              : PaymentStatus.EXPIRED,
        },
      });
    }
    return { received: true };
  }

  /** Dev-only: simulasikan gateway mengonfirmasi pembayaran berhasil. */
  async simulatePaid(paymentNumber: string) {
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
   * Tandai Payment PAID + Order PAID + OrderStatusLog dalam satu transaksi.
   * Idempoten: kalau payment sudah PAID, tidak melakukan apa-apa.
   */
  /**
   * Tandai Payment PAID + Order PAID + log + promo + loyalty + booking
   * HOLD→RESERVED, di DALAM transaksi pemanggil. Idempoten: payment yang sudah
   * PAID dilewati. Mengembalikan id order yang baru menjadi PAID (atau null).
   */
  private async settlePaidInTx(
    tx: Prisma.TransactionClient,
    paymentId: string,
    note = 'Dibayar via payment gateway',
  ): Promise<string | null> {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (payment.status === PaymentStatus.PAID) return null;

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });

    // Kunci baris order: serial dengan pembatalan (OrdersService.cancel) dan
    // pembayaran paralel lain atas order yang sama.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
    });
    if (!order || order.status === OrderStatus.PAID) return null;
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      // Batch 1.5: uang masuk untuk order yang sudah batal (mis. QRIS dibayar
      // setelah transaksi kiosk dibatalkan). Pembayaran TETAP tercatat PAID
      // (jejak keuangan), order TIDAK dihidupkan lagi, mesin tidak menyala —
      // ditandai untuk refund manual oleh admin.
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          status: order.status,
          notes: `Pembayaran ${payment.paymentNumber} diterima setelah order ${order.status} — PERLU REFUND MANUAL`,
        },
      });
      this.logger.error(
        `Pembayaran ${payment.paymentNumber} diterima untuk order ${order.orderNumber} berstatus ${order.status} — perlu refund manual`,
      );
      return null;
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        status: OrderStatus.PAID,
        notes: note,
        createdBy: order.customerId ?? undefined,
      },
    });

    // Pemakaian promo dicatat saat order benar-benar dibayar.
    await this.promosService.commitUsage(tx, order.id);
    await this.settlePromotionLoyalty(tx, order);

    // K2/T2: booking terikat order → RESERVED (siap dipakai saat scan QR).
    const promotion = await promoteBookingOnPaidInTx(tx, order.id);
    if (promotion.bookingId && !promotion.promoted) {
      this.logger.error(
        `Order ${order.orderNumber} PAID tetapi booking ${promotion.bookingId} tidak bisa dipertahankan (slot terambil) — perlu tindak lanjut admin`,
      );
    }
    return order.id;
  }

  private async settlePaid(paymentId: string) {
    const paidOrderId = await this.prisma.$transaction((tx) =>
      this.settlePaidInTx(tx, paymentId),
    );
    // Aktivasi mesin di luar transaksi finansial (best-effort). No-op untuk
    // order booking (aktivasi lewat scan QR) dan order tanpa mesin.
    if (paidOrderId) {
      await this.iotMachineService.activateMachineForOrder(paidOrderId);
    }
  }

  /**
   * Bayar order YANG SUDAH ADA memakai saldo (BONUS dulu, lalu MAIN) —
   * order yang sama dengan jalur QRIS/VA, tanpa membuat order baru.
   * Nominal = total order (server). Aman terhadap request paralel: baris order
   * dikunci, dan paymentNumber unik menolak pembayaran ganda.
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
   * Inti bayar-saldo untuk customer tertentu (pemanggil sudah memvalidasi akses).
   * Dipakai `POST /payments/wallet` dan rute lama `/wallets/customer/:id/pay`
   * (aplikasi mobile versi lama) — satu jalur, satu set aturan.
   */
  async payOrderWithWalletForCustomer(customerId: string, orderId: string) {
    const customer = { id: customerId };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');
        if (order.customerId !== customer.id) {
          throw new ForbiddenException('Order bukan milik Anda');
        }
        if (order.status === OrderStatus.PAID) {
          throw new ConflictException('Order sudah dibayar');
        }
        if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.WAITING_PAYMENT) {
          throw new BadRequestException(`Order berstatus ${order.status} tidak bisa dibayar`);
        }

        // Cegah bayar dobel: tagihan QRIS/VA yang masih aktif harus selesai/
        // kedaluwarsa dulu (pembatalan tagihan Midtrans menyusul di Batch 2).
        const now = Date.now();
        const pendingGateway = await tx.payment.findMany({
          where: { orderId, status: PaymentStatus.PENDING, paymentMethod: { not: PaymentMethod.WALLET } },
        });
        const stillActive = pendingGateway.some((pg) => {
          const exp = (pg.externalResponse as { expiresAt?: string } | null)?.expiresAt;
          return !exp || new Date(exp).getTime() > now;
        });
        if (stillActive) {
          throw new ConflictException(
            'Masih ada tagihan QRIS/VA aktif untuk order ini. Selesaikan atau tunggu tagihan kedaluwarsa.',
          );
        }

        const amount = order.totalAmount;
        const wallet = await this.getOrCreateWalletInTx(tx, { customerId: customer.id });
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
            notes: 'Pembayaran via saldo wallet',
          },
        });
        await this.settlePaidInTx(tx, payment.id, 'Dibayar via saldo wallet');
        return { orderId, orderNumber: order.orderNumber, amount: toNum(amount) };
      });

      await this.iotMachineService.activateMachineForOrder(orderId);
      return { ...result, status: OrderStatus.PAID };
    } catch (err) {
      // paymentNumber unik → request kedua untuk order yang sama.
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
  }) {
    const meta = (payment.externalResponse ?? {}) as Record<string, unknown>;
    return {
      paymentNumber: payment.paymentNumber,
      method: payment.paymentMethod,
      amount: toNum(payment.amount),
      status: payment.status,
      qrString: (meta.qrString as string | null) ?? null,
      vaNumber: (meta.vaNumber as string | null) ?? null,
      bank: (meta.bank as string | null) ?? null,
      expiresAt: (meta.expiresAt as string | null) ?? null,
    };
  }
}
