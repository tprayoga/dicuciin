import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { B2BPartnerService } from './b2b-partner.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';

@ApiTags('B2B Partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnerService: B2BPartnerService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar partner B2B' })
  async findAll() {
    return this.partnerService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Buat partner B2B' })
  async create(@Body() dto: CreatePartnerDto) {
    return this.partnerService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail partner B2B' })
  async findOne(@Param('id') id: string) {
    return this.partnerService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Ubah partner B2B' })
  async update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.update(id, dto);
  }

  @Get(':id/wallet')
  @ApiOperation({ summary: 'Wallet/deposit partner' })
  async wallet(@Param('id') id: string) {
    return this.partnerService.getWallet(id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Transaksi partner B2B' })
  async transactions(@Param('id') id: string) {
    return this.partnerService.listTransactions(id);
  }
}
