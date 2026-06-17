import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { B2BPartnerTier } from '@prisma/client';

export const B2B_PRICE_TYPES = [
  'DISCOUNT_PERCENT',
  'FIXED_DISCOUNT',
  'FIXED_PRICE',
] as const;

export type B2BPriceType = (typeof B2B_PRICE_TYPES)[number];

export class CreateB2BPricingRuleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  partnerId?: string;

  @ApiProperty({ required: false, enum: B2BPartnerTier })
  @IsEnum(B2BPartnerTier)
  @IsOptional()
  tier?: B2BPartnerTier;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  outletId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;

  @ApiProperty({ enum: B2B_PRICE_TYPES })
  @IsIn(B2B_PRICE_TYPES)
  priceType: B2BPriceType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateB2BPricingRuleDto extends CreateB2BPricingRuleDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsIn(B2B_PRICE_TYPES)
  @IsOptional()
  priceType: B2BPriceType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  value: number;
}
