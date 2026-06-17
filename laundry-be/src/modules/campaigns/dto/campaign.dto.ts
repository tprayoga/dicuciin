import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CampaignType, UserSegment } from '@prisma/client';

export class CampaignRuleDto {
  @ApiProperty()
  @IsString()
  ruleKey: string;

  @ApiProperty()
  @IsString()
  ruleValue: string;
}

export class CampaignRewardDto {
  @ApiProperty({ description: "'VOUCHER' | 'CASHBACK'" })
  @IsString()
  rewardType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  voucherTemplateId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  rewardCashback?: number;

  @ApiProperty({ required: false, description: "'SELF' | 'REFERRER' | 'REFEREE'" })
  @IsString()
  @IsOptional()
  targetParty?: string;
}

export class CreateCampaignDto {
  @ApiProperty({ enum: CampaignType })
  @IsEnum(CampaignType)
  type: CampaignType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: UserSegment })
  @IsEnum(UserSegment)
  @IsOptional()
  segment?: UserSegment;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, type: [CampaignRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignRuleDto)
  @IsOptional()
  rules?: CampaignRuleDto[];

  @ApiProperty({ required: false, type: [CampaignRewardDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignRewardDto)
  @IsOptional()
  rewards?: CampaignRewardDto[];
}

export class UpdateCampaignDto {
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
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class ApplyReferralDto {
  @ApiProperty()
  @IsString()
  code: string;
}
