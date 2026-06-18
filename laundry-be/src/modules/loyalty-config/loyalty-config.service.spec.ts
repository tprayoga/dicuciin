import { LoyaltyConfigService } from './loyalty-config.service';

describe('LoyaltyConfigService', () => {
  const ORIGINAL_ENV = process.env;
  let service: LoyaltyConfigService;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOYALTY_POINT_RATE;
    delete process.env.LOYALTY_POINT_EXPIRY_DAYS;
    delete process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND;
    service = new LoyaltyConfigService();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('default backward compatible: rate 1000, expiry 365, no cashback reversal', () => {
    expect(service.pointEarnRate).toBe(1000);
    expect(service.pointExpiryDays).toBe(365);
    expect(service.reverseTierCashbackOnRefund).toBe(false);
  });

  it('override point rate dari env', () => {
    process.env.LOYALTY_POINT_RATE = '2000';
    expect(service.pointEarnRate).toBe(2000);
  });

  it('nilai env invalid/<=0 jatuh ke default', () => {
    process.env.LOYALTY_POINT_RATE = 'abc';
    expect(service.pointEarnRate).toBe(1000);
    process.env.LOYALTY_POINT_RATE = '0';
    expect(service.pointEarnRate).toBe(1000);
    process.env.LOYALTY_POINT_EXPIRY_DAYS = '-5';
    expect(service.pointExpiryDays).toBe(365);
  });

  it('flag cashback reversal aktif hanya untuk nilai truthy eksplisit', () => {
    process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND = 'true';
    expect(service.reverseTierCashbackOnRefund).toBe(true);
    process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND = 'false';
    expect(service.reverseTierCashbackOnRefund).toBe(false);
    process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND = 'random';
    expect(service.reverseTierCashbackOnRefund).toBe(false);
  });
});
