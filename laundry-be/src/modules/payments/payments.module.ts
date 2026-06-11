import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { MockPaymentGateway } from './gateway/mock-payment-gateway';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Binding gateway: ganti MockPaymentGateway dengan provider nyata
    // (Midtrans/Xendit) saat kredensial siap — sisanya tak perlu berubah.
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
})
export class PaymentsModule {}
