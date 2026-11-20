import { IsString, IsIn, IsOptional, IsNumber, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGatewayPaymentDto {
  @ApiProperty({ description: 'ID order yang akan dibayar' })
  @IsString()
  orderId: string;

  @ApiProperty({ enum: ['QRIS', 'VA'], example: 'QRIS' })
  @IsIn(['QRIS', 'VA'])
  method: 'QRIS' | 'VA';

  @ApiProperty({ required: false, example: 'BCA', description: 'Bank untuk VA' })
  @IsOptional()
  @IsString()
  bank?: string;
}

export class PaymentWebhookDto {
  @ApiProperty({ description: 'externalId dari gateway' })
  @IsString()
  externalId: string;

  @ApiProperty({ enum: ['PAID', 'FAILED', 'EXPIRED'], example: 'PAID' })
  @IsIn(['PAID', 'FAILED', 'EXPIRED'])
  status: 'PAID' | 'FAILED' | 'EXPIRED';
}

/** Bayar order yang sudah ada memakai saldo (nominal ditentukan server). */
export class PayOrderWithWalletDto {
  @ApiProperty({ description: 'ID order yang akan dibayar' })
  @IsString()
  orderId: string;
}

/**
 * Body rute lama `POST /wallets/customer/:customerId/pay` (aplikasi mobile
 * versi lama). `amount` DITERIMA demi kompatibilitas tetapi DIABAIKAN — nominal
 * selalu total order dari server (K4).
 */
export class LegacyPayWithWalletDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({ required: false, description: 'Diabaikan (kompatibilitas app lama)' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiProperty({ required: false, description: 'Diabaikan (pembayaran ganda dicegah per order)' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RefundRequestDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({ description: 'Alasan permintaan refund' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class ReviewReconciliationDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'CLOSE'] })
  @IsIn(['APPROVE', 'REJECT', 'CLOSE'])
  decision: 'APPROVE' | 'REJECT' | 'CLOSE';

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note: string;
}

export class ExecuteRefundDto {
  @ApiProperty({ enum: ['WALLET_CREDIT', 'EXTERNAL'] })
  @IsIn(['WALLET_CREDIT', 'EXTERNAL'])
  method: 'WALLET_CREDIT' | 'EXTERNAL';

  @ApiProperty({ required: false, description: 'Wajib untuk EXTERNAL' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
