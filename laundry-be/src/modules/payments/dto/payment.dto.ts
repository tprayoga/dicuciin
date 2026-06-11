import { IsString, IsIn, IsOptional } from 'class-validator';
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
