import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  CampaignType,
  UserSegment,
  MembershipTier,
  OrderStatus,
  ReferralStatus,
} from '@prisma/client';
import { D, money } from '../../common/utils/money.util';
import { VoucherService } from '../vouchers/voucher.service';
import { WalletService } from '../wallets/wallet.service';

type PrismaTx = Prisma.TransactionClient;

export interface CreateCampaignInput {
  type: CampaignType;
  name: string;
  description?: string;
  segment?: UserSegment;
  startDate?: Date;
  endDate?: Date;
  rules?: { ruleKey: string; ruleValue: string }[];
  rewards?: {
    rewardType: string; // 'VOUCHER' | 'CASHBACK'
    voucherTemplateId?: string;
    rewardPoints?: number;
    rewardCashback?: number;
    targetParty?: string; // 'SELF' | 'REFERRER' | 'REFEREE'
  }[];
}

type CampaignWithRules = Prisma.CampaignGetPayload<{
  include: { rules: true; rewards: true };
}>;

/** Status order yang dianggap "sukses/terbayar". */
const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.RECEIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.PACKING,
  OrderStatus.READY_PICKUP,
  OrderStatus.COMPLETED,
];

/**
 * Campaign & Reward Automation. Konfigurasi kampanye dikelola admin (DB, bukan
 * hardcode): Campaign + CampaignRule (key/value) + CampaignReward. Penerbitan
 * reward IDEMPOTEN via CampaignIssuance.idempotencyKey (tidak double reward).
 * Setiap reward masuk ledger (voucher/wallet), tiap run dicatat di
 * CampaignExecutionLog.
 */
@Injectable()
export class CampaignService {
  constructor(
    private prisma: PrismaService,
    private voucherService: VoucherService,
    private walletService: WalletService,
  ) {}

  // ===================== Admin CRUD =====================

  async create(input: CreateCampaignInput) {
    return this.prisma.campaign.create({
      data: {
        type: input.type,
        name: input.name,
        description: input.description,
        segment: input.segment ?? UserSegment.RETAIL,
        startDate: input.startDate,
        endDate: input.endDate,
        rules: input.rules ? { create: input.rules } : undefined,
        rewards: input.rewards
          ? {
              create: input.rewards.map((r) => ({
                rewardType: r.rewardType,
                voucherTemplateId: r.voucherTemplateId,
                rewardPoints: r.rewardPoints,
                rewardCashback:
                  r.rewardCashback != null ? new Prisma.Decimal(r.rewardCashback) : null,
                targetParty: r.targetParty ?? 'SELF',
              })),
            }
          : undefined,
      },
      include: { rules: true, rewards: true },
    });
  }

  async findAll() {
    return this.prisma.campaign.findMany({
      include: { rules: true, rewards: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { rules: true, rewards: true },
    });
    if (!campaign) throw new NotFoundException('Campaign tidak ditemukan');
    return campaign;
  }

  async update(id: string, data: Prisma.CampaignUpdateInput) {
    await this.findOne(id);
    return this.prisma.campaign.update({ where: { id }, data, include: { rules: true, rewards: true } });
  }

  /** Aktifkan/nonaktifkan kampanye (admin). */
  async setActive(id: string, active: boolean) {
    await this.findOne(id);
    return this.prisma.campaign.update({
      where: { id },
      data: { status: active ? 'ACTIVE' : 'PAUSED', isActive: active },
    });
  }

  async getExecutionLogs(campaignId?: string) {
    return this.prisma.campaignExecutionLog.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { runAt: 'desc' },
      take: 100,
    });
  }

  // ===================== Reward granting (idempoten) =====================

  private ruleValue(campaign: CampaignWithRules, key: string): string | undefined {
    return campaign.rules.find((r) => r.ruleKey === key)?.ruleValue;
  }

  /**
   * Berikan reward kampanye ke seorang customer secara IDEMPOTEN. Bila
   * idempotencyKey sudah pernah dipakai → tidak melakukan apa-apa (cegah double
   * reward). Harus dipanggil dalam transaksi.
   */
  private async grantRewards(
    tx: PrismaTx,
    campaign: CampaignWithRules,
    customerId: string,
    idempotencyKey: string,
    targetParty: 'SELF' | 'REFERRER' | 'REFEREE' = 'SELF',
  ) {
    const existing = await tx.campaignIssuance.findUnique({ where: { idempotencyKey } });
    if (existing) return null; // sudah pernah → idempoten

    const rewards = (campaign.rewards ?? []).filter(
      (r) => (r.targetParty ?? 'SELF') === targetParty,
    );
    if (rewards.length === 0) return null;

    let userVoucherId: string | undefined;
    for (const reward of rewards) {
      if (reward.rewardType === 'VOUCHER' && reward.voucherTemplateId) {
        const voucher = await this.voucherService.issue({
          templateId: reward.voucherTemplateId,
          customerId,
          sourceType: `CAMPAIGN_${campaign.type}`,
          sourceId: campaign.id,
          tx,
        });
        userVoucherId = voucher.id;
      } else if (reward.rewardType === 'CASHBACK' && reward.rewardCashback) {
        let wallet = await tx.wallet.findUnique({ where: { customerId } });
        if (!wallet) wallet = await tx.wallet.create({ data: { customerId } });
        await this.walletService.creditCashback({
          walletId: wallet.id,
          amount: reward.rewardCashback,
          referenceType: `CAMPAIGN_${campaign.type}`,
          referenceId: campaign.id,
          idempotencyKey: `${idempotencyKey}:cb`,
          tx,
        });
      }
    }

    return tx.campaignIssuance.create({
      data: { campaignId: campaign.id, customerId, userVoucherId, idempotencyKey },
    });
  }

  /** Wrapper publik: terbitkan reward kampanye ke customer (manual/admin). */
  async issueRewardToCustomer(campaignId: string, customerId: string, idempotencyKey: string) {
    const campaign = await this.findOne(campaignId);
    return this.prisma.$transaction((tx) =>
      this.grantRewards(tx, campaign, customerId, idempotencyKey),
    );
  }

  // ===================== Trigger: CASHBACK_TOPUP =====================

  /**
   * Dipanggil saat top up berhasil (dalam transaksi top up). Memberi cashback ke
   * BONUS_BALANCE sesuai kampanye CASHBACK_TOPUP aktif. Idempoten per top up
   * (`sourceRefId` = id ledger top up). Mengembalikan total cashback.
   */
  async handleTopupCashback(
    tx: PrismaTx,
    input: { customerId: string; walletId: string; topupAmount: number; sourceRefId: string },
  ): Promise<Prisma.Decimal> {
    const campaigns = await tx.campaign.findMany({
      where: { type: CampaignType.CASHBACK_TOPUP, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });

    let total = new Prisma.Decimal(0);
    for (const campaign of campaigns) {
      const minTopup = Number(this.ruleValue(campaign, 'minTopup') ?? 0);
      if (input.topupAmount < minTopup) continue;

      const pct = this.ruleValue(campaign, 'cashbackPercent');
      let amount = new Prisma.Decimal(0);
      if (pct != null) {
        amount = money(D(input.topupAmount).mul(pct).div(100));
      } else {
        const cb = campaign.rewards.find(
          (r) => r.rewardType === 'CASHBACK' && r.rewardCashback,
        );
        if (cb?.rewardCashback) amount = D(cb.rewardCashback);
      }
      const maxCashback = this.ruleValue(campaign, 'maxCashback');
      if (maxCashback != null && amount.gt(maxCashback)) amount = D(maxCashback);
      if (amount.lte(0)) continue;

      const key = `topup-cashback:${campaign.id}:${input.sourceRefId}`;
      const exists = await tx.campaignIssuance.findUnique({ where: { idempotencyKey: key } });
      if (exists) continue;

      await this.walletService.creditCashback({
        walletId: input.walletId,
        amount,
        referenceType: 'CASHBACK_TOPUP',
        referenceId: campaign.id,
        idempotencyKey: `${key}:cb`,
        tx,
      });
      await tx.campaignIssuance.create({
        data: { campaignId: campaign.id, customerId: input.customerId, idempotencyKey: key },
      });
      total = total.plus(amount);
    }
    return total;
  }

  // ===================== Trigger: REFERRAL =====================

  /** Kode referral seorang customer = memberCode-nya (stabil & unik). */
  async getReferralCode(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { memberCode: true },
    });
    if (!customer) throw new NotFoundException('Customer tidak ditemukan');
    return { referralCode: customer.memberCode };
  }

  private async customerIdByUser(userId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Profil customer tidak ditemukan');
    return customer.id;
  }

  async getReferralCodeByUser(userId: string) {
    return this.getReferralCode(await this.customerIdByUser(userId));
  }

  async applyReferralCodeByUser(code: string, userId: string) {
    return this.applyReferralCode(code, await this.customerIdByUser(userId));
  }

  /** Referee memakai kode referral (saat daftar / sebelum transaksi pertama). */
  async applyReferralCode(code: string, refereeCustomerId: string) {
    const referrer = await this.prisma.customer.findUnique({
      where: { memberCode: code },
      select: { id: true },
    });
    if (!referrer) throw new BadRequestException('Kode referral tidak valid');
    if (referrer.id === refereeCustomerId) {
      throw new BadRequestException('Tidak bisa memakai kode referral sendiri');
    }

    const used = await this.prisma.referral.findUnique({
      where: { refereeCustomerId },
    });
    if (used) throw new ConflictException('Anda sudah memakai kode referral');

    const paid = await this.prisma.order.count({
      where: { customerId: refereeCustomerId, status: { in: PAID_STATUSES } },
    });
    if (paid > 0) {
      throw new BadRequestException('Referral hanya untuk pengguna yang belum bertransaksi');
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: { type: CampaignType.REFERRAL, status: 'ACTIVE', isActive: true },
    });

    return this.prisma.referral.create({
      data: {
        campaignId: campaign?.id,
        referrerCustomerId: referrer.id,
        refereeCustomerId,
        referralCode: code,
        status: ReferralStatus.PENDING,
      },
    });
  }

  /**
   * Dipanggil saat referee melakukan transaksi PERTAMA yang sukses (dalam
   * transaksi checkout). Reward TIDAK diberikan hanya karena daftar. Idempoten
   * per referral. Memberi reward ke REFERRER & REFEREE sesuai kampanye.
   */
  async qualifyReferralOnFirstTransaction(
    tx: PrismaTx,
    refereeCustomerId: string,
    orderId: string,
  ) {
    const referral = await tx.referral.findFirst({
      where: { refereeCustomerId, status: ReferralStatus.PENDING },
    });
    if (!referral) return null;

    // Order saat ini sudah PAID di titik ini → transaksi pertama bila count == 1.
    const paidCount = await tx.order.count({
      where: { customerId: refereeCustomerId, status: { in: PAID_STATUSES } },
    });
    if (paidCount > 1) return null;

    const campaign = await tx.campaign.findFirst({
      where: { type: CampaignType.REFERRAL, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });
    if (!campaign) return null;

    await this.grantRewards(
      tx,
      campaign,
      referral.referrerCustomerId,
      `referral:${referral.id}:REFERRER`,
      'REFERRER',
    );
    await this.grantRewards(
      tx,
      campaign,
      refereeCustomerId,
      `referral:${referral.id}:REFEREE`,
      'REFEREE',
    );

    return tx.referral.update({
      where: { id: referral.id },
      data: {
        status: ReferralStatus.REWARDED,
        qualifiedAt: new Date(),
        rewardedAt: new Date(),
      },
    });
  }

  // ===================== Scheduler (cron harian) =====================

  private yyyymm(d: Date): string {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private isSameMonthDay(a: Date, b: Date): boolean {
    return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private async logExecution(
    campaign: { id: string; type: CampaignType },
    jobName: string,
    scanned: number,
    issued: number,
    message?: string,
  ) {
    return this.prisma.campaignExecutionLog.create({
      data: {
        campaignId: campaign.id,
        campaignType: campaign.type,
        jobName,
        scannedCount: scanned,
        issuedCount: issued,
        status: 'SUCCESS',
        message,
      },
    });
  }

  /** Issue ke daftar customer dengan key per-customer; mengembalikan jumlah baru. */
  private async issueToCustomers(
    campaign: CampaignWithRules,
    customerIds: string[],
    keyFn: (customerId: string) => string,
  ): Promise<number> {
    let issued = 0;
    for (const customerId of customerIds) {
      const result = await this.prisma.$transaction((tx) =>
        this.grantRewards(tx, campaign, customerId, keyFn(customerId)),
      );
      if (result) issued++;
    }
    return issued;
  }

  async runBirthday(now: Date = new Date()) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { type: CampaignType.BIRTHDAY_REWARD, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });
    for (const campaign of campaigns) {
      const candidates = await this.prisma.customer.findMany({
        where: { birthDate: { not: null } },
        select: { id: true, birthDate: true },
      });
      const todays = candidates.filter((c) => c.birthDate && this.isSameMonthDay(c.birthDate, now));
      const issued = await this.issueToCustomers(
        campaign,
        todays.map((c) => c.id),
        (id) => `birthday:${campaign.id}:${id}:${now.getFullYear()}`,
      );
      await this.logExecution(campaign, 'birthday', todays.length, issued);
    }
  }

  async runAnniversary(now: Date = new Date()) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { type: CampaignType.ANNIVERSARY_REWARD, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });
    for (const campaign of campaigns) {
      const candidates = await this.prisma.customer.findMany({
        select: { id: true, createdAt: true },
      });
      const todays = candidates.filter(
        (c) =>
          this.isSameMonthDay(c.createdAt, now) &&
          now.getFullYear() - c.createdAt.getFullYear() >= 1,
      );
      const issued = await this.issueToCustomers(
        campaign,
        todays.map((c) => c.id),
        (id) => `anniversary:${campaign.id}:${id}:${now.getFullYear()}`,
      );
      await this.logExecution(campaign, 'anniversary', todays.length, issued);
    }
  }

  async runLongTimeNoSee(now: Date = new Date()) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { type: CampaignType.LONG_TIME_NO_SEE, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });
    for (const campaign of campaigns) {
      const inactiveDays = Number(this.ruleValue(campaign, 'inactiveDays') ?? 30);
      const cooldownDays = Number(this.ruleValue(campaign, 'cooldownDays') ?? 30);
      const cutoff = new Date(now.getTime() - inactiveDays * 86_400_000);
      const cooldownStart = new Date(now.getTime() - cooldownDays * 86_400_000);

      // Pernah transaksi, tapi tidak ada transaksi sejak cutoff.
      const candidates = await this.prisma.customer.findMany({
        where: {
          AND: [{ orders: { some: {} } }, { orders: { none: { orderDate: { gte: cutoff } } } }],
        },
        select: { id: true },
      });

      let issued = 0;
      for (const c of candidates) {
        // Limit: jangan kirim ulang dalam cooldown.
        const recent = await this.prisma.campaignIssuance.findFirst({
          where: { campaignId: campaign.id, customerId: c.id, issuedAt: { gte: cooldownStart } },
        });
        if (recent) continue;
        const result = await this.prisma.$transaction((tx) =>
          this.grantRewards(tx, campaign, c.id, `ltns:${campaign.id}:${c.id}:${this.yyyymm(now)}`),
        );
        if (result) issued++;
      }
      await this.logExecution(campaign, 'long-time-no-see', candidates.length, issued);
    }
  }

  async runMonthlyTierBenefit(now: Date = new Date()) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { type: CampaignType.MONTHLY_TIER_BENEFIT, status: 'ACTIVE', isActive: true },
      include: { rules: true, rewards: true },
    });
    for (const campaign of campaigns) {
      const tier = this.ruleValue(campaign, 'tier');
      if (!tier) {
        await this.logExecution(campaign, 'monthly-tier', 0, 0, 'rule "tier" kosong');
        continue;
      }
      const members = await this.prisma.userMembershipStatus.findMany({
        where: { segment: UserSegment.RETAIL, currentTier: tier as MembershipTier },
        select: { customerId: true },
      });
      const ids = members.map((m) => m.customerId).filter((id): id is string => !!id);
      const issued = await this.issueToCustomers(
        campaign,
        ids,
        (id) => `monthly:${campaign.id}:${id}:${this.yyyymm(now)}`,
      );
      await this.logExecution(campaign, 'monthly-tier', ids.length, issued);
    }
  }

  /** Dipanggil cron harian. Monthly-tier hanya jalan di tanggal 1. */
  async runDaily(now: Date = new Date()) {
    await this.runBirthday(now);
    await this.runAnniversary(now);
    await this.runLongTimeNoSee(now);
    if (now.getDate() === 1) {
      await this.runMonthlyTierBenefit(now);
    }
    return { ranAt: now.toISOString(), monthlyTier: now.getDate() === 1 };
  }

  // ===================== Happy hour =====================

  async createHappyHourRule(data: Prisma.HappyHourRuleCreateInput) {
    return this.prisma.happyHourRule.create({ data });
  }

  async listHappyHourRules() {
    return this.prisma.happyHourRule.findMany({
      include: { outlet: true, service: true },
      orderBy: { priority: 'desc' },
    });
  }

  async updateHappyHourRule(id: string, data: Prisma.HappyHourRuleUpdateInput) {
    const rule = await this.prisma.happyHourRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Happy hour tidak ditemukan');
    return this.prisma.happyHourRule.update({
      where: { id },
      data,
      include: { outlet: true, service: true },
    });
  }

  /**
   * Cari rule happy hour aktif untuk konteks tertentu (prioritas tertinggi).
   * `at` default now. Cocok bila hari & jam masuk rentang.
   */
  async findActiveHappyHourRule(ctx: { outletId?: string; serviceId?: string; at?: Date }) {
    const at = ctx.at ?? new Date();
    const day = at.getDay() === 0 ? 7 : at.getDay(); // 1=Senin..7=Minggu
    const hhmm = at.toTimeString().slice(0, 5);

    const rules = await this.prisma.happyHourRule.findMany({
      where: {
        isActive: true,
        OR: [{ outletId: ctx.outletId ?? undefined }, { outletId: null }],
        AND: [{ OR: [{ serviceId: ctx.serviceId ?? undefined }, { serviceId: null }] }],
      },
      orderBy: { priority: 'desc' },
    });

    return (
      rules.find((r) => {
        const days = r.daysOfWeek.split(',').map((d) => d.trim());
        const dayOk = days.includes(String(day));
        const timeOk = hhmm >= r.startTime && hhmm <= r.endTime;
        const dateOk =
          (!r.startDate || at >= r.startDate) && (!r.endDate || at <= r.endDate);
        return dayOk && timeOk && dateOk;
      }) ?? null
    );
  }
}
