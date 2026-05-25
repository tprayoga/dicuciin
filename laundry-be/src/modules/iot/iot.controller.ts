import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IotService } from './iot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
@UseGuards(JwtAuthGuard)
@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Get('devices')
  @ApiOperation({ summary: 'Get all IoT devices' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAllDevices(@Query('outletId') outletId?: string) {
    return this.iotService.findAllDevices(outletId);
  }

  @Get('devices/:id')
  @ApiOperation({ summary: 'Get IoT device by ID' })
  async findOneDevice(@Param('id') id: string) {
    return this.iotService.findOneDevice(id);
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
