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
  PaymentStatus,
  UserSegment,
  LedgerDirection,
  WalletType,
} from '@prisma/client';
import { toNum, D } from '../../common/utils/money.util';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { VoucherService } from '../vouchers/voucher.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { PromosService } from '../promos/promos.service';
import { CampaignService } from '../campaigns/campaign.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';
import { IotMachineService } from '../iot/iot-machine.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderPricingSnapshot, readSnapshot } from '../orders/pricing-reservation';

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
  /** Booking mesin (Fase 1 Batch 1): order+booking+bayar dalam satu transaksi. */
  deviceId?: string;
  deviceCode?: string;
  scheduledAt?: string;
  /** Batch 3 (S1): bayar order yang SUDAH ada (bukan membuat order baru). */
  orderId?: string;
  notes?: string;
  customerAddressId?: string;
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
    private walletLedger: WalletLedgerService,
    private voucherService: VoucherService,
    private pointService: PointService,
    private membershipTierService: MembershipTierService,
    private b2bPartnerService: B2BPartnerService,
    private promosService: PromosService,
    private campaignService: CampaignService,
    private loyaltyConfig: LoyaltyConfigService,
    private iotMachineService: IotMachineService,
    // Batch 3: checkout saldo dilunasi lewat jalur bayar-saldo tunggal.
    private paymentsService: PaymentsService,
  ) {}

  /**
   * Top up saldo MAIN + trigger kampanye CASHBACK_TOPUP (cashback → BONUS).
   * Satu transaksi; cashback idempoten per top up.
   */
  async topUp(input: { customerId: string; amount: number; idempotencyKey?: string }) {
    const wallet = await this.walletLedger.getOrCreateWallet({ customerId: input.customerId });
    return this.prisma.$transaction(async (tx) => {
      const ledger = await this.walletLedger.topUp({
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
  /**
   * Batch 3 — SATU-SATUNYA perhitungan harga order (dipakai quote, pembuatan
   * order untuk QRIS/VA/saldo, dan kiosk): harga dasar → B2B → happy hour →
   * voucher/promo → accrual, plus estimasi durasi mesin. Tamu kiosk (tanpa
   * customer/partner) dihitung sebagai RETAIL tanpa tier.
   */
  async priceOrder(input: CheckoutInput) {
    const ctx =
      input.customerId || input.partnerId
        ? await this.resolveContext(input)
        : { segment: UserSegment.RETAIL, tier: null, b2bTier: null, walletId: '' };
    const { orderItems, subtotal, estimatedMinutes } = await this.ordersService.priceItems(
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
    return { ctx, orderItems, subtotal, estimatedMinutes, pricing };
  }

  /** Pratinjau harga — identik dengan yang akan ditagih saat order dibuat. */
  async quote(input: CheckoutInput) {
    const { pricing, estimatedMinutes } = await this.priceOrder(input);
    return { ...pricing, estimatedMinutes };
  }

  /**
   * Batch 3 (T3/T10/S1) — buat order (+ booking mesin) dengan harga final dari
   * mesin pricing tunggal. Order ini yang dibayar QRIS, VA, ATAU saldo.
   * Voucher & kuota happy hour direservasi di transaksi yang sama.
   */
  async createOrder(input: CheckoutInput, createdBy?: string) {
    const { orderItems, subtotal, estimatedMinutes, pricing } = await this.priceOrder(input);
    const deliveryFee = D(input.deliveryFee ?? 0);
    const snapshot: OrderPricingSnapshot = {
      version: 1,
      segment: input.partnerId ? 'B2B' : 'RETAIL',
      basePrice: pricing.basePrice,
      b2bDiscount: pricing.b2bDiscount,
      happyHourDiscount: pricing.happyHourDiscount,
      voucherDiscount: pricing.voucherDiscount,
      promoDiscount: pricing.promoDiscount,
      deliveryFee: pricing.deliveryFee,
      spendingAmount: pricing.spendingAmount,
      finalAmount: pricing.finalAmount,
      pointsToEarn: pricing.pointsToEarn,
      cashbackToCredit: pricing.cashbackToCredit,
      voucherId: pricing.voucherId ?? null,
      voucherCode: pricing.voucherCode ?? null,
      promoId: pricing.promoId ?? null,
      happyHourRules: pricing.happyHourRules ?? [],
      b2bPricingRules: pricing.b2bPricingRules ?? [],
      estimatedMinutes,
    };
    return this.ordersService.create(
      {
        customerId: input.customerId,
        outletId: input.outletId,
        kioskId: input.kioskId,
        staffUserId: input.staffUserId,
        sourcePlatform: input.sourcePlatform ?? 'MOBILE_APP',
        items: input.items as any,
        notes: input.notes,
        customerAddressId: input.customerAddressId,
        deviceId: input.deviceId,
        deviceCode: input.deviceCode,
        scheduledAt: input.scheduledAt,
      } as any,
      createdBy,
      {
        orderItems,
        subtotal,
        discountAmount: subtotal.minus(D(pricing.spendingAmount)),
        deliveryFee,
        totalAmount: D(pricing.finalAmount),
        promoId: pricing.promoId ?? null,
        partnerId: input.partnerId ?? null,
        snapshot,
      },
    );
  }

  /**
   * Checkout saldo (kiosk, app lama, B2B). Batch 3: TIDAK lagi membuat
   * pembayaran sendiri — membuat order ber-harga (atau memakai `orderId` yang
   * sudah ada) lalu membayarnya lewat jalur bayar-saldo tunggal
   * (PaymentsService → settlePaidInTx). Bila pembayaran gagal, order yang baru
   * dibuat dibatalkan (voucher, kuota, dan mesin dilepas) — tidak ada order yatim.
   */
  async checkout(input: CheckoutInput): Promise<TransactionResult> {
    const ctx = await this.resolveContext(input);
    let orderId = input.orderId;
    let createdHere = false;
    if (!orderId) {
      const order: any = await this.createOrder(input, input.customerId ?? input.staffUserId);
      orderId = order.id as string;
      createdHere = true;
    }
    const payer = input.partnerId ? { partnerId: input.partnerId } : { customerId: input.customerId };
    try {
      await this.paymentsService.payOrderWithWalletForPayer(payer, orderId);
    } catch (err) {
      if (createdHere) {
        await this.ordersService
          .cancel(orderId, { cancelReason: 'Pembayaran saldo gagal' }, undefined, undefined, { requireUnpaid: true })
          .catch(() => undefined);
      }
      throw err;
    }

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const snapshot = readSnapshot(order.pricingSnapshot);
    const ledgers = await this.prisma.walletLedger.findMany({ where: { orderId, walletId: ctx.walletId } });
    const sum = (pred: (l: (typeof ledgers)[number]) => boolean) =>
      ledgers.filter(pred).reduce((s, l) => s + toNum(l.amount), 0);
    const points = await this.prisma.pointLedger.aggregate({
      where: { orderId, direction: LedgerDirection.CREDIT, sourceType: 'ORDER' },
      _sum: { points: true },
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      segment: ctx.segment,
      breakdown: {
        basePrice: snapshot?.basePrice ?? toNum(order.subtotal),
        b2bDiscount: snapshot?.b2bDiscount ?? 0,
        happyHourDiscount: snapshot?.happyHourDiscount ?? 0,
        voucherDiscount: snapshot?.voucherDiscount ?? 0,
        promoDiscount: snapshot?.promoDiscount ?? 0,
        deliveryFee: toNum(order.deliveryFee),
        finalAmount: toNum(order.totalAmount),
        bonusBalanceUsed: sum((l) => l.direction === LedgerDirection.DEBIT && l.walletType === WalletType.BONUS_BALANCE),
        mainBalanceUsed: sum((l) => l.direction === LedgerDirection.DEBIT && l.walletType === WalletType.MAIN_BALANCE),
        pointEarned: points._sum.points ?? 0,
        cashbackCredited: sum((l) => l.direction === LedgerDirection.CREDIT && l.referenceType === 'TIER_CASHBACK'),
        voucherCode: snapshot?.voucherCode ?? undefined,
      },
    };
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
        await this.walletLedger.credit(ledger.walletType, {
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
            await this.walletLedger.debit(WalletType.BONUS_BALANCE, {
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
      const wallet = await this.walletLedger.getOrCreateWallet({ partnerId: partner.id });
      return {
        segment: UserSegment.B2B,
        tier: null,
        b2bTier: partner.tier,
        walletId: wallet.id,
      };
    }
    if (input.customerId) {
      const status = await this.membershipTierService.ensureStatus(input.customerId);
      const wallet = await this.walletLedger.getOrCreateWallet({ customerId: input.customerId });
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
