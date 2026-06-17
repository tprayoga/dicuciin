import { Controller, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CheckoutDto, RefundTransactionDto, TopUpDto } from './dto/transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Preview perhitungan harga (pricing breakdown)' })
  async quote(@Body() dto: CheckoutDto) {
    return this.transactionService.quote(dto);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout: harga → order → bayar wallet → settle loyalty' })
  async checkout(@Body() dto: CheckoutDto) {
    return this.transactionService.checkout(dto);
  }

  @Post('topup')
  @ApiOperation({ summary: 'Top up MAIN_BALANCE + trigger cashback top up' })
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
