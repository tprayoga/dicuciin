import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from '../../common/utils/money.util';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from './gateway/payment-gateway.interface';
import { CreateGatewayPaymentDto, PaymentWebhookDto } from './dto/payment.dto';
import { PromosService } from '../promos/promos.service';
import { WalletService } from '../wallets/wallet.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { CampaignService } from '../campaigns/campaign.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private promosService: PromosService,
    private walletService: WalletService,
    private pointService: PointService,
    private membershipTierService: MembershipTierService,
    private b2bPartnerService: B2BPartnerService,
    private campaignService: CampaignService,
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
  async createKioskGatewayPayment(orderId: string, dto: CreateGatewayPaymentDto) {
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
    order: { id: string; orderNumber: string; status: OrderStatus; totalAmount: Prisma.Decimal },
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

  /** Dev-only: simulasikan gateway mengonfirmasi pembayaran berhasil. */
  async simulatePaid(paymentNumber: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentNumber },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.externalId) {
      throw new BadRequestException('Pembayaran ini bukan via gateway');
    }
    return this.handleWebhook({ externalId: payment.externalId, status: 'PAID' });
  }

  /**
   * Tandai Payment PAID + Order PAID + OrderStatusLog dalam satu transaksi.
   * Idempoten: kalau payment sudah PAID, tidak melakukan apa-apa.
   */
  private async settlePaid(paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (payment.status === PaymentStatus.PAID) return;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID, paidAt: new Date() },
      });

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
      });
      if (order && order.status !== OrderStatus.PAID) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAID },
        });
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: OrderStatus.PAID,
            notes: 'Dibayar via payment gateway',
            createdBy: order.customerId ?? undefined,
          },
        });

        // Pemakaian promo dicatat saat order benar-benar dibayar.
        await this.promosService.commitUsage(tx, order.id);
        await this.settlePromotionLoyalty(tx, order);
      }
    });
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
      const status = await this.membershipTierService.ensureStatus(order.customerId);
      const benefits = await this.membershipTierService.getBenefits(status.currentTier);
      const wallet = await this.getOrCreateWalletInTx(tx, { customerId: order.customerId });
      const pointsToEarn = Math.floor(
        Math.floor(toNum(spendingAmount) / Number(process.env.LOYALTY_POINT_RATE ?? '1000')) *
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
        await this.walletService.creditCashback({
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
