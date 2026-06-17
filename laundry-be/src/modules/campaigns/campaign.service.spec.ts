import { Test } from '@nestjs/testing';
import { CampaignService } from './campaign.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VoucherService } from '../vouchers/voucher.service';
import { WalletService } from '../wallets/wallet.service';

describe('CampaignService — idempotency & anti double-execution', () => {
  let service: CampaignService;
  let prisma: any;
  let voucherService: { issue: jest.Mock };
  let walletService: { creditCashback: jest.Mock };

  beforeEach(async () => {
    prisma = {
      campaign: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      customer: { findMany: jest.fn(), findUnique: jest.fn() },
      userMembershipStatus: { findMany: jest.fn() },
      campaignIssuance: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'iss' }) },
      campaignExecutionLog: { create: jest.fn().mockResolvedValue({}) },
      order: { count: jest.fn() },
      referral: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      wallet: { findUnique: jest.fn(), create: jest.fn() },
    };
    // tx == prisma agar satu permukaan mock.
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));

    voucherService = { issue: jest.fn().mockResolvedValue({ id: 'uv1' }) };
    walletService = { creditCashback: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: PrismaService, useValue: prisma },
        { provide: VoucherService, useValue: voucherService },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();
    service = moduleRef.get(CampaignService);
  });

  const voucherCampaign = (overrides: Record<string, unknown> = {}) => ({
    id: 'camp-1',
    type: 'BIRTHDAY_REWARD',
    rules: [],
    rewards: [{ rewardType: 'VOUCHER', voucherTemplateId: 'tpl-1', targetParty: 'SELF' }],
    ...overrides,
  });

  it('issueRewardToCustomer menerbitkan reward pertama kali', async () => {
    prisma.campaign.findUnique.mockResolvedValue(voucherCampaign());
    prisma.campaignIssuance.findUnique.mockResolvedValue(null);

    const res = await service.issueRewardToCustomer('camp-1', 'cust-1', 'key-1');
    expect(voucherService.issue).toHaveBeenCalledTimes(1);
    expect(prisma.campaignIssuance.create).toHaveBeenCalled();
    expect(res).not.toBeNull();
  });

  it('issueRewardToCustomer idempoten — tidak double reward', async () => {
    prisma.campaign.findUnique.mockResolvedValue(voucherCampaign());
    prisma.campaignIssuance.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await service.issueRewardToCustomer('camp-1', 'cust-1', 'key-1');
    expect(res).toBeNull();
    expect(voucherService.issue).not.toHaveBeenCalled();
    expect(prisma.campaignIssuance.create).not.toHaveBeenCalled();
  });

  it('runBirthday tidak menerbitkan dua kali pada run berulang', async () => {
    prisma.campaign.findMany.mockResolvedValue([voucherCampaign()]);
    prisma.customer.findMany.mockResolvedValue([{ id: 'cust-1', birthDate: new Date() }]);
    // run pertama: belum ada issuance; run kedua: sudah ada → di-skip.
    prisma.campaignIssuance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'existing' });

    await service.runBirthday(new Date());
    await service.runBirthday(new Date());

    expect(voucherService.issue).toHaveBeenCalledTimes(1); // hanya sekali walau 2 run
    expect(prisma.campaignExecutionLog.create).toHaveBeenCalledTimes(2); // tiap run tercatat
  });

  it('runAnniversary tidak menerbitkan reward dua kali pada tahun yang sama', async () => {
    prisma.campaign.findMany.mockResolvedValue([
      voucherCampaign({ id: 'camp-ann', type: 'ANNIVERSARY_REWARD' }),
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', createdAt: new Date('2025-06-16T00:00:00.000Z') },
    ]);
    prisma.campaignIssuance.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'existing' });

    await service.runAnniversary(new Date('2026-06-16T10:00:00.000Z'));
    await service.runAnniversary(new Date('2026-06-16T11:00:00.000Z'));

    expect(voucherService.issue).toHaveBeenCalledTimes(1);
    expect(prisma.campaignExecutionLog.create).toHaveBeenCalledTimes(2);
  });

  it('long time no see tidak dikirim ulang bila masih dalam cooldown', async () => {
    prisma.campaign.findMany.mockResolvedValue([
      voucherCampaign({
        id: 'camp-ltns',
        type: 'LONG_TIME_NO_SEE',
        rules: [
          { ruleKey: 'inactiveDays', ruleValue: '30' },
          { ruleKey: 'cooldownDays', ruleValue: '30' },
        ],
      }),
    ]);
    prisma.customer.findMany.mockResolvedValue([{ id: 'cust-1' }, { id: 'cust-2' }]);
    prisma.campaignIssuance.findFirst
      .mockResolvedValueOnce({ id: 'recent' })
      .mockResolvedValueOnce(null);
    prisma.campaignIssuance.findUnique.mockResolvedValue(null);

    await service.runLongTimeNoSee(new Date('2026-06-16T10:00:00.000Z'));

    expect(voucherService.issue).toHaveBeenCalledTimes(1);
    expect(voucherService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-2', sourceId: 'camp-ltns' }),
    );
    expect(prisma.campaignExecutionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobName: 'long-time-no-see', scannedCount: 2, issuedCount: 1 }),
      }),
    );
  });

  it('handleTopupCashback: di bawah minTopup → tidak ada cashback', async () => {
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'camp-tc',
        type: 'CASHBACK_TOPUP',
        rules: [{ ruleKey: 'minTopup', ruleValue: '100000' }],
        rewards: [],
      },
    ]);
    const total = await service.handleTopupCashback(prisma, {
      customerId: 'cust-1',
      walletId: 'w1',
      topupAmount: 50000,
      sourceRefId: 'led-1',
    });
    expect(total.toNumber()).toBe(0);
    expect(walletService.creditCashback).not.toHaveBeenCalled();
  });

  it('handleTopupCashback: cashback persen + idempoten per top up', async () => {
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'camp-tc',
        type: 'CASHBACK_TOPUP',
        rules: [
          { ruleKey: 'minTopup', ruleValue: '0' },
          { ruleKey: 'cashbackPercent', ruleValue: '10' },
        ],
        rewards: [],
      },
    ]);
    prisma.campaignIssuance.findUnique.mockResolvedValue(null);

    const total = await service.handleTopupCashback(prisma, {
      customerId: 'cust-1',
      walletId: 'w1',
      topupAmount: 100000,
      sourceRefId: 'led-1',
    });
    expect(total.toNumber()).toBe(10000); // 10% dari 100000 → BONUS
    expect(walletService.creditCashback).toHaveBeenCalledTimes(1);

    // Top up sama (sourceRefId sama) sudah tercatat → tidak double.
    walletService.creditCashback.mockClear();
    prisma.campaignIssuance.findUnique.mockResolvedValue({ id: 'existing' });
    const again = await service.handleTopupCashback(prisma, {
      customerId: 'cust-1',
      walletId: 'w1',
      topupAmount: 100000,
      sourceRefId: 'led-1',
    });
    expect(again.toNumber()).toBe(0);
    expect(walletService.creditCashback).not.toHaveBeenCalled();
  });

  it('referral: reward TIDAK diberikan jika bukan transaksi pertama', async () => {
    prisma.referral.findFirst.mockResolvedValue({ id: 'r1', referrerCustomerId: 'ref-1' });
    prisma.order.count.mockResolvedValue(2); // sudah transaksi sebelumnya

    const res = await service.qualifyReferralOnFirstTransaction(prisma, 'cust-1', 'o1');
    expect(res).toBeNull();
    expect(voucherService.issue).not.toHaveBeenCalled();
    expect(prisma.referral.update).not.toHaveBeenCalled();
  });

  it('referral: reward diberikan ke referrer & referee pada transaksi pertama', async () => {
    prisma.referral.findFirst.mockResolvedValue({ id: 'r1', referrerCustomerId: 'ref-1' });
    prisma.order.count.mockResolvedValue(1); // transaksi pertama
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-ref',
      type: 'REFERRAL',
      rules: [],
      rewards: [
        { rewardType: 'VOUCHER', voucherTemplateId: 'tpl-r', targetParty: 'REFERRER' },
        { rewardType: 'VOUCHER', voucherTemplateId: 'tpl-e', targetParty: 'REFEREE' },
      ],
    });
    prisma.campaignIssuance.findUnique.mockResolvedValue(null);

    await service.qualifyReferralOnFirstTransaction(prisma, 'cust-1', 'o1');
    expect(voucherService.issue).toHaveBeenCalledTimes(2); // referrer + referee
    expect(prisma.referral.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REWARDED' }) }),
    );
  });

  it('happy hour aktif hanya pada hari/jam dan outlet/service yang sesuai', async () => {
    prisma.happyHourRule = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'hh-wrong-day',
          outletId: 'out-1',
          serviceId: 'svc-1',
          daysOfWeek: '1',
          startTime: '09:00',
          endTime: '11:00',
          startDate: null,
          endDate: null,
          quota: null,
          usedQuota: 0,
        },
        {
          id: 'hh-active',
          outletId: 'out-1',
          serviceId: 'svc-1',
          daysOfWeek: '2',
          startTime: '09:00',
          endTime: '11:00',
          startDate: null,
          endDate: null,
          quota: null,
          usedQuota: 0,
        },
      ]),
    };

    const rule = await service.findActiveHappyHourRule({
      outletId: 'out-1',
      serviceId: 'svc-1',
      at: new Date(2026, 5, 16, 10, 0, 0), // Selasa, local time
    });

    expect(rule?.id).toBe('hh-active');
    expect(prisma.happyHourRule.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [{ outletId: 'out-1' }, { outletId: null }],
        AND: [
          { OR: [{ serviceId: 'svc-1' }, { serviceId: null }] },
          { OR: [{ machineType: undefined }, { machineType: null }] },
        ],
      },
      orderBy: { priority: 'desc' },
    });
  });

  it('happy hour dengan quota habis tidak eligible', async () => {
    prisma.happyHourRule = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'hh-full',
          outletId: 'out-1',
          serviceId: 'svc-1',
          machineType: null,
          daysOfWeek: '2',
          startTime: '09:00',
          endTime: '11:00',
          startDate: null,
          endDate: null,
          quota: 10,
          usedQuota: 10,
        },
      ]),
    };

    const rule = await service.findActiveHappyHourRule({
      outletId: 'out-1',
      serviceId: 'svc-1',
      at: new Date(2026, 5, 16, 10, 0, 0),
    });

    expect(rule).toBeNull();
  });

  it('listReferrals mengembalikan data referrer/referee untuk admin', async () => {
    prisma.referral.findMany.mockResolvedValue([
      {
        id: 'ref-1',
        referralCode: 'MEM-001',
        status: 'PENDING',
        campaignId: 'camp-1',
        campaign: { name: 'Referral Juni' },
        referrerCustomerId: 'cust-a',
        refereeCustomerId: 'cust-b',
        qualifiedAt: null,
        rewardedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'cust-a',
        memberCode: 'MEM-001',
        user: { name: 'Referrer', phone: '0811' },
      },
      {
        id: 'cust-b',
        memberCode: 'MEM-002',
        user: { name: 'Referee', phone: '0822' },
      },
    ]);

    const rows = await service.listReferrals({ search: 'referee' });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        referralCode: 'MEM-001',
        referrer: expect.objectContaining({ name: 'Referrer' }),
        referee: expect.objectContaining({ name: 'Referee' }),
      }),
    );
  });
});
