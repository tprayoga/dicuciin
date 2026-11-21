import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AccountDeletionStatus } from '@prisma/client';

export class DeleteMyAccountDto {
  @ApiProperty({ description: 'Kata sandi saat ini (re-autentikasi)' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: 'Ketik HAPUS untuk konfirmasi' })
  @IsString()
  confirm: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class WebAccountDeletionDto {
  @ApiProperty({ example: '081234567890' })
  @IsString()
  @Matches(/^\+?[0-9\s\-().]{8,24}$/, { message: 'Nomor HP tidak valid' })
  phone: string;

  @ApiProperty({ description: 'Token dari POST /auth/otp/verify (purpose ACCOUNT_DELETION)' })
  @IsString()
  verificationToken: string;

  @ApiProperty({ description: 'Ketik HAPUS untuk konfirmasi' })
  @IsString()
  confirm: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class AdminDeletionDecisionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class AdminDeletionListQuery {
  @ApiProperty({ enum: AccountDeletionStatus, required: false })
  @IsEnum(AccountDeletionStatus)
  @IsOptional()
  status?: AccountDeletionStatus;
}
