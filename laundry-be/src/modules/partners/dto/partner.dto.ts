import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { B2BPartnerTier } from '@prisma/client';

export class CreatePartnerDto {
  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiProperty()
  @IsString()
  picName: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  /** Form admin mengirim tier & status saat membuat partner (dulu ditolak 400). */
  @ApiProperty({ required: false, enum: B2BPartnerTier })
  @IsEnum(B2BPartnerTier)
  @IsOptional()
  tier?: B2BPartnerTier;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  @IsOptional()
  status?: string;
}

export class UpdatePartnerDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  picName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false, enum: B2BPartnerTier })
  @IsEnum(B2BPartnerTier)
  @IsOptional()
  tier?: B2BPartnerTier;

  @ApiProperty({ required: false, example: 'ACTIVE' })
  @IsString()
  @MinLength(3)
  @IsOptional()
  status?: string;
}
