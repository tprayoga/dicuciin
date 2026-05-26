import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOutletDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty({ required: false, example: '07:00' })
  @IsString()
  @IsOptional()
  openTime?: string;

  @ApiProperty({ required: false, example: '22:00' })
  @IsString()
  @IsOptional()
  closeTime?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/outlet.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateOutletDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  openTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  closeTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
