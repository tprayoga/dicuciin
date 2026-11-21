import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationProcessor } from './processors/notification.processor';
import { IotCommandProcessor } from './processors/iot-command.processor';
import { PaymentCallbackProcessor } from './processors/payment-callback.processor';
import { QueuesService } from './queues.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          // Kosong → tanpa auth (dev). Production wajib diisi (insiden 2026-11-21).
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'notification' },
      { name: 'iot-command' },
      { name: 'payment-callback' },
    ),
  ],
  providers: [
    NotificationProcessor,
    IotCommandProcessor,
    PaymentCallbackProcessor,
    QueuesService,
  ],
  exports: [BullModule, QueuesService],
})
export class QueuesModule {}
