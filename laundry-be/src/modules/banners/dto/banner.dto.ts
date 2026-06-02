import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BannerPlacement } from '@prisma/client';

export class CreateBannerDto {
  @ApiProperty({ example: 'Diskon Akhir Pekan' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'https://cdn.example.com/banner.jpg' })
  @IsString()
  imageUrl: string;

  @ApiProperty({ required: false, description: 'Tautan saat banner diketuk' })
  @IsString()
  @IsOptional()
  linkUrl?: string;

  @ApiProperty({ required: false, example: 'Beri Ulasan' })
  @IsString()
  @IsOptional()
  ctaLabel?: string;

  @ApiProperty({ required: false, description: 'Tautkan banner ke promo (kode otomatis dipakai)' })
  @IsString()
  @IsOptional()
  promoId?: string;

  @ApiProperty({ enum: BannerPlacement })
  @IsEnum(BannerPlacement)
  placement: BannerPlacement;

  @ApiProperty({ required: false, default: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateBannerDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  linkUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ctaLabel?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  promoId?: string;

  @ApiProperty({ enum: BannerPlacement, required: false })
  @IsEnum(BannerPlacement)
  @IsOptional()
  placement?: BannerPlacement;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
