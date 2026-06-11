import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  Headers,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateGatewayPaymentDto, PaymentWebhookDto } from './dto/payment.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
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

  @Get(':paymentNumber/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cek status pembayaran (untuk polling)' })
  async status(@Param('paymentNumber') paymentNumber: string) {
    return this.paymentsService.getStatus(paymentNumber);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Callback gateway (provider-agnostic)' })
  async webhook(
    @Body() dto: PaymentWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    // Verifikasi secret bila dikonfigurasi (di prod wajib di-set).
    const expected = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Webhook secret tidak valid');
    }
    return this.paymentsService.handleWebhook(dto);
  }

  @Post(':paymentNumber/simulate')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[DEV] Simulasikan pembayaran berhasil (mock gateway)' })
  async simulate(@Param('paymentNumber') paymentNumber: string) {
    if (this.config.get<string>('APP_ENV', 'development') === 'production') {
      throw new ForbiddenException('Tidak tersedia di produksi');
    }
    return this.paymentsService.simulatePaid(paymentNumber);
  }
}
