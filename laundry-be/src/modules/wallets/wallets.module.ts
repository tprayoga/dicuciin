import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletLedgerModule } from './wallet-ledger.module';
import { PromosModule } from '../promos/promos.module';

@Module({
  imports: [PromosModule, WalletLedgerModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  // Re-export WalletLedgerModule agar konsumen lama (payments, transactions,
  // campaigns, pricing) yang meng-import WalletsModule tetap memperoleh
  // WalletLedgerService tanpa perubahan.
  exports: [WalletsService, WalletLedgerModule],
})
export class WalletsModule {}
