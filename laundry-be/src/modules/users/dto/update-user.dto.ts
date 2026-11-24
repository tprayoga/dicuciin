import { IsString, IsEmail, IsOptional, IsBoolean, IsEnum, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ enum: UserRole, required: false })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ required: false, description: 'Password baru user' })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  // QA 2026-11-24 (BUG-011): wajib kombinasi huruf & angka.
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password harus mengandung huruf dan angka',
  })
  @IsOptional()
  password?: string;

  @ApiProperty({ required: false, description: 'Assign ulang outlet/cabang' })
  @IsString()
  @IsOptional()
  outletId?: string;

  @ApiProperty({ required: false, description: 'Shift kerja user' })
  @IsString()
  @IsOptional()
  shiftName?: string;
}
