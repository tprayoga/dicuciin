import { Controller, Get, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MobileMemberService } from './mobile-member.service';

@ApiTags('Mobile Member')
@ApiBearerAuth()
@Controller('mobile/me')
export class MobileMemberController {
  constructor(private readonly mobileMemberService: MobileMemberService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Ringkasan member untuk mobile app' })
  async summary(@Request() req: any) {
    return this.mobileMemberService.getSummary(req.user.userId);
  }

  @Get('vouchers')
  @ApiOperation({ summary: 'Voucher member login dikelompokkan berdasarkan status' })
  async vouchers(@Request() req: any) {
    return this.mobileMemberService.getVouchers(req.user.userId);
  }

  @Get('points')
  @ApiOperation({ summary: 'Saldo dan riwayat poin member login' })
  async points(@Request() req: any) {
    return this.mobileMemberService.getPoints(req.user.userId);
  }
}
