import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TopupWalletDto {
  @ApiProperty()
  @IsNumber()
  @Min(1000)
  amount: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class PayWithWalletDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class RefundWalletDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty({
    required: false,
    description: 'Legacy field; refund amount is derived from the paid payment',
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @ApiProperty({ description: 'Alasan refund dari customer' })
  @IsString()
  @MinLength(3)
  description: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class AdminRefundWalletDto {
  @ApiProperty({ description: 'Alasan refund oleh admin' })
  @IsString()
  @MinLength(3)
  description: string;
}
