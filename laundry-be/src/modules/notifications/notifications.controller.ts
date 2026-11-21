import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { NotificationsService } from './notifications.service';

/** Batch 6 (R1): kotak notifikasi milik sendiri (semua role yang login). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar notifikasi milik sendiri (terbaru dulu) + jumlah belum dibaca' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'before', required: false, description: 'ISO date — halaman berikutnya' })
  list(
    @Request() req: any,
    @Query('limit', new ParseOptionalIntPipe(30)) limit?: number,
    @Query('before') before?: string,
  ) {
    return this.notifications.listForUser(req.user.userId, limit ?? 30, before);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tandai satu notifikasi dibaca' })
  markRead(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tandai semua notifikasi dibaca' })
  markAllRead(@Request() req: any) {
    return this.notifications.markAllRead(req.user.userId);
  }
}
