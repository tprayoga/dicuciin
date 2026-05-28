import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({
    required: false,
    description: 'Refresh token yang akan di-revoke. Jika tidak dikirim, semua session di-revoke.',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
