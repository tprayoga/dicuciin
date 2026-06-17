import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateVoucherTemplateDto,
  IssueVoucherDto,
  UpdateVoucherTemplateDto,
  VoucherQueryDto,
} from './dto/voucher.dto';
import { VoucherService } from './voucher.service';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get('templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Daftar template voucher' })
  async listTemplates(@Query() query: VoucherQueryDto) {
    return this.voucherService.listTemplates(query.segment);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Voucher milik user login' })
  async mine(@Request() req: any, @Query() query: VoucherQueryDto) {
    return this.voucherService.listForUser(req.user?.userId, query.status);
  }

  @Post('templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Buat template voucher' })
  async createTemplate(@Body() dto: CreateVoucherTemplateDto) {
    return this.voucherService.createTemplate(this.voucherService.mapTemplateDto(dto));
  }

  @Patch('templates/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Ubah template voucher' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherTemplateDto,
  ) {
    return this.voucherService.updateTemplate(id, this.voucherService.mapTemplateDto(dto));
  }

  @Get('issued')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Daftar voucher yang sudah diterbitkan' })
  async listIssued(@Query() query: VoucherQueryDto) {
    return this.voucherService.listIssued(query.status, query.segment);
  }

  @Post('issue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Terbitkan voucher manual' })
  async issue(@Body() dto: IssueVoucherDto) {
    return this.voucherService.issue({
      ...dto,
      sourceType: dto.sourceType ?? 'MANUAL',
    });
  }

  @Get('redemptions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Daftar redemption voucher' })
  async redemptions() {
    return this.voucherService.listRedemptions();
  }
}
