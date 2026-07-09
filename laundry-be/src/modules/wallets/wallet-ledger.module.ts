import { Module } from '@nestjs/common';
import { WalletLedgerService } from './wallet-ledger.service';

/**
 * Modul kernel untuk engine ledger saldo (SSoT `wallet_ledgers`). Diekspos
 * tersendiri agar domain lain (wallets, promos, payments, transactions,
 * campaigns, pricing) dapat memakainya tanpa membuat dependency melingkar
 * antar-modul fitur. Hanya bergantung pada PrismaModule (global).
 */
@Module({
  providers: [WalletLedgerService],
  exports: [WalletLedgerService],
})
export class WalletLedgerModule {}
