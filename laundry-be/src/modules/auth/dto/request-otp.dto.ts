import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma/client';

export class RequestOtpDto {
  @ApiProperty({ example: '081234567890', description: 'Nomor HP tujuan OTP' })
  @IsString()
  @Matches(/^[0-9+]{8,20}$/, { message: 'Nomor HP tidak valid' })
  phone: string;

  @ApiProperty({ enum: OtpPurpose, default: OtpPurpose.REGISTER, required: false })
  @IsEnum(OtpPurpose)
  @IsOptional()
  purpose?: OtpPurpose;
}
