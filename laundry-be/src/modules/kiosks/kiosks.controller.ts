import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KiosksService } from './kiosks.service';
import {
  CreateKioskDto,
  EnrollKioskDto,
  KioskCheckoutDto,
  UpdateKioskDto,
} from './dto/kiosk.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CreateOrderDto } from '../orders/dto/order.dto';
import { CreateGatewayPaymentDto } from '../payments/dto/payment.dto';

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

  @Public()
  @Post('device/enroll')
  @ApiOperation({ summary: 'Enroll kiosk device with a one-time code' })
  async enroll(@Body() dto: EnrollKioskDto) {
    return this.kiosksService.enroll(dto.code, dto.deviceId);
  }

  @Public()
  @Get('device/bootstrap')
  @ApiOperation({ summary: 'Restore an enrolled kiosk device' })
  async bootstrap(@Headers('authorization') authorization?: string) {
    return this.kiosksService.bootstrap(this.deviceToken(authorization));
  }

  @Public()
  @Post('device/heartbeat')
  @ApiOperation({ summary: 'Record kiosk heartbeat and return schedule state' })
  async heartbeat(@Headers('authorization') authorization?: string) {
    return this.kiosksService.heartbeat(this.deviceToken(authorization));
  }

  @Public()
  @Get('device/services')
  @ApiOperation({ summary: 'Get active services for an enrolled kiosk outlet' })
  async deviceServices(@Headers('authorization') authorization?: string) {
    return this.kiosksService.deviceServices(this.deviceToken(authorization));
  }

  @Public()
  @Post('device/session/start')
  @ApiOperation({ summary: 'Start a runtime session for an enrolled kiosk' })
  async startDeviceSession(@Headers('authorization') authorization?: string) {
    return this.kiosksService.startDeviceSession(this.deviceToken(authorization));
  }

  @Public()
  @Post('device/session/:sessionId/end')
  @ApiOperation({ summary: 'End a runtime session for an enrolled kiosk' })
  async endDeviceSession(
    @Param('sessionId') sessionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.endDeviceSession(
      this.deviceToken(authorization),
      sessionId,
    );
  }

  @Public()
  @Post('device/orders')
  @ApiOperation({ summary: 'Create an order from an enrolled kiosk' })
  async createDeviceOrder(
    @Body() dto: CreateOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.createDeviceOrder(
      this.deviceToken(authorization),
      dto,
    );
  }

  @Public()
  @Post('device/checkout')
  @ApiOperation({ summary: 'Checkout wallet kiosk via Promotion/Loyalty engine' })
  async checkoutDeviceOrder(
    @Body() dto: KioskCheckoutDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.checkoutDeviceOrder(
      this.deviceToken(authorization),
      dto,
    );
  }

  @Public()
  @Get('device/machines')
  @ApiOperation({ summary: 'List machines + availability for the kiosk outlet' })
  async deviceMachines(@Headers('authorization') authorization?: string) {
    return this.kiosksService.deviceMachines(this.deviceToken(authorization));
  }

  @Public()
  @Post('device/payments')
  @ApiOperation({ summary: 'Create a QRIS/VA charge for a kiosk order' })
  async createDevicePayment(
    @Body() dto: CreateGatewayPaymentDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.createDevicePayment(
      this.deviceToken(authorization),
      dto,
    );
  }

  @Public()
  @Get('device/payments/:paymentNumber/status')
  @ApiOperation({ summary: 'Poll payment status for a kiosk order' })
  async devicePaymentStatus(
    @Param('paymentNumber') paymentNumber: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.devicePaymentStatus(
      this.deviceToken(authorization),
      paymentNumber,
    );
  }

  @Public()
  @Post('device/payments/:paymentNumber/simulate')
  @ApiOperation({ summary: '[DEV] Simulate a successful kiosk payment' })
  async simulateDevicePayment(
    @Param('paymentNumber') paymentNumber: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.simulateDevicePayment(
      this.deviceToken(authorization),
      paymentNumber,
    );
  }

  @Public()
  @Get('device/orders/:orderId/machine-status')
  @ApiOperation({ summary: 'Poll machine activation status for a kiosk order' })
  async deviceMachineStatus(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.kiosksService.deviceMachineStatus(
      this.deviceToken(authorization),
      orderId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all kiosks' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAll(
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
    @Query('outletId') outletId?: string,
  ) {
    return this.kiosksService.findAll(page, limit, outletId);
  }

  @Get('assigned')
  @ApiOperation({ summary: 'Get active kiosks assigned to the staff outlet' })
  async findAssigned(@Req() req: any) {
    return this.kiosksService.findAssigned(req.user.userId);
  }

  @Post(':id/enrollment-code')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Generate a one-time enrollment code' })
  async generateEnrollmentCode(@Param('id') id: string) {
    return this.kiosksService.generateEnrollmentCode(id);
  }

  @Post(':id/enrollment/revoke')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Revoke an enrolled kiosk device' })
  async revokeEnrollment(@Param('id') id: string) {
    return this.kiosksService.revokeEnrollment(id);
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
  async startSession(
    @Param('id') id: string,
    @Body() startSessionDto: StartSessionDto,
    @Req() req: any,
  ) {
    return this.kiosksService.startSession(
      id,
      startSessionDto.customerId,
      req.user.userId,
    );
  }

  @Post('session/:sessionId/end')
  @ApiOperation({ summary: 'End kiosk session' })
  async endSession(@Param('sessionId') sessionId: string) {
    return this.kiosksService.endSession(sessionId);
  }

  private deviceToken(authorization?: string) {
    return authorization?.replace(/^Bearer\s+/i, '').trim() || '';
  }
}
