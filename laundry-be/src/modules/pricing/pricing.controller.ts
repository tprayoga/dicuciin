import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalculatePricingDto } from './dto/calculate-pricing.dto';
import { PricingCalculationService } from './pricing-calculation.service';

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingCalculationService: PricingCalculationService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Standalone pricing calculation' })
  async calculate(@Body() dto: CalculatePricingDto) {
    return this.pricingCalculationService.calculate(dto);
  }
}
