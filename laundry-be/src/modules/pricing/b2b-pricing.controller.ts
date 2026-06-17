import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { B2BPricingService } from './b2b-pricing.service';
import {
  CreateB2BPricingRuleDto,
  UpdateB2BPricingRuleDto,
} from './dto/b2b-pricing-rule.dto';

@ApiTags('B2B Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
@Controller('b2b-pricing')
export class B2BPricingController {
  constructor(private readonly b2bPricingService: B2BPricingService) {}

  @Get('rules')
  @ApiOperation({ summary: 'Daftar special pricing B2B' })
  async findAll() {
    return this.b2bPricingService.findAll();
  }

  @Post('rules')
  @ApiOperation({ summary: 'Buat special pricing B2B' })
  async create(@Body() dto: CreateB2BPricingRuleDto) {
    return this.b2bPricingService.create(dto);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Ubah special pricing B2B' })
  async update(@Param('id') id: string, @Body() dto: UpdateB2BPricingRuleDto) {
    return this.b2bPricingService.update(id, dto);
  }
}
