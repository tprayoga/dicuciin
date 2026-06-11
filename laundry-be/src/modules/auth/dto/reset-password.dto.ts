import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '081234567890', description: 'Nomor HP terdaftar' })
  @IsString()
  @Matches(/^[0-9+]{8,20}$/, { message: 'Nomor HP tidak valid' })
  phone: string;

  @ApiProperty({ example: 'PasswordBaru123!', description: 'Password baru (min 8)' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ description: 'verificationToken dari OTP RESET_PASSWORD' })
  @IsString()
  verificationToken: string;
}
