import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsIn,
  IsDateString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'john@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '081234567890', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserRole, default: UserRole.CUSTOMER, required: false })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({
    description: 'Verification token dari POST /auth/otp/verify. Wajib untuk register CUSTOMER.',
    required: false,
  })
  @IsString()
  @IsOptional()
  verificationToken?: string;

  @ApiProperty({ example: '2000-01-31', description: 'Tanggal lahir (ISO yyyy-MM-dd)', required: false })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiProperty({ enum: ['Laki-laki', 'Perempuan'], required: false })
  @IsIn(['Laki-laki', 'Perempuan'])
  @IsOptional()
  gender?: string;
}
