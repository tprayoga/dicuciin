import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { B2BPartnerTier, MembershipTier } from '@prisma/client';

export class UpsertMembershipTierDto {
  @ApiProperty({ enum: MembershipTier })
  @IsEnum(MembershipTier)
  tier: MembershipTier;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  level: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  thresholdSpending?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  thresholdTxnCount?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  pointMultiplier: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cashbackRate?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  benefitDescription?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpsertB2BTierDto {
  @ApiProperty({ enum: B2BPartnerTier })
  @IsEnum(B2BPartnerTier)
  tier: B2BPartnerTier;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  level: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  thresholdSpending?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  thresholdTxnCount?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  discountRate: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  pointMultiplier: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cashbackRate?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  benefitDescription?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
