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
  @IsInt()
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

  @ApiProperty({ required: false })
  @IsInt()
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
