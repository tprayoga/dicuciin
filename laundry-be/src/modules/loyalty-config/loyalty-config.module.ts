import { Global, Module } from '@nestjs/common';
import { LoyaltyConfigService } from './loyalty-config.service';

/**
 * Global agar `LoyaltyConfigService` bisa di-inject di modul mana pun (pricing,
 * payments, transactions) tanpa import berulang — pola yang sama dengan QueuesModule.
 */
@Global()
@Module({
  providers: [LoyaltyConfigService],
  exports: [LoyaltyConfigService],
})
export class LoyaltyConfigModule {}
