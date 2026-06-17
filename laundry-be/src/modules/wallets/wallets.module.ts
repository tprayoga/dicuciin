import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletService } from './wallet.service';
import { PromosModule } from '../promos/promos.module';

@Module({
  imports: [PromosModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletService],
  exports: [WalletsService, WalletService],
})
export class WalletsModule {}
