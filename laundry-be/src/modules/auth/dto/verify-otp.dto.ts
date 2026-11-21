import { IsString, IsEnum, IsOptional, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma/client';

export class VerifyOtpDto {
  @ApiProperty({ example: '081234567890', description: 'Nomor HP yang diverifikasi' })
  @IsString()
  // Batch 5 (T6): spasi/tanda hubung/kurung diterima; dinormalisasi ke 628… di server.
  @Matches(/^\+?[0-9\s\-().]{8,24}$/, { message: 'Nomor HP tidak valid' })
  phone: string;

  @ApiProperty({ example: '1234', description: 'Kode OTP 4 digit' })
  @IsString()
  @Length(4, 4)
  code: string;

  @ApiProperty({ enum: OtpPurpose, default: OtpPurpose.REGISTER, required: false })
  @IsEnum(OtpPurpose)
  @IsOptional()
  purpose?: OtpPurpose;
}
