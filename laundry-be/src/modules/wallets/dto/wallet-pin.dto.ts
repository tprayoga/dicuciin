import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WalletPinDto {
  @ApiProperty({ example: '123456', description: 'PIN wallet 6 digit' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'PIN harus 6 digit angka' })
  pin: string;
}
