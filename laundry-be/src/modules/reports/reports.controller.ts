import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('outlets')
  @ApiOperation({ summary: 'Ringkasan performa per outlet' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async getOutletSummary(@Query('outletId') outletId?: string) {
    return this.reportsService.getOutletSummary(outletId);
  }

  @Get('top-services')
  @ApiOperation({ summary: 'Top 10 layanan berdasarkan revenue' })
  @ApiQuery({ name: 'month', required: false, type: String, example: '2026-05' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async getTopServices(
    @Query('month') month?: string,
    @Query('outletId') outletId?: string,
  ) {
    return this.reportsService.getTopServices(month, outletId);
  }
}
