import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Request, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OtpPurpose, UserRole } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizePhone, phoneCandidates } from '../../common/utils/phone.util';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';
import { AccountDeletionService } from './account-deletion.service';
import {
  AdminDeletionDecisionDto,
  AdminDeletionListQuery,
  DeleteMyAccountDto,
  WebAccountDeletionDto,
} from './dto/account-deletion.dto';

/** Batch 6 — hapus akun mandiri (aplikasi, web) + tinjauan admin. */
@ApiTags('Account')
@Controller('account')
export class AccountDeletionController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('deletion/preview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pratinjau hapus akun: penghalang & yang akan hangus' })
  preview(@Request() req: any) {
    return this.deletion.preview(req.user.userId);
  }

  @Post('deletion')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hapus akun sendiri (wajib kata sandi + ketik HAPUS)' })
  async deleteMine(@Request() req: any, @Body() dto: DeleteMyAccountDto) {
    this.deletion.assertConfirmation(dto.confirm);
    // Re-autentikasi: kata sandi, ikut penguncian login (anti tebak).
    await this.auth.verifyPasswordForSensitiveAction(req.user.userId, dto.password);
    return this.deletion.request(req.user.userId, 'APP', dto.reason);
  }

  /**
   * Jalur web tanpa aplikasi (kewajiban toko aplikasi): OTP WhatsApp
   * (`POST /auth/otp/request|verify` purpose ACCOUNT_DELETION) → token → di sini.
   */
  @Public()
  @Post('deletion/web')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Hapus akun dari web (re-autentikasi OTP WhatsApp)' })
  async deleteViaWeb(@Body() dto: WebAccountDeletionDto) {
    this.deletion.assertConfirmation(dto.confirm);
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Nomor HP tidak valid');
    await this.otp.assertVerifiedPhone(dto.verificationToken, phone, OtpPurpose.ACCOUNT_DELETION);
    const users = await this.prisma.user.findMany({
      where: { phone: { in: phoneCandidates(phone) }, deletedAt: null },
      select: { id: true },
      take: 2,
    });
    if (users.length !== 1) {
      throw new BadRequestException('Akun untuk nomor ini tidak ditemukan atau perlu ditangani layanan pelanggan');
    }
    return this.deletion.request(users[0].id, 'WEB', dto.reason);
  }

  @Get('admin/deletion-requests')
  @ApiBearerAuth()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Daftar permintaan hapus akun (admin)' })
  list(@Query() q: AdminDeletionListQuery) {
    return this.deletion.listForAdmin(q.status);
  }

  @Post('admin/deletion-requests/:id/complete')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Selesaikan hapus akun setelah penghalang dituntaskan (admin)' })
  complete(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminDeletionDecisionDto) {
    return this.deletion.completeByAdmin(id, req.user.userId, dto.note);
  }

  @Delete('admin/customers/:customerId')
  @ApiBearerAuth()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Hapus member dari admin (anonimisasi; ditolak bila masih ada saldo/order aktif)' })
  deleteCustomer(@Request() req: any, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.deletion.deleteByAdmin(customerId, req.user.userId);
  }

  @Post('admin/deletion-requests/:id/cancel')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Batalkan permintaan hapus akun (admin)' })
  cancel(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminDeletionDecisionDto) {
    return this.deletion.cancelByAdmin(id, req.user.userId, dto.note ?? 'Dibatalkan admin');
  }
}
