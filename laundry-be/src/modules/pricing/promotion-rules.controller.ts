import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePromotionRuleDto, UpdatePromotionRuleDto } from './dto/promotion-rule.dto';
import { PromotionRuleService } from './promotion-rule.service';

@ApiTags('Promotion Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
@Controller('promotion-rules')
export class PromotionRulesController {
  constructor(private readonly promotionRuleService: PromotionRuleService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar loyalty/promotion rule aktif' })
  async findActive() {
    return this.promotionRuleService.findActive();
  }

  @Post()
  @ApiOperation({ summary: 'Buat loyalty/promotion rule' })
  async create(@Body() dto: CreatePromotionRuleDto) {
    return this.promotionRuleService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ubah loyalty/promotion rule' })
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionRuleDto) {
    return this.promotionRuleService.update(id, dto);
  }
}
