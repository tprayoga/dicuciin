import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Field profil yang boleh diubah user sendiri (PATCH /users/me).
 * Sengaja TIDAK memuat role, password, isActive, phone, atau outlet.
 * (Nomor HP diubah lewat alur OTP; password lewat reset password.)
 */
export class UpdateMyProfileDto {
  @ApiProperty({ required: false })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false, description: 'Path hasil POST /uploads/profile/:userId' })
  @IsString()
  @Matches(/^\/uploads\/[\w\-./]+$/, {
    message: 'avatarUrl harus berupa path file upload server (/uploads/...)',
  })
  @IsOptional()
  avatarUrl?: string;
}
