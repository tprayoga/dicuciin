import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CalculatePricingItemDto {
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

export class CalculatePricingDto {
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

  @ApiProperty({ type: [CalculatePricingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculatePricingItemDto)
  items: CalculatePricingItemDto[];

  @ApiProperty({ required: false, description: 'Satu voucher saja' })
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

  @ApiProperty({ required: false, description: 'Waktu simulasi pricing' })
  @IsDateString()
  @IsOptional()
  at?: string;
}
