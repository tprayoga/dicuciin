import { IsString, IsEmail, IsOptional, IsEnum, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserRole, default: UserRole.CASHIER, required: false })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ required: false, description: 'Assign user to outlet/cabang' })
  @IsString()
  @IsOptional()
  outletId?: string;

  @ApiProperty({ required: false, description: 'Shift kerja, contoh: Pagi (07:00-15:00)' })
  @IsString()
  @IsOptional()
  shiftName?: string;
}
