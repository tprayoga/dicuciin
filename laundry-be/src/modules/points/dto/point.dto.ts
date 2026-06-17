import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemPointDto {
  @ApiProperty()
  @IsString()
  walletId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  points: number;

  @ApiProperty({ required: false, example: 'VOUCHER_REDEMPTION' })
  @IsString()
  @IsOptional()
  sourceType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class RedeemPointVoucherDto {
  @ApiProperty()
  @IsString()
  walletId: string;

  @ApiProperty()
  @IsString()
  templateId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
