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

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
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
      }
    });
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
