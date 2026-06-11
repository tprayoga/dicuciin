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
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
  ) {
    return this.walletsService.getTransactions(customerId, page, limit);
  }

  @Post('customer/:customerId/topup')
  @ApiOperation({ summary: 'Top-up wallet' })
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
  ) {
    return this.walletsService.pay(customerId, payWithWalletDto);
  }

  @Post('customer/:customerId/refund')
  @ApiOperation({ summary: 'Refund paid order to customer wallet' })
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
