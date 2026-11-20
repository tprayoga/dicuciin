import { IsString, IsOptional, IsEnum, IsNumber, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';

export class CreateIotDeviceDto {
  @ApiProperty()
  @IsString()
  outletId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  kioskId?: string;

  @ApiProperty()
  @IsString()
  deviceCode: string;

  @ApiProperty({ enum: DeviceType })
  @IsEnum(DeviceType)
  deviceType: DeviceType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  manufacturer?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firmwareVersion?: string;

  /** Batch 6 (S3): kapasitas mesin dalam kg. */
  @ApiProperty({ required: false, example: 10 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  capacityKg?: number | null;

  /** Batch 6 (S3): layanan yang dijalankan mesin (harga & durasi per outlet). null = lepas. */
  @ApiProperty({ required: false, nullable: true })
  @IsUUID()
  @IsOptional()
  serviceId?: string | null;
}

export class UpdateIotDeviceDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firmwareVersion?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  status?: string;

  /** Batch 6 (S3): kapasitas mesin dalam kg. */
  @ApiProperty({ required: false, example: 10 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  capacityKg?: number | null;

  /** Batch 6 (S3): layanan yang dijalankan mesin (harga & durasi per outlet). null = lepas. */
  @ApiProperty({ required: false, nullable: true })
  @IsUUID()
  @IsOptional()
  serviceId?: string | null;
}
