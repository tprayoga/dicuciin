import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReviewSource } from '@prisma/client';

export class CreateReviewDto {
  @ApiProperty({ required: false, description: 'Order yang diulas (satu ulasan per order)' })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ enum: ReviewSource, default: ReviewSource.APP, required: false })
  @IsEnum(ReviewSource)
  @IsOptional()
  source?: ReviewSource;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  kioskSessionId?: string;

  @ApiProperty({ required: false, description: 'Staff yang bertugas (opsional, Fase 5)' })
  @IsString()
  @IsOptional()
  staffUserId?: string;
}

export class SetReviewFocusDto {
  @ApiProperty()
  @IsBoolean()
  isFocused: boolean;
}
