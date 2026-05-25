import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PromoType } from '@prisma/client';

export class CreatePromoRuleDto {
  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minTransaction?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  maxDiscount?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  maxUsagePerCustomer?: number;

  @ApiProperty({ required: false, description: 'Comma-separated service IDs' })
  @IsString()
  @IsOptional()
  applicableServices?: string;

  @ApiProperty({ required: false, description: 'Comma-separated outlet IDs' })
  @IsString()
  @IsOptional()
  applicableOutlets?: string;
}

export class CreatePromoDto {
  @ApiProperty({ example: 'DISKON50' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Diskon 50% untuk order pertama' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: PromoType, example: PromoType.PERCENTAGE })
  @IsEnum(PromoType)
  promoType: PromoType;

  @ApiProperty({ example: 50, description: 'Value: percentage (50) or fixed amount (50000)' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false, example: 100, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  quota?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false, type: CreatePromoRuleDto })
  @ValidateNested()
  @Type(() => CreatePromoRuleDto)
  @IsOptional()
  rule?: CreatePromoRuleDto;
}

export class UpdatePromoDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  quota?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
