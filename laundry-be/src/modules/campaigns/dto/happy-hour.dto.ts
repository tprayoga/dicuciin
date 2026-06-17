import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHappyHourRuleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  outletId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;

  @ApiProperty({ example: '1,2,3,4,5' })
  @IsString()
  daysOfWeek: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '21:00' })
  @IsString()
  endTime: string;

  @ApiProperty({ required: false, example: 'Asia/Jakarta' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ example: 'PERCENTAGE_OFF' })
  @IsString()
  adjustmentType: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateHappyHourRuleDto extends CreateHappyHourRuleDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  daysOfWeek: string;

  @IsString()
  @IsOptional()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime: string;

  @IsString()
  @IsOptional()
  adjustmentType: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  value: number;
}
