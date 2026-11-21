/** Smoke DI: seluruh AppModule bisa dirakit (dependensi baru Batch 1 terselesaikan). */
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { TransactionService } from '../../src/modules/transactions/transaction.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

it('AppModule terkompilasi dan service inti Batch 1 dapat di-resolve', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  for (const svc of [BookingsService, PaymentsService, OrdersService, TransactionService]) {
    expect(moduleRef.get(svc)).toBeDefined();
  }
  await moduleRef.close();
});
