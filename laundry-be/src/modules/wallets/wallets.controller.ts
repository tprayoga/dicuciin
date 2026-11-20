import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import {
  TopupWalletDto,
  RefundWalletDto,
  AdminRefundWalletDto,
} from './dto/wallet.dto';
import { SetWalletPinDto, WalletPinDto } from './dto/wallet-pin.dto';
import { walletSessionKey } from '../../common/auth/wallet-pin';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCustomerAccess } from '../../common/auth/access-policy';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get customer wallet (pemilik atau staf)' })
  async getWallet(@Param('customerId') customerId: string, @Request() req: any) {
    await assertCustomerAccess(this.prisma, req.user, customerId);
    return this.walletsService.getWallet(customerId);
  }

  @Get('customer/:customerId/transactions')
  @ApiOperation({ summary: 'Get wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTransactions(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
  ) {
    await assertCustomerAccess(this.prisma, req.user, customerId);
    return this.walletsService.getTransactions(customerId, page, limit);
  }

  // K1: kredit saldo langsung TANPA pembayaran → hanya admin (top-up manual).
  // Top-up pelanggan lewat Midtrans dibuat di Fase 2.
  @Post('customer/:customerId/topup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Top-up wallet manual (admin)' })
  async topup(
    @Param('customerId') customerId: string,
    @Body() topupWalletDto: TopupWalletDto,
  ) {
    return this.walletsService.topup(customerId, topupWalletDto);
  }

  // Rute `POST customer/:customerId/pay` dipindah ke LegacyWalletPayController
  // (modul payments) — Batch 1.5: satu jalur bayar-saldo dengan booking & kunci order.

  // K3: refund mandiri oleh customer ditutup; refund lewat admin
  // (POST /wallets/orders/:orderId/refund) sesuai kebijakan owner.
  @Post('customer/:customerId/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Refund paid order to customer wallet (admin)' })
  async refund(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() refundWalletDto: RefundWalletDto,
  ) {
    // Rute lama dipertahankan untuk kompatibilitas, tetapi kini hanya admin
    // dan memakai alur refund admin (cek outlet + idempoten). Order harus milik
    // customer di URL agar tidak salah sasaran.
    const order = await this.prisma.order.findUnique({
      where: { id: refundWalletDto.orderId },
      select: { customerId: true },
    });
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException('Order tidak ditemukan untuk customer ini');
    }
    return this.walletsService.refundByAdmin(
      refundWalletDto.orderId,
      req.user.userId,
      refundWalletDto.description ?? 'Refund oleh admin',
    );
  }

  @Post('orders/:orderId/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Refund paid order to wallet by admin' })
  async refundByAdmin(
    @Param('orderId') orderId: string,
    @Request() req: any,
    @Body() dto: AdminRefundWalletDto,
  ) {
    return this.walletsService.refundByAdmin(
      orderId,
      req.user.userId,
      dto.description,
    );
  }

  @Post('customer/:customerId/pin/set')
  @ApiOperation({ summary: 'Set / ganti PIN wallet (ganti: wajib currentPin)' })
  async setPin(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() dto: SetWalletPinDto,
  ) {
    return this.walletsService.setPin(customerId, req.user.userId, dto.pin, dto.currentPin);
  }

  @Post('customer/:customerId/pin/verify')
  @ApiOperation({ summary: 'Verifikasi PIN wallet (penguncian 5×/15 menit)' })
  async verifyPin(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() dto: WalletPinDto,
  ) {
    return this.walletsService.verifyPin(
      customerId,
      req.user.userId,
      dto.pin,
      walletSessionKey(req.headers?.authorization),
    );
  }

  // ── Batch 4: rute PIN milik sendiri (customer dari JWT) ─────────────────
  @Get('me/pin')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Status PIN (ada/tidak, terkunci sampai)' })
  async myPinStatus(@Request() req: any) {
    const customerId = await this.walletsService.customerIdOf(req.user.userId);
    return this.walletsService.pinStatus(customerId, req.user.userId);
  }

  @Post('me/pin')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Set / ganti PIN (ganti: wajib currentPin)' })
  async setMyPin(@Body() dto: SetWalletPinDto, @Request() req: any) {
    const customerId = await this.walletsService.customerIdOf(req.user.userId);
    return this.walletsService.setPin(customerId, req.user.userId, dto.pin, dto.currentPin);
  }

  @Post('me/pin/verify')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Verifikasi PIN (penguncian 5×/15 menit)' })
  async verifyMyPin(@Body() dto: WalletPinDto, @Request() req: any) {
    const customerId = await this.walletsService.customerIdOf(req.user.userId);
    return this.walletsService.verifyPin(
      customerId,
      req.user.userId,
      dto.pin,
      walletSessionKey(req.headers?.authorization),
    );
  }
}
