import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, WhatsappService],
  exports: [NotificationsService, WhatsappService],
})
export class NotificationsModule {}
