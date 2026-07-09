import { Module } from '@nestjs/common';
import { PromosController } from './promos.controller';
import { PromosService } from './promos.service';
import { WalletLedgerModule } from '../wallets/wallet-ledger.module';

@Module({
  imports: [WalletLedgerModule],
  controllers: [PromosController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
