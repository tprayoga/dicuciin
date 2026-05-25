import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PromosService } from './promos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
@UseGuards(JwtAuthGuard)
@Controller('promos')
export class PromosController {
  constructor(private readonly promosService: PromosService) {}

  @Get()
  @ApiOperation({ summary: 'Get all promos' })
  async findAll() {
    return this.promosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get promo by ID' })
  async findOne(@Param('id') id: string) {
    return this.promosService.findOne(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate promo code' })
  async validate(@Body() validatePromoDto: ValidatePromoDto) {
    return this.promosService.validatePromo(
      validatePromoDto.code,
      validatePromoDto.customerId,
      validatePromoDto.orderAmount,
    );
  }
}
