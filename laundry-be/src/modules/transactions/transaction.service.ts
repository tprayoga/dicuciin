import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserSegment,
  LedgerDirection,
  WalletType,
} from '@prisma/client';
import { generateDailySequence } from '../../common/utils/sequence.util';
import { toNum, D } from '../../common/utils/money.util';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletService } from '../wallets/wallet.service';
import { VoucherService } from '../vouchers/voucher.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { PromosService } from '../promos/promos.service';
import { CampaignService } from '../campaigns/campaign.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';

export interface CheckoutInput {
  customerId?: string;
  partnerId?: string;
  outletId: string;
  items: { serviceId: string; quantity: number; notes?: string }[];
  voucherCode?: string;
  promoCode?: string;
  deliveryFee?: number;
  sourcePlatform?: string;
  staffUserId?: string;
  kioskId?: string;
}

/** Detail perhitungan untuk response API (tugas 9). */
export interface TransactionResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  segment: UserSegment;
  breakdown: {
    basePrice: number;
    b2bDiscount: number;
    happyHourDiscount: number;
    voucherDiscount: number;
    promoDiscount: number;
    deliveryFee: number;
    finalAmount: number;
    bonusBalanceUsed: number;
    mainBalanceUsed: number;
    pointEarned: number;
    cashbackCredited: number;
    voucherCode?: string;
  };
}

/**
 * Orchestrator checkout & refund yang mengintegrasikan Promotion & Loyalty Engine
 * ke flow transaksi. ADITIF — tidak mengubah `OrdersService.create`/`WalletsService.pay`
 * yang sudah ada (dipakai mobile). Semua mutasi (saldo/poin/voucher/tier) terjadi
 * dalam SATU transaksi DB + ditulis ke ledger (keputusan 9).
 */
@Injectable()
export class TransactionService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private pricingService: PricingService,
    private walletService: WalletService,
    private voucherService: VoucherService,
    private pointService: PointService,
    private membershipTierService: MembershipTierService,
    private b2bPartnerService: B2BPartnerService,
    private promosService: PromosService,
    private campaignService: CampaignService,
    private loyaltyConfig: LoyaltyConfigService,
  ) {}

  /**
   * Top up saldo MAIN + trigger kampanye CASHBACK_TOPUP (cashback → BONUS).
   * Satu transaksi; cashback idempoten per top up.
   */
  async topUp(input: { customerId: string; amount: number; idempotencyKey?: string }) {
    const wallet = await this.walletService.getOrCreateWallet({ customerId: input.customerId });
    return this.prisma.$transaction(async (tx) => {
      const ledger = await this.walletService.topUp({
        walletId: wallet.id,
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
        referenceType: 'TOPUP',
        tx,
      });
      const cashback = await this.campaignService.handleTopupCashback(tx, {
        customerId: input.customerId,
        walletId: wallet.id,
        topupAmount: input.amount,
        sourceRefId: ledger.id,
      });
      return {
        ledgerId: ledger.id,
        mainBalanceAdded: input.amount,
        bonusCashback: toNum(cashback),
      };
    });
  }

  /** Preview perhitungan tanpa membuat order (tugas 9). */
  async quote(input: CheckoutInput) {
    const ctx =
      input.customerId || input.partnerId
        ? await this.resolveContext(input)
        : {
            segment: UserSegment.RETAIL,
            tier: null,
            b2bTier: null,
            walletId: '',
          };
    const { orderItems } = await this.ordersService.priceItems(input.outletId, input.items);
    return this.pricingService.calculate({
      segment: ctx.segment,
      items: orderItems.map((it) => ({
        serviceId: it.serviceId,
        machineType: it.machineType,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
      voucherCode: input.voucherCode,
      promoCode: input.promoCode,
      outletId: input.outletId,
      customerId: input.customerId,
      partnerId: input.partnerId,
      tier: ctx.tier,
      b2bTier: ctx.b2bTier,
      deliveryFee: input.deliveryFee,
    });
  }

  /** Checkout penuh: harga → order → bayar wallet → settle loyalty. */
  async checkout(input: CheckoutInput): Promise<TransactionResult> {
    const ctx = await this.resolveContext(input);
    const { orderItems, subtotal } = await this.ordersService.priceItems(
      input.outletId,
      input.items,
    );

    const pricing = await this.pricingService.calculate({
      segment: ctx.segment,
      items: orderItems.map((it) => ({
        serviceId: it.serviceId,
        machineType: it.machineType,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
      voucherCode: input.voucherCode,
      promoCode: input.promoCode,
      outletId: input.outletId,
      customerId: input.customerId,
      partnerId: input.partnerId,
      tier: ctx.tier,
      b2bTier: ctx.b2bTier,
      deliveryFee: input.deliveryFee,
    });

    const deliveryFee = D(input.deliveryFee ?? 0);
    const totalAmount = D(pricing.finalAmount);
    const discountAmount = subtotal.minus(D(pricing.spendingAmount));

    // Nomor order dibuat di luar transaksi utama (advisory lock punya tx sendiri).
    const orderNumber = await generateDailySequence(
      this.prisma,
      'ORD',
      'order',
      'orderNumber',
      6,
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId: input.customerId,
            partnerId: input.partnerId,
            outletId: input.outletId,
            kioskId: input.kioskId,
            staffUserId: input.staffUserId,
            promoId: pricing.promoId,
            sourcePlatform: input.sourcePlatform ?? 'MOBILE_APP',
            subtotal,
            discountAmount,
            deliveryFee,
            totalAmount,
            status: OrderStatus.DRAFT,
            items: { create: orderItems.map(({ machineType, ...item }) => item) },
            statusLogs: {
              create: { status: OrderStatus.DRAFT, notes: 'Order created', createdBy: input.staffUserId },
            },
          },
        });

        // Bayar wallet: BONUS dulu, sisanya MAIN (saldo tak boleh minus).
        let bonusUsed = new Prisma.Decimal(0);
        let mainUsed = new Prisma.Decimal(0);
        if (totalAmount.gt(0)) {
          const paid = await this.walletService.payWithWallet(tx, {
            walletId: ctx.walletId,
            amount: totalAmount,
            orderId: order.id,
            allowBonus: true,
          });
          bonusUsed = paid.bonusUsed;
          mainUsed = paid.mainUsed;
        }

        await tx.payment.create({
          data: {
            orderId: order.id,
            paymentNumber: `PAY-${orderNumber}`,
            paymentMethod: PaymentMethod.WALLET,
            amount: totalAmount,
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            notes: 'Pembayaran wallet (loyalty checkout)',
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAID },
        });
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: OrderStatus.PAID,
            notes: 'Dibayar via wallet',
            createdBy: input.customerId ?? input.staffUserId,
          },
        });

        // --- Settle loyalty (semua dalam transaksi yang sama) ---
        if (pricing.happyHourRules?.length) {
          await this.campaignService.consumeHappyHourQuota(
            tx,
            pricing.happyHourRules.map((rule) => ({
              ruleId: rule.ruleId,
              quantity: rule.quantity,
            })),
          );
        }

        if (pricing.b2bPricingRules?.length) {
          await (tx as any).b2BPricingRuleUsage.createMany({
            data: pricing.b2bPricingRules.map((rule) => ({
              orderId: order.id,
              ruleId: rule.ruleId,
              partnerId: input.partnerId,
              discountAmount: new Prisma.Decimal(rule.discountAmount),
            })),
            skipDuplicates: true,
          });
        }

        if (pricing.voucherId) {
          await this.voucherService.redeem(tx, {
            userVoucherId: pricing.voucherId,
            orderId: order.id,
            customerId: input.customerId,
            partnerId: input.partnerId,
            discountApplied: pricing.voucherDiscount,
          });
        }
        if (pricing.promoId) {
          await this.promosService.commitUsage(tx, order.id);
        }

        // Poin dari transaksi sukses (bukan top up).
        if (pricing.pointsToEarn > 0) {
          await this.pointService.earn({
            walletId: ctx.walletId,
            points: pricing.pointsToEarn,
            orderId: order.id,
            sourceType: 'ORDER',
            idempotencyKey: `point-earn-${order.id}`,
            tx,
          });
        }

        // Cashback tier → BONUS_BALANCE.
        let cashbackCredited = new Prisma.Decimal(0);
        if (pricing.cashbackToCredit > 0) {
          await this.walletService.creditCashback({
            walletId: ctx.walletId,
            amount: pricing.cashbackToCredit,
            orderId: order.id,
            referenceType: 'TIER_CASHBACK',
            referenceId: order.id,
            idempotencyKey: `cashback-tier-${order.id}`,
            tx,
          });
          cashbackCredited = D(pricing.cashbackToCredit);
        }

        // Update tier (top up tidak ikut; basis = nilai transaksi).
        if (input.customerId) {
          await this.membershipTierService.recordSuccessfulTransaction(
            tx,
            input.customerId,
            pricing.spendingAmount,
          );
          // Trigger REFERRAL: reward saat transaksi pertama referee (bukan saat daftar).
          await this.campaignService.qualifyReferralOnFirstTransaction(
            tx,
            input.customerId,
            order.id,
          );
        } else if (input.partnerId) {
          await this.b2bPartnerService.recordSuccessfulTransaction(
            tx,
            input.partnerId,
            pricing.spendingAmount,
          );
        }

        return { order, bonusUsed, mainUsed, cashbackCredited };
      });

      return {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        status: OrderStatus.PAID,
        segment: ctx.segment,
        breakdown: {
          basePrice: pricing.basePrice,
          b2bDiscount: pricing.b2bDiscount,
          happyHourDiscount: pricing.happyHourDiscount,
          voucherDiscount: pricing.voucherDiscount,
          promoDiscount: pricing.promoDiscount,
          deliveryFee: pricing.deliveryFee,
          finalAmount: pricing.finalAmount,
          bonusBalanceUsed: toNum(result.bonusUsed),
          mainBalanceUsed: toNum(result.mainUsed),
          pointEarned: pricing.pointsToEarn,
          cashbackCredited: toNum(result.cashbackCredited),
          voucherCode: pricing.voucherCode,
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Order sudah dibayar');
      }
      throw err;
    }
  }

  /**
   * Refund: balikkan saldo (per bucket dari ledger), tarik poin, rollback voucher,
   * turunkan akumulasi tier — semua dicatat di ledger (keputusan 9 & 10).
   */
  async refund(orderId: string, actorUserId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { where: { status: PaymentStatus.PAID }, orderBy: { paidAt: 'desc' }, take: 1 },
        walletLedgers: { where: { direction: LedgerDirection.DEBIT } },
      },
    });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.status === OrderStatus.REFUNDED) {
      throw new ConflictException('Order sudah direfund');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Hanya order PAID yang bisa direfund');
    }
    const payment = order.payments[0];
    if (!payment) throw new BadRequestException('Pembayaran lunas tidak ditemukan');

    const walletId = order.walletLedgers[0]?.walletId;
    const spending = D(order.totalAmount).minus(order.deliveryFee);

    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PAID },
        data: { status: PaymentStatus.REFUNDED, notes: reason },
      });
      if (marked.count === 0) throw new ConflictException('Order sudah direfund');

      // Kembalikan saldo per bucket (MAIN→MAIN, BONUS→BONUS) dari ledger debit.
      for (const ledger of order.walletLedgers) {
        await this.walletService.credit(ledger.walletType, {
          walletId: ledger.walletId,
          amount: ledger.amount,
          orderId: order.id,
          referenceType: 'REFUND',
          referenceId: order.id,
          idempotencyKey: `refund-${order.id}-${ledger.walletType}`,
          description: reason,
          tx,
        });
      }

      // Tarik kembali poin yang sempat diberikan.
      if (walletId) {
        await this.pointService.reverseForOrder(tx, walletId, order.id);
      }

      // Cashback tier (CREDIT BONUS saat PAID) — di-debit balik HANYA bila flag aktif
      // (LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND=true). Default: tidak ditarik (perilaku
      // lama). Aman karena cashback dapat dilacak via ledger (referenceType TIER_CASHBACK)
      // dan di-clamp ke saldo bonus tersisa agar tak minus.
      if (this.loyaltyConfig.reverseTierCashbackOnRefund) {
        const cashbackLedgers = await tx.walletLedger.findMany({
          where: {
            orderId: order.id,
            walletType: WalletType.BONUS_BALANCE,
            direction: LedgerDirection.CREDIT,
            referenceType: 'TIER_CASHBACK',
          },
        });
        for (const cb of cashbackLedgers) {
          const w = await tx.wallet.findUnique({ where: { id: cb.walletId } });
          if (!w) continue;
          const reversible = Prisma.Decimal.min(D(cb.amount), D(w.bonusBalance));
          if (reversible.gt(0)) {
            await this.walletService.debit(WalletType.BONUS_BALANCE, {
              walletId: cb.walletId,
              amount: reversible,
              orderId: order.id,
              referenceType: 'REFUND_CASHBACK_REVERSAL',
              referenceId: order.id,
              idempotencyKey: `refund-cashback-${order.id}-${cb.id}`,
              description: reason,
              tx,
            });
          }
        }
      }

      // Rollback voucher → ACTIVE kembali bila masih berlaku.
      await this.voucherService.reverseRedemption(tx, order.id);

      // Turunkan akumulasi tier.
      if (order.customerId) {
        await this.membershipTierService.reverseTransaction(tx, order.customerId, spending);
      } else if (order.partnerId) {
        await this.b2bPartnerService.reverseTransaction(tx, order.partnerId, spending);
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.REFUNDED, cancelReason: reason },
      });
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          status: OrderStatus.REFUNDED,
          notes: reason,
          createdBy: actorUserId,
        },
      });

      return { orderId: order.id, status: updated.status, refundedAmount: toNum(payment.amount) };
    });
  }

  /** Tentukan segment, tier, dan wallet pemilik (retail/B2B). */
  private async resolveContext(input: CheckoutInput) {
    if (input.partnerId) {
      const partner = await this.prisma.b2BPartner.findUnique({
        where: { id: input.partnerId },
      });
      if (!partner) throw new NotFoundException('Partner tidak ditemukan');
      if (partner.status !== 'ACTIVE') {
        throw new BadRequestException('Partner B2B belum approved/aktif');
      }
      const wallet = await this.walletService.getOrCreateWallet({ partnerId: partner.id });
      return {
        segment: UserSegment.B2B,
        tier: null,
        b2bTier: partner.tier,
        walletId: wallet.id,
      };
    }
    if (input.customerId) {
      const status = await this.membershipTierService.ensureStatus(input.customerId);
      const wallet = await this.walletService.getOrCreateWallet({ customerId: input.customerId });
      return {
        segment: UserSegment.RETAIL,
        tier: status.currentTier,
        b2bTier: null,
        walletId: wallet.id,
      };
    }
    throw new BadRequestException('customerId atau partnerId wajib diisi');
  }
}
