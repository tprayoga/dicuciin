import { Controller, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CheckoutDto, RefundTransactionDto, TopUpDto } from './dto/transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireWalletAuthorization, walletSessionKey } from '../../common/auth/wallet-pin';
import { scopeCheckoutIdentity } from '../../common/auth/access-policy';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('quote')
  @ApiOperation({ summary: 'Preview perhitungan harga (pricing breakdown)' })
  async quote(@Body() dto: CheckoutDto, @Request() req: any) {
    // K8: customer hanya atas nama sendiri; partner hanya partner miliknya.
    return this.transactionService.quote(
      await scopeCheckoutIdentity(this.prisma, req.user, dto),
    );
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout: harga → order → bayar wallet → settle loyalty' })
  async checkout(@Body() dto: CheckoutDto, @Request() req: any) {
    // K8: mencegah memotong saldo customer/partner lain.
    const scoped = await scopeCheckoutIdentity(this.prisma, req.user, dto);
    // Batch 4 (S5): debit saldo CUSTOMER wajib PIN (atau bukti /pin/verify).
    // Dompet partner B2B belum punya PIN (dicatat sebagai risiko).
    if (!scoped.partnerId && scoped.customerId) {
      await requireWalletAuthorization(
        this.prisma,
        scoped.customerId,
        dto.pin,
        walletSessionKey(req.headers?.authorization),
      );
    }
    const { pin: _pin, ...input } = scoped;
    return this.transactionService.checkout(input);
  }

  // K9: kredit saldo tanpa pembayaran → hanya admin (top-up manual).
  @Post('topup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Top up MAIN_BALANCE manual (admin) + trigger cashback top up' })
  async topUp(@Body() dto: TopUpDto) {
    return this.transactionService.topUp(dto);
  }

  @Post(':id/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Refund: balikkan saldo/poin/voucher/tier' })
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundTransactionDto,
    @Request() req: any,
  ) {
    return this.transactionService.refund(id, req.user?.userId, dto.reason);
  }
}
