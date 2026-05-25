import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PromosService } from './promos.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

class ValidatePromoDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty()
  @IsNumber()
  orderAmount: number;
}

@ApiTags('Promos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('promos')
export class PromosController {
  constructor(private readonly promosService: PromosService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create new promo' })
  async create(@Body() createPromoDto: CreatePromoDto) {
    return this.promosService.create(createPromoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all promos' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.promosService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get promo by ID' })
  async findOne(@Param('id') id: string) {
    return this.promosService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update promo' })
  async update(@Param('id') id: string, @Body() updatePromoDto: UpdatePromoDto) {
    return this.promosService.update(id, updatePromoDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete promo' })
  async remove(@Param('id') id: string) {
    return this.promosService.remove(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate promo code' })
  async validate(@Body() dto: ValidatePromoDto) {
    return this.promosService.validatePromo(dto.code, dto.customerId, dto.orderAmount);
  }
}
