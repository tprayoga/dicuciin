import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutItemDto {
  @ApiProperty()
  @IsString()
  serviceId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;
}

export class CheckoutDto {
  @ApiProperty({ required: false, description: 'Pemilik retail' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, description: 'Pemilik B2B partner' })
  @IsString()
  @IsOptional()
  partnerId?: string;

  @ApiProperty()
  @IsString()
  outletId: string;

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ApiProperty({ required: false, description: 'Satu voucher saja (keputusan 5)' })
  @IsString()
  @IsOptional()
  voucherCode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  promoCode?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  deliveryFee?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  sourcePlatform?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  staffUserId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  kioskId?: string;

  @ApiProperty({ required: false, description: 'Mesin yang dipesan (alur booking)' })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Kode mesin (alternatif deviceId)' })
  @IsString()
  @IsOptional()
  deviceCode?: string;

  @ApiProperty({ required: false, description: 'Jadwal pemakaian (ISO 8601); kosong = sekarang' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class RefundTransactionDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class TopUpDto {
  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
