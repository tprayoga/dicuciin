/**
 * Security gate Fase 0 — aturan di level service (K5, K7, K11, K12).
 * Melengkapi authorization.http.spec.ts (yang menguji akses per route).
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { assertManualTransition } from '../../modules/orders/order-status.policy';
import { OrdersService } from '../../modules/orders/orders.service';
import { UsersService } from '../../modules/users/users.service';
import { ReviewsService } from '../../modules/reviews/reviews.service';

const custA = { userId: 'u-A', role: UserRole.CUSTOMER };
const cashier = { userId: 'u-cashier', role: UserRole.CASHIER };
const owner = { userId: 'u-owner', role: UserRole.OWNER };
const superAdmin = { userId: 'u-sa', role: UserRole.SUPER_ADMIN };

describe('K7 — aturan transisi status order manual', () => {
  it.each([OrderStatus.PAID, OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.DRAFT, OrderStatus.WAITING_PAYMENT])(
    'target %s ditolak (hanya dari alur sistem)',
    (to) => expect(() => assertManualTransition(OrderStatus.WASHING, to)).toThrow(BadRequestException),
  );
  it.each([OrderStatus.DRAFT, OrderStatus.WAITING_PAYMENT, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED])(
    'order berstatus %s tidak bisa diproses manual',
    (from) => expect(() => assertManualTransition(from, OrderStatus.COMPLETED)).toThrow(BadRequestException),
  );
  it('order DRAFT tidak bisa langsung COMPLETED (tanpa bayar)', () =>
    expect(() => assertManualTransition(OrderStatus.DRAFT, OrderStatus.COMPLETED)).toThrow(BadRequestException));
  it.each([
    [OrderStatus.PAID, OrderStatus.RECEIVED],
    [OrderStatus.WASHING, OrderStatus.DRYING],
    [OrderStatus.READY_PICKUP, OrderStatus.COMPLETED],
  ])('%s → %s diizinkan', (from, to) => expect(() => assertManualTransition(from, to)).not.toThrow());
});

describe('K7/K11 — OrdersService', () => {
  function service(order: { status: OrderStatus; ownerUserId?: string }) {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord-1',
          status: order.status,
          customer: order.ownerUserId ? { userId: order.ownerUserId } : null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'ord-1' }),
      },
    };
    return { svc: new OrdersService(prisma, {} as any), prisma };
  }
  const dto = { cancelReason: 'batal' };

  it('updateStatus: PAID manual ditolak dan tidak menulis DB', async () => {
    const { svc, prisma } = service({ status: OrderStatus.DRAFT });
    await expect(svc.updateStatus('ord-1', { status: OrderStatus.PAID } as any, 'u-cashier')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('cancel: customer boleh membatalkan order miliknya yang belum dibayar', async () => {
    const { svc, prisma } = service({ status: OrderStatus.DRAFT, ownerUserId: 'u-A' });
    await svc.cancel('ord-1', dto, 'u-A', custA);
    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('cancel: customer tidak boleh membatalkan order orang lain', async () => {
    const { svc, prisma } = service({ status: OrderStatus.DRAFT, ownerUserId: 'u-B' });
    await expect(svc.cancel('ord-1', dto, 'u-A', custA)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('cancel: customer tidak boleh membatalkan order yang sudah dibayar', async () => {
    const { svc, prisma } = service({ status: OrderStatus.PAID, ownerUserId: 'u-A' });
    await expect(svc.cancel('ord-1', dto, 'u-A', custA)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('cancel: staf boleh membatalkan order yang belum final', async () => {
    const { svc, prisma } = service({ status: OrderStatus.PAID, ownerUserId: 'u-A' });
    await svc.cancel('ord-1', dto, 'u-cashier', cashier);
    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('cancel: order REFUNDED tidak bisa dibatalkan siapa pun', async () => {
    const { svc } = service({ status: OrderStatus.REFUNDED, ownerUserId: 'u-A' });
    await expect(svc.cancel('ord-1', dto, 'u-cashier', cashier)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('K5 — UsersService anti eskalasi', () => {
  function service(targetRole: UserRole) {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          where.id ? Promise.resolve({ id: where.id, role: targetRole, email: 'a@x', phone: '1' }) : Promise.resolve(null),
        ),
        update: jest.fn().mockResolvedValue({ id: 'u-target' }),
        create: jest.fn().mockResolvedValue({ id: 'u-new' }),
      },
      outletUser: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      outlet: { findUnique: jest.fn().mockResolvedValue({ id: 'o-1' }) },
    };
    return { svc: new UsersService(prisma), prisma };
  }

  it('owner tidak boleh memberi role SUPER_ADMIN', async () => {
    const { svc, prisma } = service(UserRole.CASHIER);
    await expect(svc.update('u-target', { role: UserRole.SUPER_ADMIN }, owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('owner tidak boleh mengubah akun SUPER_ADMIN (mis. ganti password)', async () => {
    const { svc, prisma } = service(UserRole.SUPER_ADMIN);
    await expect(svc.update('u-target', { password: 'baru12345' }, owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('owner tidak boleh membuat user SUPER_ADMIN', async () => {
    const { svc, prisma } = service(UserRole.CASHIER);
    await expect(
      svc.create({ name: 'X', email: 'x@x.id', password: 'rahasia123', role: UserRole.SUPER_ADMIN } as any, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('owner boleh mengubah kasir; super admin boleh semuanya', async () => {
    const a = service(UserRole.CASHIER);
    await a.svc.update('u-target', { name: 'Kasir' }, owner);
    expect(a.prisma.user.update).toHaveBeenCalled();
    const b = service(UserRole.SUPER_ADMIN);
    await b.svc.update('u-target', { role: UserRole.SUPER_ADMIN }, superAdmin);
    expect(b.prisma.user.update).toHaveBeenCalled();
  });

  it('role non-admin ditolak di service (pertahanan lapis kedua)', async () => {
    const { svc } = service(UserRole.CUSTOMER);
    await expect(svc.update('u-target', { name: 'x' }, custA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateMe hanya menulis name/email/avatarUrl ke user sendiri', async () => {
    const { svc, prisma } = service(UserRole.CUSTOMER);
    await svc.updateMe('u-A', { name: 'Budi', role: UserRole.SUPER_ADMIN } as any);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-A' }, data: { name: 'Budi' } }),
    );
  });
});

describe('K12 — ulasan hanya untuk order sendiri', () => {
  it('customer tidak bisa mengulas order milik customer lain', async () => {
    const prisma: any = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-A' }) },
      order: { findUnique: jest.fn().mockResolvedValue({ id: 'ord-B', customerId: 'cust-B' }) },
      review: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      kioskSession: { findUnique: jest.fn() },
    };
    const svc = new ReviewsService(prisma);
    await expect(svc.create({ orderId: 'ord-B', rating: 5 } as any, 'u-A')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});
