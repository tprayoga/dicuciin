import { Prisma, UserSegment } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PromosService } from '../src/modules/promos/promos.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { WalletService } from '../src/modules/wallets/wallet.service';
import { VoucherService } from '../src/modules/vouchers/voucher.service';
import { PointService } from '../src/modules/points/point.service';
import { MembershipTierService } from '../src/modules/memberships/membership-tier.service';
import { B2BPartnerService } from '../src/modules/partners/b2b-partner.service';
import { CampaignService } from '../src/modules/campaigns/campaign.service';
import { B2BPricingService } from '../src/modules/pricing/b2b-pricing.service';
import { TransactionService } from '../src/modules/transactions/transaction.service';
import { LoyaltyConfigService } from '../src/modules/loyalty-config/loyalty-config.service';
import { IotMqttService } from '../src/modules/iot/iot-mqtt.service';
import { IotMachineService } from '../src/modules/iot/iot-machine.service';
import {
  seedPromoLoyaltySmokeData,
  TEST_CODES,
} from './seed-promo-loyalty-smoke';

type SmokeResult = {
  name: string;
  status: 'PASS' | 'FAIL';
  details?: Record<string, unknown>;
  error?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rupiah(value: number) {
  return new Prisma.Decimal(value).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

async function expectReject(name: string, fn: () => Promise<unknown>, contains: string) {
  try {
    await fn();
  } catch (error: any) {
    const message = error?.message ?? String(error);
    assert(
      message.toLowerCase().includes(contains.toLowerCase()),
      `${name}: expected error containing "${contains}", got "${message}"`,
    );
    return message;
  }
  throw new Error(`${name}: expected rejection containing "${contains}"`);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const results: SmokeResult[] = [];

  try {
    const seed = await seedPromoLoyaltySmokeData(prisma, { disconnect: false });

    const promos = new PromosService(prisma);
    const voucher = new VoucherService(prisma);
    const wallet = new WalletService(prisma);
    const loyaltyConfig = new LoyaltyConfigService();
    const point = new PointService(prisma, voucher, loyaltyConfig);
    const membership = new MembershipTierService(prisma);
    const b2b = new B2BPartnerService(prisma);
    const campaign = new CampaignService(prisma, voucher, wallet);
    const b2bPricing = new B2BPricingService(prisma);
    const pricing = new PricingService(
      prisma,
      promos,
      voucher,
      membership,
      b2b,
      campaign,
      b2bPricing,
      loyaltyConfig,
    );
    const orders = new OrdersService(prisma, promos);
    const iotMachine = new IotMachineService(prisma, new IotMqttService());
    const txService = new TransactionService(
      prisma,
      orders,
      pricing,
      wallet,
      voucher,
      point,
      membership,
      b2b,
      promos,
      campaign,
      loyaltyConfig,
      iotMachine,
    );

    const item = {
      serviceId: seed.serviceId,
      quantity: 1,
      notes: 'TEST smoke promo loyalty',
      machineType: seed.machineType ?? undefined,
    };
    const pricingItem = {
      serviceId: seed.serviceId,
      machineType: seed.machineType ?? undefined,
      quantity: 1,
      subtotal: seed.servicePrice,
    };

    const run = async (
      name: string,
      fn: () => Promise<Record<string, unknown> | void>,
    ) => {
      try {
        const details = ((await fn()) ?? {}) as Record<string, unknown>;
        results.push({ name, status: 'PASS', details });
      } catch (error: any) {
        results.push({ name, status: 'FAIL', error: error?.message ?? String(error) });
      }
    };

    const setHappyHourActive = async (active: boolean) => {
      await prisma.happyHourRule.update({
        where: { id: TEST_CODES.hhActive },
        data: { isActive: active, usedQuota: 0 },
      });
    };

    await run('A. Normal wallet payment + point + tier', async () => {
      await setHappyHourActive(false);
      const before = await prisma.wallet.findUniqueOrThrow({
        where: { id: seed.retailWalletId },
      });
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_NORMAL',
        items: [item],
      });
      const after = await prisma.wallet.findUniqueOrThrow({
        where: { id: seed.retailWalletId },
      });
      const pointLedger = await prisma.pointLedger.findFirst({
        where: { orderId: res.orderId, direction: 'CREDIT' },
      });
      const status = await prisma.userMembershipStatus.findUniqueOrThrow({
        where: { customerId: seed.retailCustomerId },
      });

      assert(res.breakdown.finalAmount === seed.servicePrice, 'normal final amount mismatch');
      assert(
        new Prisma.Decimal(before.balance).minus(after.balance).eq(seed.servicePrice),
        'wallet main deduction mismatch',
      );
      assert(pointLedger?.points === Math.floor(seed.servicePrice / 1000), 'point earning mismatch');
      assert(status.successfulTxnCount >= 1, 'membership transaction count not updated');
      return {
        orderNumber: res.orderNumber,
        finalAmount: res.breakdown.finalAmount,
        points: pointLedger?.points,
      };
    });

    await run('B1. Happy hour discount applies', async () => {
      await setHappyHourActive(true);
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_HAPPY_HOUR',
        items: [item],
      });
      const expectedDiscount = rupiah(seed.servicePrice * 0.2);
      const expectedFinal = seed.servicePrice - expectedDiscount;
      const hh = await prisma.happyHourRule.findUniqueOrThrow({
        where: { id: TEST_CODES.hhActive },
      });

      assert(res.breakdown.happyHourDiscount === expectedDiscount, 'happy hour discount mismatch');
      assert(res.breakdown.finalAmount === expectedFinal, 'happy hour final amount mismatch');
      assert(res.breakdown.mainBalanceUsed === expectedFinal, 'happy hour wallet deduction mismatch');
      assert(res.breakdown.pointEarned === Math.floor(expectedFinal / 1000), 'happy hour points mismatch');
      assert(hh.usedQuota === 1, 'happy hour quota not consumed');
      return {
        orderNumber: res.orderNumber,
        discount: res.breakdown.happyHourDiscount,
        finalAmount: res.breakdown.finalAmount,
        usedQuota: hh.usedQuota,
      };
    });

    await run('B2. Happy hour outside schedule does not apply', async () => {
      const outside = await pricing.calculate({
        segment: UserSegment.RETAIL,
        items: [pricingItem],
        outletId: seed.outletId,
        customerId: seed.retailCustomerId,
        at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      assert(outside.happyHourDiscount === 0, 'happy hour unexpectedly applies outside schedule');
      return { happyHourDiscount: outside.happyHourDiscount };
    });

    await run('C1. Voucher percentage discount', async () => {
      await setHappyHourActive(false);
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_VOUCHER_PERCENT',
        items: [item],
        voucherCode: TEST_CODES.voucherPercentCode,
      });
      const expectedDiscount = Math.min(rupiah(seed.servicePrice * 0.2), 15_000);
      assert(res.breakdown.voucherDiscount === expectedDiscount, 'percentage voucher discount mismatch');
      assert(res.breakdown.finalAmount === seed.servicePrice - expectedDiscount, 'percentage voucher final mismatch');
      const redemption = await prisma.voucherRedemption.findFirst({
        where: { orderId: res.orderId },
      });
      assert(Boolean(redemption), 'percentage voucher redemption not created');
      return {
        orderNumber: res.orderNumber,
        discount: res.breakdown.voucherDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('C2. Voucher fixed discount', async () => {
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_VOUCHER_FIXED',
        items: [item],
        voucherCode: TEST_CODES.voucherFixedCode,
      });
      assert(res.breakdown.voucherDiscount === 10_000, 'fixed voucher discount mismatch');
      assert(res.breakdown.finalAmount === seed.servicePrice - 10_000, 'fixed voucher final mismatch');
      return {
        orderNumber: res.orderNumber,
        discount: res.breakdown.voucherDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('C3. Expired voucher rejected', async () => {
      const message = await expectReject(
        'expired voucher',
        () =>
          txService.checkout({
            customerId: seed.retailCustomerId,
            outletId: seed.outletId,
            sourcePlatform: 'SMOKE_TEST_VOUCHER_EXPIRED',
            items: [item],
            voucherCode: TEST_CODES.voucherExpiredCode,
          }),
        'kedaluwarsa',
      );
      return { rejectedWith: message };
    });

    await run('C4. Voucher minimum transaction rejected', async () => {
      const message = await expectReject(
        'min transaction voucher',
        () =>
          txService.checkout({
            customerId: seed.retailCustomerId,
            outletId: seed.outletId,
            sourcePlatform: 'SMOKE_TEST_VOUCHER_MIN',
            items: [item],
            voucherCode: TEST_CODES.voucherMinCode,
          }),
        'Minimal transaksi',
      );
      return { rejectedWith: message };
    });

    await run('D1. B2B special pricing applies', async () => {
      await setHappyHourActive(false);
      const res = await txService.checkout({
        partnerId: seed.activePartnerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_B2B',
        items: [item],
      });
      const expectedDiscount = seed.servicePrice - 30_000;
      assert(res.breakdown.b2bDiscount === expectedDiscount, 'B2B discount mismatch');
      assert(res.breakdown.finalAmount === 30_000, 'B2B final amount mismatch');
      const usage = await prisma.b2BPricingRuleUsage.findFirst({
        where: { orderId: res.orderId, ruleId: TEST_CODES.b2bRule },
      });
      assert(Boolean(usage), 'B2B pricing attribution not created');
      return {
        orderNumber: res.orderNumber,
        b2bDiscount: res.breakdown.b2bDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('D2. Inactive B2B partner rejected', async () => {
      const message = await expectReject(
        'inactive partner',
        () =>
          txService.checkout({
            partnerId: seed.inactivePartnerId,
            outletId: seed.outletId,
            sourcePlatform: 'SMOKE_TEST_B2B_INACTIVE',
            items: [item],
          }),
        'belum approved',
      );
      return { rejectedWith: message };
    });

    await run('E1. B2B pricing + B2B voucher stack', async () => {
      const res = await txService.checkout({
        partnerId: seed.activePartnerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_B2B_VOUCHER',
        items: [item],
        voucherCode: TEST_CODES.voucherB2BCode,
      });
      assert(res.breakdown.b2bDiscount === seed.servicePrice - 30_000, 'B2B+voucher B2B discount mismatch');
      assert(res.breakdown.voucherDiscount === 5_000, 'B2B+voucher voucher discount mismatch');
      assert(res.breakdown.finalAmount === 25_000, 'B2B+voucher final mismatch');
      return {
        orderNumber: res.orderNumber,
        b2bDiscount: res.breakdown.b2bDiscount,
        voucherDiscount: res.breakdown.voucherDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('E2. Happy hour + voucher stack allowed by rule', async () => {
      await setHappyHourActive(true);
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_HH_VOUCHER',
        items: [item],
        voucherCode: TEST_CODES.voucherStackCode,
      });
      const expectedHappyHour = rupiah(seed.servicePrice * 0.2);
      const expectedFinal = seed.servicePrice - expectedHappyHour - 5_000;
      assert(res.breakdown.happyHourDiscount === expectedHappyHour, 'HH+voucher happy hour mismatch');
      assert(res.breakdown.voucherDiscount === 5_000, 'HH+voucher voucher mismatch');
      assert(res.breakdown.finalAmount === expectedFinal, 'HH+voucher final mismatch');
      return {
        orderNumber: res.orderNumber,
        happyHourDiscount: res.breakdown.happyHourDiscount,
        voucherDiscount: res.breakdown.voucherDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('A2. Bonus balance used before main balance', async () => {
      await setHappyHourActive(false);
      await prisma.wallet.update({
        where: { id: seed.retailWalletId },
        data: { bonusBalance: new Prisma.Decimal(20_000) },
      });
      try {
        const res = await txService.checkout({
          customerId: seed.retailCustomerId,
          outletId: seed.outletId,
          sourcePlatform: 'SMOKE_TEST_BONUS',
          items: [item],
        });
        assert(res.breakdown.bonusBalanceUsed === 20_000, 'bonus balance not used first');
        assert(
          res.breakdown.mainBalanceUsed === seed.servicePrice - 20_000,
          'main balance remainder mismatch',
        );
        return {
          orderNumber: res.orderNumber,
          bonusUsed: res.breakdown.bonusBalanceUsed,
          mainUsed: res.breakdown.mainBalanceUsed,
        };
      } finally {
        // Kembalikan ke 0 agar tidak mempengaruhi skenario lain.
        await prisma.wallet.update({
          where: { id: seed.retailWalletId },
          data: { bonusBalance: new Prisma.Decimal(0) },
        });
      }
    });

    await run('C5. Promo code discount + usage recorded', async () => {
      await setHappyHourActive(false);
      const promoBefore = await prisma.promo.findUniqueOrThrow({
        where: { code: TEST_CODES.promoFixedCode },
      });
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_PROMO',
        items: [item],
        promoCode: TEST_CODES.promoFixedCode,
      });
      assert(res.breakdown.promoDiscount === 8_000, 'promo discount mismatch');
      assert(
        res.breakdown.finalAmount === seed.servicePrice - 8_000,
        'promo final amount mismatch',
      );
      const usage = await prisma.promoUsage.findFirst({ where: { orderId: res.orderId } });
      assert(Boolean(usage), 'promo usage not recorded');
      const promoAfter = await prisma.promo.findUniqueOrThrow({
        where: { code: TEST_CODES.promoFixedCode },
      });
      assert(
        promoAfter.usedCount === promoBefore.usedCount + 1,
        'promo usedCount not incremented',
      );
      return {
        orderNumber: res.orderNumber,
        discount: res.breakdown.promoDiscount,
        finalAmount: res.breakdown.finalAmount,
      };
    });

    await run('D0. B2B quote reflects special pricing (preview, no order)', async () => {
      await setHappyHourActive(false);
      const quote = await txService.quote({
        partnerId: seed.activePartnerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_B2B_QUOTE',
        items: [item],
      });
      assert(quote.b2bDiscount === seed.servicePrice - 30_000, 'B2B quote discount mismatch');
      assert(quote.finalAmount === 30_000, 'B2B quote final amount mismatch');
      return { b2bDiscount: quote.b2bDiscount, finalAmount: quote.finalAmount };
    });

    await run('F1. Refund reverses wallet/point/voucher/tier', async () => {
      await setHappyHourActive(false);
      const walletBefore = await prisma.wallet.findUniqueOrThrow({
        where: { id: seed.retailWalletId },
      });
      const statusBefore = await prisma.userMembershipStatus.findUniqueOrThrow({
        where: { customerId: seed.retailCustomerId },
      });
      const res = await txService.checkout({
        customerId: seed.retailCustomerId,
        outletId: seed.outletId,
        sourcePlatform: 'SMOKE_TEST_REFUND',
        items: [item],
        voucherCode: TEST_CODES.voucherRefundCode,
      });
      const usedVoucher = await prisma.userVoucher.findUniqueOrThrow({
        where: { code: TEST_CODES.voucherRefundCode },
      });
      assert(usedVoucher.status === 'USED', 'refund voucher not USED before refund');

      await txService.refund(res.orderId, seed.retailCustomerId, 'SMOKE refund reversal');

      const order = await prisma.order.findUniqueOrThrow({ where: { id: res.orderId } });
      const walletAfter = await prisma.wallet.findUniqueOrThrow({
        where: { id: seed.retailWalletId },
      });
      const statusAfter = await prisma.userMembershipStatus.findUniqueOrThrow({
        where: { customerId: seed.retailCustomerId },
      });
      const voucherAfter = await prisma.userVoucher.findUniqueOrThrow({
        where: { code: TEST_CODES.voucherRefundCode },
      });
      const redemption = await prisma.voucherRedemption.findFirst({
        where: { orderId: res.orderId },
      });

      assert(order.status === 'REFUNDED', 'order not refunded');
      assert(
        new Prisma.Decimal(walletAfter.balance).eq(walletBefore.balance),
        'main balance not fully restored after refund',
      );
      assert(
        new Prisma.Decimal(walletAfter.bonusBalance).eq(walletBefore.bonusBalance),
        'bonus balance not restored after refund',
      );
      assert(
        walletAfter.pointBalance === walletBefore.pointBalance,
        'point balance not reversed after refund',
      );
      assert(voucherAfter.status === 'ACTIVE', 'voucher not reactivated after refund');
      assert(redemption?.status === 'REVERSED', 'voucher redemption not marked REVERSED');
      assert(
        statusAfter.successfulTxnCount === statusBefore.successfulTxnCount,
        'tier transaction count not reversed after refund',
      );
      return {
        orderNumber: res.orderNumber,
        orderStatus: order.status,
        voucherStatus: voucherAfter.status,
        pointReversed: walletAfter.pointBalance === walletBefore.pointBalance,
      };
    });

    const failed = results.filter((result) => result.status === 'FAIL');
    console.log(JSON.stringify({ ok: failed.length === 0, seed, results }, null, 2));
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
