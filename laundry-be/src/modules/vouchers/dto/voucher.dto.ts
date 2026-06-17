import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  B2BPartnerTier,
  MembershipTier,
  UserSegment,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';

export class CreateVoucherTemplateDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiProperty({ enum: UserSegment })
  @IsEnum(UserSegment)
  segment: UserSegment;

  @ApiProperty({ enum: VoucherType })
  @IsEnum(VoucherType)
  voucherType: VoucherType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minTransaction?: number;

  @ApiProperty({ required: false, description: 'Comma-separated service IDs' })
  @IsString()
  @IsOptional()
  applicableServices?: string;

  @ApiProperty({ required: false, description: 'Comma-separated outlet IDs' })
  @IsString()
  @IsOptional()
  applicableOutlets?: string;

  @ApiProperty({ required: false, enum: MembershipTier })
  @IsEnum(MembershipTier)
  @IsOptional()
  tierRestriction?: MembershipTier;

  @ApiProperty({ required: false, enum: B2BPartnerTier })
  @IsEnum(B2BPartnerTier)
  @IsOptional()
  b2bTierRestriction?: B2BPartnerTier;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  validityDays?: number;

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
  @Min(1)
  @IsOptional()
  quota?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  perUserLimit?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  pointCost?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateVoucherTemplateDto extends CreateVoucherTemplateDto {
  @IsString()
  @IsOptional()
  code: string;

  @IsString()
  @IsOptional()
  name: string;

  @IsEnum(UserSegment)
  @IsOptional()
  segment: UserSegment;

  @IsEnum(VoucherType)
  @IsOptional()
  voucherType: VoucherType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  value: number;
}

export class IssueVoucherDto {
  @ApiProperty()
  @IsString()
  templateId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  partnerId?: string;

  @ApiProperty({ required: false, example: 'MANUAL' })
  @IsString()
  @IsOptional()
  sourceType?: string;
}

export class VoucherQueryDto {
  @ApiProperty({ required: false, enum: UserSegment })
  @IsEnum(UserSegment)
  @IsOptional()
  segment?: UserSegment;

  @ApiProperty({ required: false, enum: VoucherStatus })
  @IsEnum(VoucherStatus)
  @IsOptional()
  status?: VoucherStatus;
}
