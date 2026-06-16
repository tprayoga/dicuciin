import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PromosService } from './promos.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

class ValidatePromoItemDto {
  @ApiProperty({ required: false, description: 'ID layanan item' })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiProperty({ description: 'Subtotal item' })
  @IsNumber()
  subtotal: number;
}

class ValidatePromoDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({
    required: false,
    description: 'Item pesanan (untuk promo terbatas layanan). Lebih akurat.',
    type: [ValidatePromoItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidatePromoItemDto)
  @IsOptional()
  items?: ValidatePromoItemDto[];

  @ApiProperty({ required: false, description: 'Fallback bila items tidak dikirim' })
  @IsNumber()
  @IsOptional()
  orderAmount?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  outletId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  deliveryFee?: number;
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
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
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
  async validate(@Body() dto: ValidatePromoDto, @Request() req: any) {
    return this.promosService.validatePromo(req.user?.userId, dto.code, {
      items: dto.items,
      orderAmount: dto.orderAmount,
      outletId: dto.outletId,
      deliveryFee: dto.deliveryFee,
    });
  }
}
