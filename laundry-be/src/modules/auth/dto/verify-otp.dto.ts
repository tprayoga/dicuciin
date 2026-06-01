import { IsString, IsEnum, IsOptional, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma/client';

export class VerifyOtpDto {
  @ApiProperty({ example: '081234567890', description: 'Nomor HP yang diverifikasi' })
  @IsString()
  @Matches(/^[0-9+]{8,20}$/, { message: 'Nomor HP tidak valid' })
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
