import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, CreateServicePriceDto, UpdateServiceDto } from './dto/service.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create new service' })
  async createService(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.createService(createServiceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all services' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllServices(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.servicesService.findAllServices(page, limit);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update service' })
  async updateService(@Param('id') id: string, @Body() updateServiceDto: UpdateServiceDto) {
    return this.servicesService.updateService(id, updateServiceDto);
  }

  @Post('prices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Create service price' })
  async createServicePrice(@Body() createServicePriceDto: CreateServicePriceDto) {
    return this.servicesService.createServicePrice(createServicePriceDto);
  }

  @Get('prices')
  @ApiOperation({ summary: 'Get all service prices' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAllServicePrices(@Query('outletId') outletId?: string) {
    return this.servicesService.findAllServicePrices(outletId);
  }
}
