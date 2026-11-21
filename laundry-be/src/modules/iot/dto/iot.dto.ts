import { IsString, IsOptional, IsEnum, IsNumber, IsUUID, IsIn, Max, Min } from 'class-validator';

/** IOT = status dari perangkat; MANUAL = belum terintegrasi IoT, kondisi diatur admin. */
export const CONTROL_MODES = ['IOT', 'MANUAL'] as const;
export const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'MAINTENANCE'] as const;
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

  /** IOT (default) atau MANUAL (tanpa IoT: scan QR langsung menandai mesin dipakai). */
  @ApiProperty({ required: false, enum: CONTROL_MODES, example: 'MANUAL' })
  @IsIn(CONTROL_MODES as unknown as string[], { message: 'controlMode harus IOT atau MANUAL' })
  @IsOptional()
  controlMode?: (typeof CONTROL_MODES)[number];

  @ApiProperty({ required: false, enum: DEVICE_STATUSES })
  @IsIn(DEVICE_STATUSES as unknown as string[], { message: 'status harus ONLINE, OFFLINE, atau MAINTENANCE' })
  @IsOptional()
  status?: string;
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

  /** Kondisi mesin. Mode MANUAL: ONLINE = Tersedia, MAINTENANCE = tidak bisa dipesan. */
  @ApiProperty({ required: false, enum: DEVICE_STATUSES })
  @IsIn(DEVICE_STATUSES as unknown as string[], { message: 'status harus ONLINE, OFFLINE, atau MAINTENANCE' })
  @IsOptional()
  status?: string;

  /** IOT (default) atau MANUAL (tanpa IoT: scan QR langsung menandai mesin dipakai). */
  @ApiProperty({ required: false, enum: CONTROL_MODES, example: 'MANUAL' })
  @IsIn(CONTROL_MODES as unknown as string[], { message: 'controlMode harus IOT atau MANUAL' })
  @IsOptional()
  controlMode?: (typeof CONTROL_MODES)[number];

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
