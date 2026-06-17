import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  ApplyReferralDto,
} from './dto/campaign.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferralStatus, UserRole } from '@prisma/client';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignService: CampaignService) {}

  // --- Referral (customer) — taruh sebelum :id agar tak bentrok route ---

  @Get('referral/code')
  @ApiOperation({ summary: 'Kode referral milik saya' })
  async myReferralCode(@Request() req: any) {
    return this.campaignService.getReferralCodeByUser(req.user?.userId);
  }

  @Post('referral/apply')
  @ApiOperation({ summary: 'Pakai kode referral (sebelum transaksi pertama)' })
  async applyReferral(@Body() dto: ApplyReferralDto, @Request() req: any) {
    return this.campaignService.applyReferralCodeByUser(dto.code, req.user?.userId);
  }

  @Get('referral/admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Daftar referral untuk admin' })
  async adminReferrals(
    @Query('status') status?: ReferralStatus,
    @Query('search') search?: string,
  ) {
    return this.campaignService.listReferrals({ status, search });
  }

  // --- Admin ---

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Buat campaign' })
  async create(@Body() dto: CreateCampaignDto) {
    return this.campaignService.create({
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Daftar campaign' })
  async findAll() {
    return this.campaignService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Detail campaign' })
  async findOne(@Param('id') id: string) {
    return this.campaignService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Ubah campaign' })
  async update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignService.update(id, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Post(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Aktifkan campaign' })
  async activate(@Param('id') id: string) {
    return this.campaignService.setActive(id, true);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Nonaktifkan campaign' })
  async deactivate(@Param('id') id: string) {
    return this.campaignService.setActive(id, false);
  }

  @Get(':id/logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Log eksekusi campaign' })
  async logs(@Param('id') id: string) {
    return this.campaignService.getExecutionLogs(id);
  }

  @Post('run/scheduled')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Jalankan campaign terjadwal manual (untuk uji)' })
  async runScheduled(@Query('date') date?: string) {
    return this.campaignService.runDaily(date ? new Date(date) : new Date());
  }

}
