import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AllowKioskDevice } from '../../common/guards/jwt-or-kiosk-device.guard';
import { CalculatePricingDto } from './dto/calculate-pricing.dto';
import { PricingCalculationService } from './pricing-calculation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { scopeCheckoutIdentity } from '../../common/auth/access-policy';
import type { AuthenticatedKiosk } from '../../common/auth/kiosk-device';

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingCalculationService: PricingCalculationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('calculate')
  @AllowKioskDevice()
  @ApiOperation({
    summary:
      'Standalone pricing calculation (customer: atas nama sendiri; kiosk: tamu, outlet kiosk)',
  })
  async calculate(@Body() dto: CalculatePricingDto, @Request() req: any) {
    const kiosk = req.kiosk as AuthenticatedKiosk | undefined;
    if (kiosk) {
      // Perangkat kiosk: harga tamu di outlet kiosk itu sendiri. Identitas
      // customer/partner dari klien diabaikan (kiosk tidak terautentikasi
      // sebagai customer — mencegah mengintip harga tier/partner orang lain).
      return this.pricingCalculationService.calculate({
        ...dto,
        customerId: undefined,
        partnerId: undefined,
        outletId: kiosk.outletId,
        sourcePlatform: 'KIOSK',
      });
    }
    // K8: harga tier/partner orang lain tidak boleh dipakai/diintip.
    return this.pricingCalculationService.calculate(
      await scopeCheckoutIdentity(this.prisma, req.user, dto),
    );
  }
}
