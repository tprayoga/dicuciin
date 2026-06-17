import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipTier, UserSegment } from '@prisma/client';

export class CreatePromotionRuleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false, enum: UserSegment })
  @IsEnum(UserSegment)
  @IsOptional()
  segment?: UserSegment;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minTransaction?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscount?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  applicableServices?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  applicableOutlets?: string;

  @ApiProperty({ required: false, enum: MembershipTier })
  @IsEnum(MembershipTier)
  @IsOptional()
  tierRestriction?: MembershipTier;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxUsagePerUser?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePromotionRuleDto extends CreatePromotionRuleDto {
  @IsString()
  @IsOptional()
  name: string;
}
