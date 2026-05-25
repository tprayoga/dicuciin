import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IotService } from './iot.service';
import { CreateIotDeviceDto, UpdateIotDeviceDto } from './dto/iot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

class SendCommandDto {
  @ApiProperty()
  @IsString()
  command: string;

  @ApiProperty({ required: false })
  @IsOptional()
  payload?: any;
}

@ApiTags('IoT')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Post('devices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Register new IoT device' })
  async createDevice(@Body() createIotDeviceDto: CreateIotDeviceDto) {
    return this.iotService.createDevice(createIotDeviceDto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get all IoT devices' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAllDevices(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('outletId') outletId?: string,
  ) {
    return this.iotService.findAllDevices(page, limit, outletId);
  }

  @Get('devices/:id')
  @ApiOperation({ summary: 'Get IoT device by ID' })
  async findOneDevice(@Param('id') id: string) {
    return this.iotService.findOneDevice(id);
  }

  @Patch('devices/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Update IoT device' })
  async updateDevice(@Param('id') id: string, @Body() updateIotDeviceDto: UpdateIotDeviceDto) {
    return this.iotService.updateDevice(id, updateIotDeviceDto);
  }

  @Delete('devices/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete IoT device' })
  async removeDevice(@Param('id') id: string) {
    return this.iotService.removeDevice(id);
  }

  @Post('devices/:id/heartbeat')
  @ApiOperation({ summary: 'Update device heartbeat' })
  async updateHeartbeat(@Param('id') id: string) {
    return this.iotService.updateHeartbeat(id);
  }

  @Post('devices/:id/commands')
  @ApiOperation({ summary: 'Send command to device' })
  async sendCommand(@Param('id') id: string, @Body() sendCommandDto: SendCommandDto) {
    return this.iotService.sendCommand(id, sendCommandDto.command, sendCommandDto.payload);
  }

  @Get('devices/:id/events')
  @ApiOperation({ summary: 'Get device events' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDeviceEvents(
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.iotService.getDeviceEvents(id, page, limit);
  }
}
