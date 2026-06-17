import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RedeemPointDto, RedeemPointVoucherDto } from './dto/point.dto';
import { PointService } from './point.service';

@ApiTags('Points')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('points')
export class PointsController {
  constructor(private readonly pointService: PointService) {}

  @Get('wallet/:walletId/balance')
  @ApiOperation({ summary: 'Saldo point wallet' })
  async getBalance(@Param('walletId') walletId: string, @Request() req: any) {
    return this.pointService.getBalanceForUser(walletId, req.user);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem point dasar (debit point ledger)' })
  async redeem(@Body() dto: RedeemPointDto, @Request() req: any) {
    return this.pointService.redeemForUser(dto, req.user);
  }

  @Post('redeem-voucher')
  @ApiOperation({ summary: 'Redeem point menjadi voucher secara atomik' })
  async redeemVoucher(@Body() dto: RedeemPointVoucherDto, @Request() req: any) {
    return this.pointService.redeemVoucherForUser(dto, req.user);
  }
}
