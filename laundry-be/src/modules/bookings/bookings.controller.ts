import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, VerifyBookingDto } from './dto/booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Reservasi mesin (kunci untuk pemesan)' })
  async reserve(@Body() dto: CreateBookingDto, @Request() req: any) {
    return this.bookingsService.reserve(
      req.user?.userId,
      { deviceId: dto.deviceId, deviceCode: dto.deviceCode },
      dto.orderId,
    );
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verifikasi pemesan via scan QR mesin → aktifkan & buka' })
  async verify(@Body() dto: VerifyBookingDto, @Request() req: any) {
    return this.bookingsService.verifyByDeviceCode(req.user?.userId, dto.deviceCode);
  }

  @Get('active')
  @ApiOperation({ summary: 'Booking aktif milik customer' })
  async active(@Request() req: any) {
    return this.bookingsService.getActive(req.user?.userId);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Selesaikan pemakaian mesin (lepas kunci)' })
  async complete(@Param('id') id: string, @Request() req: any) {
    return this.bookingsService.complete(req.user?.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Batalkan reservasi yang belum aktif' })
  async cancel(@Param('id') id: string, @Request() req: any) {
    return this.bookingsService.cancel(req.user?.userId, id);
  }
}
