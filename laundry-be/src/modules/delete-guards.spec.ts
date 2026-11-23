import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ServicesService } from './services/services.service';
import { UsersService } from './users/users.service';
import { VoucherService } from './vouchers/voucher.service';
import { CampaignService } from './campaigns/campaign.service';
import { B2BPartnerService } from './partners/b2b-partner.service';
import { B2BPricingService } from './pricing/b2b-pricing.service';

// Fungsi hapus di setiap menu admin: data yang belum dipakai boleh dihapus permanen;
// data yang sudah dipakai transaksi/pelanggan ditolak (409) dengan saran alternatif.
const count = (n = 0) => ({ count: jest.fn().mockResolvedValue(n) });

describe('Hapus layanan', () => {
  const make = (orders = 0, devices = 0) => {
    const prisma: any = {
      service: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }), delete: jest.fn() },
      orderItem: count(orders), iotDevice: count(devices), happyHourRule: count(), b2BPricingRule: count(),
    };
    return { prisma, svc: new ServicesService(prisma) };
  };
  it('sudah dipakai transaksi → 409 "Nonaktifkan"', async () => {
    const { prisma, svc } = make(2);
    await expect(svc.removeService('s1')).rejects.toThrow('Nonaktifkan layanan');
    expect(prisma.service.delete).not.toHaveBeenCalled();
  });
  it('masih dipasang di mesin → 409 (mesin tidak diam-diam kehilangan layanannya)', async () => {
    const { prisma, svc } = make(0, 1);
    await expect(svc.removeService('s1')).rejects.toThrow('1 mesin');
    expect(prisma.service.delete).not.toHaveBeenCalled();
  });
  it('belum pernah dipakai → terhapus', async () => {
    const { prisma, svc } = make();
    await svc.removeService('s1');
    expect(prisma.service.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});

describe('Hapus staf', () => {
  const make = (role: UserRole, history = 0) => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', role }), delete: jest.fn() },
      order: count(history), review: count(), kioskSession: count(), auditLog: count(),
    };
    return { prisma, svc: new UsersService(prisma) };
  };
  const owner = { userId: 'u1', role: UserRole.OWNER };
  it('akun pelanggan tidak dihapus lewat Kelola Staff', async () => {
    await expect(make(UserRole.CUSTOMER).svc.remove('u2', owner)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('tidak bisa menghapus akun sendiri', async () => {
    await expect(make(UserRole.CASHIER).svc.remove('u2', { userId: 'u2', role: UserRole.OWNER })).rejects.toThrow('akun sendiri');
  });
  it('Owner tidak bisa menghapus Super Admin maupun Owner lain', async () => {
    await expect(make(UserRole.SUPER_ADMIN).svc.remove('u2', owner)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make(UserRole.OWNER).svc.remove('u2', owner)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('staf yang pernah memproses transaksi → 409 (riwayat "diproses oleh" tidak hilang)', async () => {
    const { prisma, svc } = make(UserRole.CASHIER, 3);
    await expect(svc.remove('u2', owner)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
  it('staf baru tanpa riwayat → terhapus', async () => {
    const { prisma, svc } = make(UserRole.CASHIER);
    await svc.remove('u2', owner);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u2' } });
  });
});

describe('Hapus di Promotion & Loyalty', () => {
  it('template voucher yang sudah diterbitkan → 409', async () => {
    const prisma: any = {
      voucherTemplate: { findUnique: jest.fn().mockResolvedValue({ id: 't' }), delete: jest.fn() },
      userVoucher: count(5), campaignReward: count(),
    };
    await expect(new VoucherService(prisma).removeTemplate('t')).rejects.toThrow('Nonaktifkan template');
    expect(prisma.voucherTemplate.delete).not.toHaveBeenCalled();
  });
  it('campaign yang sudah memberi hadiah → 409 (riwayat idempoten tidak ikut terhapus)', async () => {
    const prisma: any = {
      campaign: { findUnique: jest.fn().mockResolvedValue({ id: 'c' }), delete: jest.fn() },
      campaignIssuance: count(1), referral: count(),
    };
    const svc = new CampaignService(prisma, {} as any, {} as any);
    await expect(svc.remove('c')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });
  it('partner dengan saldo deposit → 409; partner baru tanpa transaksi → terhapus', async () => {
    const mk = (balance: number) => ({
      b2BPartner: { findUnique: jest.fn().mockResolvedValue({ id: 'p', wallet: { id: 'w', balance, bonusBalance: 0 } }), delete: jest.fn() },
      order: count(), walletLedger: count(), walletTransaction: count(), walletTopup: count(),
    });
    const rich: any = mk(50000);
    await expect(new B2BPartnerService(rich).remove('p')).rejects.toThrow('SUSPENDED');
    const fresh: any = mk(0);
    await new B2BPartnerService(fresh).remove('p');
    expect(fresh.b2BPartner.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
  });
  it('harga khusus B2B yang sudah dipakai → 409', async () => {
    const prisma: any = {
      b2BPricingRule: { findUnique: jest.fn().mockResolvedValue({ id: 'r' }), delete: jest.fn() },
      b2BPricingRuleUsage: count(1),
    };
    await expect(new B2BPricingService(prisma).remove('r')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.b2BPricingRule.delete).not.toHaveBeenCalled();
  });
});
