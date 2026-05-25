import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KiosksService } from './kiosks.service';
import { CreateKioskDto, UpdateKioskDto } from './dto/kiosk.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

class StartSessionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;
}

@ApiTags('Kiosks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kiosks')
export class KiosksController {
  constructor(private readonly kiosksService: KiosksService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Create new kiosk' })
  async create(@Body() createKioskDto: CreateKioskDto) {
    return this.kiosksService.create(createKioskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all kiosks' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('outletId') outletId?: string,
  ) {
    return this.kiosksService.findAll(page, limit, outletId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get kiosk by ID' })
  async findOne(@Param('id') id: string) {
    return this.kiosksService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Update kiosk' })
  async update(@Param('id') id: string, @Body() updateKioskDto: UpdateKioskDto) {
    return this.kiosksService.update(id, updateKioskDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete kiosk' })
  async remove(@Param('id') id: string) {
    return this.kiosksService.remove(id);
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
