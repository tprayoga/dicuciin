import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Budi Sudarsono' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'budi@example.com', required: false })
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

  @ApiProperty({ example: 'L', required: false, enum: ['L', 'P'] })
  @IsString()
  @IsIn(['L', 'P'])
  @IsOptional()
  gender?: string;

  @ApiProperty({ example: '1999-08-17', required: false })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiProperty({
    example: 0,
    required: false,
    description: 'Saldo awal (hanya SUPER_ADMIN/OWNER). Dicatat di ledger sebagai top-up manual.',
  })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  initialBalance?: number;
}
