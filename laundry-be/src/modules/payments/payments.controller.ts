import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  Headers,
  HttpCode,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreateGatewayPaymentDto,
  PayOrderWithWalletDto,
  PaymentWebhookDto,
} from './dto/payment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertOrderAccess } from '../../common/auth/access-policy';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('gateway')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buat tagihan QRIS/VA via payment gateway' })
  async createGateway(
    @Request() req: any,
    @Body() dto: CreateGatewayPaymentDto,
  ) {
    return this.paymentsService.createGatewayPayment(req.user.userId, dto);
  }

  @Post('wallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bayar order yang sudah ada memakai saldo (nominal dari server)' })
  async payWithWallet(@Request() req: any, @Body() dto: PayOrderWithWalletDto) {
    return this.paymentsService.payOrderWithWallet(req.user.userId, dto.orderId);
  }

  @Get(':paymentNumber/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cek status pembayaran (untuk polling)' })
  async status(@Param('paymentNumber') paymentNumber: string, @Request() req: any) {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentNumber },
      select: { orderId: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await assertOrderAccess(this.prisma, req.user, payment.orderId);
    return this.paymentsService.getStatus(paymentNumber);
  }

  @Public()
  @Post('midtrans/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'HTTP notification Midtrans (signature SHA-512)' })
  async midtransWebhook(@Body() payload: Record<string, unknown>) {
    return this.paymentsService.handleProviderWebhook(payload);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Callback gateway (provider-agnostic)' })
  async webhook(
    @Body() dto: PaymentWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    if (this.config.get<string>('APP_ENV', 'development') === 'production') {
      throw new ForbiddenException(
        'Webhook simulasi tidak tersedia di produksi',
      );
    }
    // Verifikasi secret bila dikonfigurasi (di prod wajib di-set).
    const expected = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Webhook secret tidak valid');
    }
    return this.paymentsService.handleWebhook(dto);
  }

  @Post(':paymentNumber/simulate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[DEV] Simulasikan pembayaran berhasil (mock gateway)',
  })
  async simulate(@Param('paymentNumber') paymentNumber: string) {
    if (this.config.get<string>('APP_ENV', 'development') === 'production') {
      throw new ForbiddenException('Tidak tersedia di produksi');
    }
    return this.paymentsService.simulatePaid(paymentNumber);
  }
}
