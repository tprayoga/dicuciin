import {
  IsString,
  IsOptional,
  IsBoolean,
  Matches,
  IsArray,
  IsInt,
  Min,
  Max,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKioskDto {
  @ApiProperty()
  @IsString()
  outletId: string;

  @ApiProperty()
  @IsString()
  kioskCode: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  location?: string;
}

export class UpdateKioskDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  scheduleEnabled?: boolean;

  @ApiProperty({ required: false, example: [1, 2, 3, 4, 5, 6, 7] })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @IsOptional()
  scheduleDays?: number[];

  @ApiProperty({ required: false, example: '07:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  scheduleOpenTime?: string;

  @ApiProperty({ required: false, example: '22:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  scheduleCloseTime?: string;

  @ApiProperty({ required: false, example: 'Asia/Jakarta' })
  @IsString()
  @IsOptional()
  timezone?: string;
}

export class EnrollKioskDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;

  @ApiProperty({ description: 'Identitas unik instalasi aplikasi kiosk' })
  @IsString()
  deviceId: string;
}

export class KioskCheckoutItemDto {
  @ApiProperty()
  @IsString()
  serviceId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class KioskCheckoutDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, description: 'Nomor HP atau member code customer' })
  @IsString()
  @IsOptional()
  customerLookup?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  partnerId?: string;

  @ApiProperty({ type: [KioskCheckoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KioskCheckoutItemDto)
  items: KioskCheckoutItemDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  voucherCode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  promoCode?: string;
}
