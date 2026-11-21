import { IsString, IsOptional, IsBoolean, IsNumber, Matches } from 'class-validator';

/** "HH:mm" 00:00–23:59, atau "24:00" (tutup tengah malam). Nilai lain dulu
 * diterima dan membuat outlet dianggap buka 24 jam (temuan uji 2026-11-21). */
const TIME_HHMM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const TIME_MSG = 'Format jam harus HH:mm (00:00–23:59)';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOutletDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty({ required: false, example: '07:00' })
  @IsString()
  @Matches(TIME_HHMM, { message: TIME_MSG })
  @IsOptional()
  openTime?: string;

  @ApiProperty({ required: false, example: '22:00' })
  @IsString()
  @Matches(TIME_HHMM, { message: TIME_MSG })
  @IsOptional()
  closeTime?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/outlet.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateOutletDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @Matches(TIME_HHMM, { message: TIME_MSG })
  @IsOptional()
  openTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @Matches(TIME_HHMM, { message: TIME_MSG })
  @IsOptional()
  closeTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
