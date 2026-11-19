import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Bentuk `req.user` dari JwtStrategy. */
export interface AuthUser {
  userId: string;
  role: UserRole | string;
  email?: string;
}

/** Semua role internal (bukan pelanggan). */
export const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN_OUTLET,
  UserRole.CASHIER,
  UserRole.OPERATOR,
  UserRole.TECHNICIAN,
];

/** Role manajemen (laporan keuangan, refund, dll). */
export const ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN_OUTLET,
];

/** Role yang boleh mengelola akun user lain. */
export const USER_ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER];

export function isStaff(user: AuthUser | undefined | null): boolean {
  return !!user && (STAFF_ROLES as string[]).includes(user.role as string);
}

/**
 * Pastikan [user] boleh mengakses data customer [customerId]:
 * staf selalu boleh; customer hanya miliknya sendiri.
 * Melempar 404 bila customer tidak ada, 403 bila bukan pemilik.
 */
export async function assertCustomerAccess(
  prisma: PrismaService,
  user: AuthUser,
  customerId: string,
): Promise<void> {
  if (isStaff(user)) return;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  if (!customer) throw new NotFoundException('Customer tidak ditemukan');
  if (customer.userId !== user.userId) {
    throw new ForbiddenException('Tidak boleh mengakses data customer lain');
  }
}

/**
 * Pastikan [user] boleh mengakses order [orderId]. Order tanpa customer
 * (kiosk/tamu) hanya untuk staf.
 */
export async function assertOrderAccess(
  prisma: PrismaService,
  user: AuthUser,
  orderId: string,
): Promise<void> {
  if (isStaff(user)) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customer: { select: { userId: true } } },
  });
  if (!order) throw new NotFoundException('Order not found');
  if (order.customer?.userId !== user.userId) {
    throw new ForbiddenException('Tidak boleh mengakses order ini');
  }
}

/** customerId milik user login (role CUSTOMER), atau null bila belum punya profil. */
export async function ownCustomerId(
  prisma: PrismaService,
  user: AuthUser,
): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  return customer?.id ?? null;
}

/**
 * Untuk request yang membawa `customerId`/`partnerId` di body (checkout, quote,
 * pricing, buat order): staf boleh atas nama siapa pun; customer hanya untuk
 * dirinya sendiri, dan partner B2B hanya untuk partner miliknya.
 * Mengembalikan body dengan identitas yang sudah dipastikan.
 */
export async function scopeCheckoutIdentity<
  T extends { customerId?: string; partnerId?: string },
>(prisma: PrismaService, user: AuthUser, dto: T): Promise<T> {
  if (isStaff(user)) return dto;

  if (dto.partnerId) {
    const partner = await prisma.b2BPartner.findUnique({
      where: { id: dto.partnerId },
      select: { userId: true },
    });
    if (!partner || partner.userId !== user.userId) {
      throw new ForbiddenException('Tidak boleh bertransaksi atas nama partner ini');
    }
    return dto;
  }

  const ownId = await ownCustomerId(prisma, user);
  if (!ownId) throw new ForbiddenException('Akun ini belum memiliki profil customer');
  if (dto.customerId && dto.customerId !== ownId) {
    throw new ForbiddenException('Tidak boleh bertransaksi atas nama customer lain');
  }
  return { ...dto, customerId: ownId };
}
