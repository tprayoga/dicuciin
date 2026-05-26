import { IsString, IsEmail, IsOptional, IsBoolean, IsEnum, MinLength } from 'class-validator';
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
  @MinLength(8)
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
