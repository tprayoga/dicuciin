import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { KiosksService } from './kiosks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class StartSessionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;
}

@ApiTags('Kiosks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kiosks')
export class KiosksController {
  constructor(private readonly kiosksService: KiosksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all kiosks' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAll(@Query('outletId') outletId?: string) {
    return this.kiosksService.findAll(outletId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get kiosk by ID' })
  async findOne(@Param('id') id: string) {
    return this.kiosksService.findOne(id);
  }

  @Post(':id/session/start')
  @ApiOperation({ summary: 'Start kiosk session' })
  async startSession(@Param('id') id: string, @Body() startSessionDto: StartSessionDto) {
    return this.kiosksService.startSession(id, startSessionDto.customerId);
  }

  @Post('session/:sessionId/end')
  @ApiOperation({ summary: 'End kiosk session' })
  async endSession(@Param('sessionId') sessionId: string) {
    return this.kiosksService.endSession(sessionId);
  }
}
