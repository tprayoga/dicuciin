import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '081234567890', description: 'Nomor HP terdaftar' })
  @IsString()
  // Batch 5 (T6): spasi/tanda hubung/kurung diterima; dinormalisasi ke 628… di server.
  @Matches(/^\+?[0-9\s\-().]{8,24}$/, { message: 'Nomor HP tidak valid' })
  phone: string;

  @ApiProperty({ example: 'PasswordBaru123!', description: 'Password baru (min 8)' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ description: 'verificationToken dari OTP RESET_PASSWORD' })
  @IsString()
  verificationToken: string;
}
