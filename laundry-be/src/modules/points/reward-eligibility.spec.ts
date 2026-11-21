import { MembershipTier, UserSegment } from '@prisma/client';
import { isRewardVisible, rewardBlockers } from './reward-eligibility';

const now = new Date('2026-11-24T10:00:00Z');
const base = {
  isActive: true,
  pointCost: 100,
  startDate: null,
  endDate: null,
  quota: null,
  issuedCount: 0,
  segment: UserSegment.RETAIL,
  tierRestriction: null,
  b2bTierRestriction: null,
  perUserLimit: 1,
} as any;
const ctx = { now, segment: UserSegment.RETAIL, tier: MembershipTier.SILVER, ownedCount: 0, pointBalance: 500 };

describe('reward-eligibility (Batch 6 — R3)', () => {
  it('template normal → bisa ditukar', () => {
    expect(rewardBlockers(base, ctx)).toEqual([]);
  });

  it.each([
    ['tidak aktif', { isActive: false }, 'INACTIVE', false],
    ['tanpa pointCost', { pointCost: 0 }, 'NOT_REDEEMABLE', false],
    ['belum dibuka', { startDate: new Date('2026-12-01') }, 'NOT_STARTED', true],
    ['sudah berakhir', { endDate: new Date('2026-11-01') }, 'ENDED', false],
    ['kuota habis', { quota: 10, issuedCount: 10 }, 'QUOTA_EXHAUSTED', true],
    ['segmen B2B', { segment: UserSegment.B2B }, 'WRONG_SEGMENT', false],
    ['khusus GOLD', { tierRestriction: MembershipTier.GOLD }, 'TIER_RESTRICTED', true],
  ])('%s → %s (tampil: %s)', (_l, patch, blocker, visible) => {
    const b = rewardBlockers({ ...base, ...patch }, ctx);
    expect(b).toContain(blocker);
    expect(isRewardVisible(b)).toBe(visible);
  });

  it('batas per pengguna & poin kurang', () => {
    expect(rewardBlockers(base, { ...ctx, ownedCount: 1 })).toContain('PER_USER_LIMIT');
    expect(rewardBlockers({ ...base, perUserLimit: null }, { ...ctx, ownedCount: 5 })).toEqual([]);
    expect(rewardBlockers(base, { ...ctx, pointBalance: 99 })).toEqual(['INSUFFICIENT_POINTS']);
  });

  it('tier cocok → boleh', () => {
    expect(
      rewardBlockers({ ...base, tierRestriction: MembershipTier.GOLD }, { ...ctx, tier: MembershipTier.GOLD }),
    ).toEqual([]);
  });
});
