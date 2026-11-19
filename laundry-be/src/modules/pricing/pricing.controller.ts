import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalculatePricingDto } from './dto/calculate-pricing.dto';
import { PricingCalculationService } from './pricing-calculation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { scopeCheckoutIdentity } from '../../common/auth/access-policy';

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
  @ApiOperation({ summary: 'Standalone pricing calculation (customer: atas nama sendiri)' })
  async calculate(@Body() dto: CalculatePricingDto, @Request() req: any) {
    // K8: harga tier/partner orang lain tidak boleh dipakai/diintip.
    return this.pricingCalculationService.calculate(
      await scopeCheckoutIdentity(this.prisma, req.user, dto),
    );
  }
}
