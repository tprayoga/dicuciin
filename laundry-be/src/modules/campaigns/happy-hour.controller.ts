import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CampaignService } from './campaign.service';
import { CreateHappyHourRuleDto, UpdateHappyHourRuleDto } from './dto/happy-hour.dto';

@ApiTags('Happy Hour')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('happy-hour')
export class HappyHourController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get('rules')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Daftar aturan happy hour' })
  async listRules() {
    return this.campaignService.listHappyHourRules();
  }

  @Post('rules')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Buat aturan happy hour' })
  async createRule(@Body() dto: CreateHappyHourRuleDto) {
    return this.campaignService.createHappyHourRule({
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Patch('rules/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Ubah aturan happy hour' })
  async updateRule(@Param('id') id: string, @Body() dto: UpdateHappyHourRuleDto) {
    return this.campaignService.updateHappyHourRule(id, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }
}
