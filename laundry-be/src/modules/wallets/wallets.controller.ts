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
  ForbiddenException,
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
  PayWithWalletDto,
  RefundWalletDto,
  AdminRefundWalletDto,
} from './dto/wallet.dto';
import { WalletPinDto } from './dto/wallet-pin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * SECURITY HOTFIX (K4/K6): pelanggan hanya boleh mengakses dompet MILIKNYA.
   * Staf tetap seperti sebelumnya (kasir/admin melayani pelanggan).
   */
  private async assertOwnWalletOrStaff(req: any, customerId: string) {
    if (req.user?.role !== UserRole.CUSTOMER) return;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { userId: true },
    });
    if (!customer || customer.userId !== req.user.userId) {
      throw new ForbiddenException('Tidak boleh mengakses dompet pelanggan lain');
    }
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get customer wallet' })
  async getWallet(@Param('customerId') customerId: string, @Request() req: any) {
    await this.assertOwnWalletOrStaff(req, customerId);
    return this.walletsService.getWallet(customerId);
  }

  @Get('customer/:customerId/transactions')
  @ApiOperation({ summary: 'Get wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTransactions(
    @Param('customerId') customerId: string,
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
    @Request() req?: any,
  ) {
    await this.assertOwnWalletOrStaff(req, customerId);
    return this.walletsService.getTransactions(customerId, page, limit);
  }

  // SECURITY HOTFIX (K1): kredit saldo TANPA pembayaran → hanya admin (top-up manual).
  @Post('customer/:customerId/topup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Top-up wallet manual (admin)' })
  async topup(
    @Param('customerId') customerId: string,
    @Body() topupWalletDto: TopupWalletDto,
  ) {
    return this.walletsService.topup(customerId, topupWalletDto);
  }

  @Post('customer/:customerId/pay')
  @ApiOperation({ summary: 'Pay with wallet' })
  async pay(
    @Param('customerId') customerId: string,
    @Body() payWithWalletDto: PayWithWalletDto,
    @Request() req: any,
  ) {
    await this.assertOwnWalletOrStaff(req, customerId);
    return this.walletsService.pay(customerId, payWithWalletDto);
  }

  // SECURITY HOTFIX (K3): refund ke saldo hanya oleh admin (bukan mandiri).
  @Post('customer/:customerId/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Refund paid order to customer wallet (admin)' })
  async refund(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() refundWalletDto: RefundWalletDto,
  ) {
    return this.walletsService.refund(
      customerId,
      req.user.userId,
      refundWalletDto,
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
  @ApiOperation({ summary: 'Set / ganti PIN wallet' })
  async setPin(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() dto: WalletPinDto,
  ) {
    return this.walletsService.setPin(customerId, req.user.userId, dto.pin);
  }

  @Post('customer/:customerId/pin/verify')
  @ApiOperation({ summary: 'Verifikasi PIN wallet' })
  async verifyPin(
    @Param('customerId') customerId: string,
    @Request() req: any,
    @Body() dto: WalletPinDto,
  ) {
    return this.walletsService.verifyPin(customerId, req.user.userId, dto.pin);
  }
}
