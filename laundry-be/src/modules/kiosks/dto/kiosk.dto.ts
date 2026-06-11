import {
  IsString,
  IsOptional,
  IsBoolean,
  Matches,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
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
