import { B2BPartnerTier, MembershipTier, UserSegment, VoucherTemplate } from '@prisma/client';

/**
 * Batch 6 (R3) — syarat menukar poin dengan voucher. Dipakai katalog
 * (`GET /mobile/me/rewards`) DAN penukaran (`POST /points/redeem-voucher`),
 * sehingga yang tampil "bisa ditukar" sama dengan yang diterima server.
 *
 * Sebelumnya penukaran hanya memeriksa template aktif & pointCost — periode,
 * tier, segmen, dan batas per pengguna tidak ditegakkan.
 */
export type RewardBlocker =
  | 'INACTIVE'
  | 'NOT_REDEEMABLE'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'QUOTA_EXHAUSTED'
  | 'WRONG_SEGMENT'
  | 'TIER_RESTRICTED'
  | 'PER_USER_LIMIT'
  | 'INSUFFICIENT_POINTS';

export interface RewardContext {
  now: Date;
  segment: UserSegment;
  tier?: MembershipTier | null;
  b2bTier?: B2BPartnerTier | null;
  /** Jumlah voucher dari template ini yang sudah dimiliki pemilik (semua status). */
  ownedCount: number;
  pointBalance: number;
}

export const REWARD_BLOCKER_MESSAGE: Record<RewardBlocker, string> = {
  INACTIVE: 'Voucher tidak aktif',
  NOT_REDEEMABLE: 'Voucher tidak bisa ditukar dengan poin',
  NOT_STARTED: 'Penukaran voucher belum dibuka',
  ENDED: 'Periode voucher sudah berakhir',
  QUOTA_EXHAUSTED: 'Kuota voucher sudah habis',
  WRONG_SEGMENT: 'Voucher tidak tersedia untuk akun ini',
  TIER_RESTRICTED: 'Voucher khusus tier lain',
  PER_USER_LIMIT: 'Batas penukaran voucher ini sudah tercapai',
  INSUFFICIENT_POINTS: 'Poin tidak cukup',
};

/** Penghalang yang membuat template tidak bisa DITAMPILKAN sama sekali. */
const HIDDEN: RewardBlocker[] = ['INACTIVE', 'NOT_REDEEMABLE', 'ENDED', 'WRONG_SEGMENT'];

export function rewardBlockers(
  t: Pick<
    VoucherTemplate,
    | 'isActive'
    | 'pointCost'
    | 'startDate'
    | 'endDate'
    | 'quota'
    | 'issuedCount'
    | 'segment'
    | 'tierRestriction'
    | 'b2bTierRestriction'
    | 'perUserLimit'
  >,
  ctx: RewardContext,
): RewardBlocker[] {
  const out: RewardBlocker[] = [];
  if (!t.isActive) out.push('INACTIVE');
  if (!t.pointCost || t.pointCost <= 0) out.push('NOT_REDEEMABLE');
  if (t.startDate && t.startDate > ctx.now) out.push('NOT_STARTED');
  if (t.endDate && t.endDate <= ctx.now) out.push('ENDED');
  if (t.quota != null && t.issuedCount >= t.quota) out.push('QUOTA_EXHAUSTED');
  if (t.segment !== ctx.segment) out.push('WRONG_SEGMENT');
  if (ctx.segment === UserSegment.RETAIL && t.tierRestriction && t.tierRestriction !== (ctx.tier ?? MembershipTier.SILVER)) {
    out.push('TIER_RESTRICTED');
  }
  if (ctx.segment === UserSegment.B2B && t.b2bTierRestriction && t.b2bTierRestriction !== ctx.b2bTier) {
    out.push('TIER_RESTRICTED');
  }
  if (t.perUserLimit != null && t.perUserLimit > 0 && ctx.ownedCount >= t.perUserLimit) out.push('PER_USER_LIMIT');
  if ((t.pointCost ?? 0) > ctx.pointBalance) out.push('INSUFFICIENT_POINTS');
  return out;
}

export function isRewardVisible(blockers: RewardBlocker[]): boolean {
  return !blockers.some((b) => HIDDEN.includes(b));
}
