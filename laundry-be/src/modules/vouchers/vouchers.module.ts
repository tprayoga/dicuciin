import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VoucherService } from './voucher.service';

@Module({
  controllers: [VouchersController],
  providers: [VoucherService],
  exports: [VoucherService],
})
export class VouchersModule {}
