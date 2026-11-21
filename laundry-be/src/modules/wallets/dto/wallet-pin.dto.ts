import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WalletPinDto {
  @ApiProperty({ example: '123456', description: 'PIN wallet 6 digit' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'PIN harus 6 digit angka' })
  pin: string;
}

/** Batch 4: set/ganti PIN — `currentPin` wajib bila PIN sudah ada. */
export class SetWalletPinDto {
  @ApiProperty({ example: '123456', description: 'PIN wallet baru (6 digit)' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'PIN harus 6 digit angka' })
  pin: string;

  @ApiProperty({ required: false, description: 'PIN lama (wajib saat mengganti PIN)' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'PIN lama harus 6 digit angka' })
  currentPin?: string;
}
