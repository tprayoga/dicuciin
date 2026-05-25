import { IsString, IsOptional, IsEnum } from 'class-validator';
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
}
