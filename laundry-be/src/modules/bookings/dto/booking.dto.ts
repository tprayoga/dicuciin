import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ required: false, description: 'ID perangkat mesin' })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Kode perangkat (hasil scan QR)' })
  @IsString()
  @IsOptional()
  deviceCode?: string;

  @ApiProperty({ required: false, description: 'Order pembayaran terkait (opsional)' })
  @IsString()
  @IsOptional()
  orderId?: string;
}

export class VerifyBookingDto {
  @ApiProperty({ description: 'Kode perangkat hasil scan QR mesin' })
  @IsString()
  deviceCode: string;
}
