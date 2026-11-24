import { IsString, IsOptional, IsBoolean, IsNumber, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateServiceDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  serviceType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  capacityKg?: number;

  @ApiProperty({ required: false })
  @IsInt({ message: 'Estimasi waktu harus berupa angka menit' })
  @Min(1, { message: 'Estimasi waktu minimal 1 menit' })
  @IsOptional()
  estimateMinutes?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0, { message: 'Harga tidak boleh negatif' })
  @IsOptional()
  basePrice?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateServiceDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  serviceType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  capacityKg?: number;

  @ApiProperty({ example: 45 })
  @IsInt({ message: 'Estimasi waktu harus berupa angka menit' })
  @Min(1, { message: 'Estimasi waktu minimal 1 menit' })
  estimateMinutes: number;

  @ApiProperty({ example: 15000 })
  @IsNumber({}, { message: 'Harga wajib diisi' })
  @Min(1, { message: 'Harga harus lebih dari 0' })
  basePrice: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateServicePriceDto {
  @ApiProperty()
  @IsString()
  serviceId: string;

  @ApiProperty()
  @IsString()
  outletId: string;

  @ApiProperty()
  @IsString()
  pricingType: string;

  @ApiProperty()
  @IsNumber()
  @Min(0, { message: 'Harga tidak boleh negatif' })
  price: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  estimatedDurationHours?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
