import { MobileMemberController } from './mobile-member.controller';
import { MobileMemberService } from './mobile-member.service';

describe('MobileMemberController', () => {
  const service = {
    getSummary: jest.fn(),
    getVouchers: jest.fn(),
    getPoints: jest.fn(),
  } as unknown as jest.Mocked<MobileMemberService>;

  let controller: MobileMemberController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MobileMemberController(service);
  });

  it('returns summary for authenticated user only', async () => {
    service.getSummary.mockResolvedValue({
      customer: { id: 'c1', name: 'Andi Silver', phone: '081111111111' },
      membership: {
        tier: 'Silver',
        currentPoints: 120,
        lifetimePoints: 120,
        lifetimeSpending: 120000,
        lifetimeTransactions: 3,
        nextTier: 'Gold',
        nextTierCode: 'GOLD',
        pointsToNextTier: 130,
        tierProgressPercent: 48,
      },
      wallet: { id: 'w1', balance: 50000, bonusBalance: 0, pointBalance: 120 },
      vouchers: { activeCount: 2, usedCount: 0, expiredCount: 1, active: [] },
      promos: { availableCount: 3, happyHourActive: true, available: [] },
    } as never);

    const result = await controller.summary({ user: { userId: 'u1' } });

    expect(service.getSummary).toHaveBeenCalledWith('u1');
    expect(result.customer.name).toBe('Andi Silver');
    expect(result.membership.currentPoints).toBe(120);
  });
});
