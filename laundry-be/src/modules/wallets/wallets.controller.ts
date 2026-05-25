import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { TopupWalletDto, PayWithWalletDto, RefundWalletDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get customer wallet' })
  async getWallet(@Param('customerId') customerId: string) {
    return this.walletsService.getWallet(customerId);
  }

  @Get('customer/:customerId/transactions')
  @ApiOperation({ summary: 'Get wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTransactions(
    @Param('customerId') customerId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.walletsService.getTransactions(customerId, page, limit);
  }

  @Post('customer/:customerId/topup')
  @ApiOperation({ summary: 'Top-up wallet' })
  async topup(@Param('customerId') customerId: string, @Body() topupWalletDto: TopupWalletDto) {
    return this.walletsService.topup(customerId, topupWalletDto);
  }

  @Post('customer/:customerId/pay')
  @ApiOperation({ summary: 'Pay with wallet' })
  async pay(@Param('customerId') customerId: string, @Body() payWithWalletDto: PayWithWalletDto) {
    return this.walletsService.pay(customerId, payWithWalletDto);
  }

  @Post('customer/:customerId/refund')
  @ApiOperation({ summary: 'Refund to wallet' })
  async refund(@Param('customerId') customerId: string, @Body() refundWalletDto: RefundWalletDto) {
    return this.walletsService.refund(customerId, refundWalletDto);
  }
}
