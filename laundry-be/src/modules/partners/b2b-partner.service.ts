import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, UserSegment, B2BPartnerTier } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

/**
 * B2B partner. Memakai wallet/deposit (keputusan 6), bukan invoice. Tier B2B
 * (Business/Gold/Platinum/Diamond Partner) dievaluasi dari transaksi sukses,
 * top up dikecualikan (keputusan 4).
 */
@Injectable()
export class B2BPartnerService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    companyName: string;
    picName: string;
    phone: string;
    email?: string;
    address?: string;
    userId?: string;
  }) {
    const partnerCode = `B2B-${randomUUID().slice(0, 8).toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.b2BPartner.create({
        data: { ...data, partnerCode },
      });
      // Setiap partner punya wallet deposit + status membership B2B.
      await tx.wallet.create({ data: { partnerId: partner.id } });
      await tx.userMembershipStatus.create({
        data: {
          partnerId: partner.id,
          segment: UserSegment.B2B,
          currentB2BTier: B2BPartnerTier.BUSINESS_PARTNER,
        },
      });
      return partner;
    });
  }

  async findOne(id: string) {
    const partner = await this.prisma.b2BPartner.findUnique({
      where: { id },
      include: { wallet: true, membershipStatus: true },
    });
    if (!partner) throw new NotFoundException('Partner tidak ditemukan');
    return partner;
  }

  async findAll() {
    return this.prisma.b2BPartner.findMany({
      include: { wallet: true, membershipStatus: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Prisma.B2BPartnerUpdateInput,
  ) {
    await this.findOne(id);
    return this.prisma.b2BPartner.update({
      where: { id },
      data,
      include: { wallet: true, membershipStatus: true },
    });
  }

  async getWallet(partnerId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { partnerId } });
    if (!wallet) throw new NotFoundException('Wallet partner tidak ditemukan');
    return wallet;
  }

  async listTransactions(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.order.findMany({
      where: { partnerId },
      include: { outlet: true, payments: true, items: true },
      orderBy: { orderDate: 'desc' },
      take: 100,
    });
  }

  // --- Tier config ---

  async listTiers() {
    return this.prisma.b2BPartnerTierConfig.findMany({ orderBy: { level: 'asc' } });
  }

  async upsertTier(tier: B2BPartnerTier, data: Prisma.B2BPartnerTierConfigCreateInput) {
    return this.prisma.b2BPartnerTierConfig.upsert({
      where: { tier },
      create: { ...data, tier },
      update: data,
    });
  }

  /** Catat transaksi sukses partner lalu evaluasi tier B2B. */
  async recordSuccessfulTransaction(
    tx: PrismaTx,
    partnerId: string,
    spending: Prisma.Decimal.Value,
  ) {
    let status = await tx.userMembershipStatus.findUnique({ where: { partnerId } });
    if (!status) {
      status = await tx.userMembershipStatus.create({
        data: {
          partnerId,
          segment: UserSegment.B2B,
          currentB2BTier: B2BPartnerTier.BUSINESS_PARTNER,
        },
      });
    }

    const earnedSpending = new Prisma.Decimal(status.earnedSpending).plus(spending);
    const successfulTxnCount = status.successfulTxnCount + 1;
    const newTier = await this.resolveTier(tx, earnedSpending, successfulTxnCount);

    const updated = await tx.userMembershipStatus.update({
      where: { id: status.id },
      data: {
        earnedSpending,
        successfulTxnCount,
        currentB2BTier: newTier,
        evaluatedAt: new Date(),
        ...(newTier !== status.currentB2BTier ? { achievedAt: new Date() } : {}),
      },
    });
    // Sinkronkan tier ringkas di Partner.
    await tx.b2BPartner.update({ where: { id: partnerId }, data: { tier: newTier } });
    return updated;
  }

  /** % potongan harga partner untuk sebuah tier (0 bila belum di-seed). */
  async getDiscountRate(tier: B2BPartnerTier): Promise<Prisma.Decimal> {
    const config = await this.prisma.b2BPartnerTierConfig.findUnique({ where: { tier } });
    return config?.discountRate ?? new Prisma.Decimal(0);
  }

  /** Balikkan akumulasi partner saat refund (keputusan 10). */
  async reverseTransaction(
    tx: PrismaTx,
    partnerId: string,
    spending: Prisma.Decimal.Value,
  ) {
    const status = await tx.userMembershipStatus.findUnique({ where: { partnerId } });
    if (!status) return null;

    const earnedSpending = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      new Prisma.Decimal(status.earnedSpending).minus(spending),
    );
    const successfulTxnCount = Math.max(0, status.successfulTxnCount - 1);
    const newTier = await this.resolveTier(tx, earnedSpending, successfulTxnCount);

    const updated = await tx.userMembershipStatus.update({
      where: { id: status.id },
      data: {
        earnedSpending,
        successfulTxnCount,
        currentB2BTier: newTier,
        evaluatedAt: new Date(),
      },
    });
    await tx.b2BPartner.update({ where: { id: partnerId }, data: { tier: newTier } });
    return updated;
  }

  private async resolveTier(
    tx: PrismaTx,
    earnedSpending: Prisma.Decimal,
    txnCount: number,
  ): Promise<B2BPartnerTier> {
    const tiers = await tx.b2BPartnerTierConfig.findMany({
      where: { isActive: true },
      orderBy: { level: 'desc' },
    });
    for (const t of tiers) {
      const spendingOk =
        t.thresholdSpending != null && earnedSpending.gte(t.thresholdSpending);
      const txnOk = t.thresholdTxnCount != null && txnCount >= t.thresholdTxnCount;
      if (spendingOk || txnOk) return t.tier;
    }
    return B2BPartnerTier.BUSINESS_PARTNER;
  }
}
