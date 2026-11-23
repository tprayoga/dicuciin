import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  AccountDeletionStatus,
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReconciliationStatus,
  TopupStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { revokeUserSessions } from '../../common/auth/sessions';

/**
 * Batch 6 — hapus akun mandiri (aplikasi & web).
 *
 * Prinsip:
 *  - Hanya akun PELANGGAN. Akun staf dikelola admin.
 *  - Re-autentikasi wajib: password (aplikasi) atau OTP WhatsApp (web).
 *  - Ditolak/ditunda selama ada uang atau layanan yang belum tuntas: saldo
 *    utama > 0, order dibayar belum selesai, order menunggu pembayaran,
 *    booking aktif, pembayaran/top-up PENDING, rekonsiliasi/refund terbuka.
 *    Permintaan tetap DICATAT (PENDING_REVIEW) agar admin bisa menuntaskan
 *    (mis. mengembalikan saldo) lalu menyelesaikan penghapusan.
 *  - Penghapusan = ANONIMISASI data pribadi + nonaktifkan + cabut semua sesi.
 *    Order, pembayaran, ledger saldo/poin, top-up, rekonsiliasi, dan audit log
 *    TIDAK dihapus (catatan keuangan wajib disimpan) — hanya tidak lagi
 *    tertaut ke identitas.
 *  - Setiap langkah tercatat di AuditLog (tanpa data pribadi).
 */
export type DeletionChannel = 'APP' | 'WEB' | 'ADMIN';

export type DeletionBlockerCode =
  | 'WALLET_BALANCE'
  | 'ORDER_IN_PROGRESS'
  | 'ORDER_AWAITING_PAYMENT'
  | 'ACTIVE_BOOKING'
  | 'PENDING_PAYMENT'
  | 'PENDING_TOPUP'
  | 'OPEN_REFUND_CASE';

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  message: string;
  count?: number;
  amount?: number;
}

const IN_PROGRESS: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.RECEIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.PACKING,
  OrderStatus.READY_PICKUP,
  OrderStatus.OUT_FOR_DELIVERY,
];
const OPEN_CASES: ReconciliationStatus[] = [
  ReconciliationStatus.OPEN,
  ReconciliationStatus.REQUESTED,
  ReconciliationStatus.APPROVED,
];

export const DELETED_NAME = 'Pengguna Dihapus';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Nonaktif secara default: owner mengaktifkan (`ACCOUNT_DELETION_ENABLED=true`)
   * setelah kebijakan disetujui (lihat docs 22). Selama nonaktif, pengguna
   * diarahkan ke layanan pelanggan.
   */
  isEnabled() {
    return this.config.get<string>('ACCOUNT_DELETION_ENABLED', 'false') === 'true';
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new ForbiddenException(
        'Penghapusan akun mandiri belum aktif. Hubungi layanan pelanggan untuk menghapus akun.',
      );
    }
  }

  /** Penghalang penghapusan untuk customer (dipakai pratinjau & eksekusi). */
  async blockersFor(db: Prisma.TransactionClient | PrismaService, customerId: string) {
    const [wallet, inProgress, awaiting, bookings, payments, topups, cases] = await Promise.all([
      db.wallet.findUnique({ where: { customerId }, select: { balance: true, bonusBalance: true, pointBalance: true } }),
      db.order.count({ where: { customerId, status: { in: IN_PROGRESS } } }),
      db.order.count({ where: { customerId, status: OrderStatus.WAITING_PAYMENT } }),
      db.machineBooking.count({
        where: { customerId, status: { in: [BookingStatus.HOLD, BookingStatus.RESERVED, BookingStatus.IN_USE] } },
      }),
      db.payment.count({ where: { status: PaymentStatus.PENDING, order: { customerId } } }),
      db.walletTopup.count({ where: { customerId, status: TopupStatus.PENDING } }),
      db.paymentReconciliation.count({ where: { customerId, status: { in: OPEN_CASES } } }),
    ]);
    const balance = Number(wallet?.balance ?? 0);
    const blockers: DeletionBlocker[] = [];
    if (balance > 0) {
      blockers.push({
        code: 'WALLET_BALANCE',
        message: 'Masih ada saldo. Gunakan saldo atau ajukan pengembalian saldo ke layanan pelanggan.',
        amount: balance,
      });
    }
    if (inProgress) blockers.push({ code: 'ORDER_IN_PROGRESS', message: 'Ada order yang belum selesai.', count: inProgress });
    if (awaiting) {
      blockers.push({ code: 'ORDER_AWAITING_PAYMENT', message: 'Ada order menunggu pembayaran — batalkan dulu.', count: awaiting });
    }
    if (bookings) blockers.push({ code: 'ACTIVE_BOOKING', message: 'Ada booking mesin yang masih aktif.', count: bookings });
    if (payments) blockers.push({ code: 'PENDING_PAYMENT', message: 'Ada pembayaran yang masih diproses.', count: payments });
    if (topups) blockers.push({ code: 'PENDING_TOPUP', message: 'Ada top up yang masih diproses.', count: topups });
    if (cases) blockers.push({ code: 'OPEN_REFUND_CASE', message: 'Ada pengajuan refund/rekonsiliasi yang belum selesai.', count: cases });
    return {
      blockers,
      balance,
      bonusBalance: Number(wallet?.bonusBalance ?? 0),
      pointBalance: wallet?.pointBalance ?? 0,
    };
  }

  private async customerOf(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true, customer: { select: { id: true } } },
    });
    if (!user || user.deletedAt) throw new NotFoundException('Akun tidak ditemukan');
    if (user.role !== UserRole.CUSTOMER || !user.customer) {
      throw new ForbiddenException('Akun staf/admin dihapus oleh pemilik usaha, bukan dari aplikasi');
    }
    return { user, customerId: user.customer.id };
  }

  /** Pratinjau untuk layar konfirmasi (apa yang akan hilang & apa penghalangnya). */
  async preview(userId: string) {
    this.assertEnabled();
    const { customerId } = await this.customerOf(userId);
    const r = await this.blockersFor(this.prisma, customerId);
    const pending = await this.prisma.accountDeletionRequest.findFirst({
      where: { userId, status: AccountDeletionStatus.PENDING_REVIEW },
      select: { id: true, requestedAt: true },
    });
    return {
      canDeleteNow: r.blockers.length === 0,
      blockers: r.blockers,
      forfeited: { bonusBalance: r.bonusBalance, pointBalance: r.pointBalance },
      pendingRequest: pending,
    };
  }

  /**
   * Ajukan & (bila tanpa penghalang) jalankan penghapusan. Pemanggil SUDAH
   * melakukan re-autentikasi (password / OTP).
   */
  async request(userId: string, channel: DeletionChannel, reason?: string | null) {
    this.assertEnabled();
    const { customerId } = await this.customerOf(userId);
    const cleanReason = reason?.trim().slice(0, 500) || null;

    return this.prisma.$transaction(async (tx) => {
      // Satu proses per akun pada satu waktu.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { deletedAt: true } });
      if (fresh.deletedAt) throw new ConflictException('Akun sudah dihapus');

      const r = await this.blockersFor(tx, customerId);
      if (r.blockers.length) {
        const existing = await tx.accountDeletionRequest.findFirst({
          where: { userId, status: AccountDeletionStatus.PENDING_REVIEW },
        });
        const data = {
          blockers: r.blockers as unknown as Prisma.InputJsonValue,
          balanceSnapshot: new Prisma.Decimal(r.balance),
          reason: cleanReason ?? existing?.reason ?? null,
        };
        const req = existing
          ? await tx.accountDeletionRequest.update({ where: { id: existing.id }, data })
          : await tx.accountDeletionRequest.create({
              data: { userId, status: AccountDeletionStatus.PENDING_REVIEW, channel, ...data },
            });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'ACCOUNT_DELETION_REQUESTED',
            entity: 'AccountDeletionRequest',
            entityId: req.id,
            changes: { channel, blockers: r.blockers.map((b) => b.code) },
          },
        });
        return { status: req.status, requestId: req.id, blockers: r.blockers };
      }

      const existing = await tx.accountDeletionRequest.findFirst({
        where: { userId, status: AccountDeletionStatus.PENDING_REVIEW },
      });
      const req = existing
        ? await tx.accountDeletionRequest.update({
            where: { id: existing.id },
            data: { status: AccountDeletionStatus.COMPLETED, completedAt: new Date(), blockers: Prisma.DbNull },
          })
        : await tx.accountDeletionRequest.create({
            data: {
              userId,
              status: AccountDeletionStatus.COMPLETED,
              channel,
              reason: cleanReason,
              balanceSnapshot: new Prisma.Decimal(r.balance),
              completedAt: new Date(),
            },
          });
      await this.anonymizeInTx(tx, userId, customerId, req.id, channel, null);
      return { status: req.status, requestId: req.id, blockers: [] as DeletionBlocker[] };
    });
  }

  /**
   * Hapus member dari admin (menu Kelola Member). Memakai anonimisasi yang sama dengan
   * hapus akun mandiri: data pribadi dihapus, order/laporan/ledger tetap utuh.
   * Ditolak (409 + daftar penghalang) bila masih ada saldo, order/booking aktif, dsb.
   * Tidak bergantung pada ACCOUNT_DELETION_ENABLED (itu untuk hapus akun mandiri).
   */
  async deleteByAdmin(customerId: string, adminUserId: string, note?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, userId: true, user: { select: { deletedAt: true } } },
      });
      if (!customer) throw new NotFoundException('Member tidak ditemukan');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${customer.userId} FOR UPDATE`;
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: customer.userId }, select: { deletedAt: true } });
      if (fresh.deletedAt) throw new ConflictException('Member sudah dihapus');
      const r = await this.blockersFor(tx, customer.id);
      if (r.blockers.length) {
        throw new ConflictException({
          message: `Member belum bisa dihapus: ${r.blockers.map((b) => b.message).join(' ')}`,
          blockers: r.blockers,
        });
      }
      const existing = await tx.accountDeletionRequest.findFirst({
        where: { userId: customer.userId, status: AccountDeletionStatus.PENDING_REVIEW },
      });
      const done = { status: AccountDeletionStatus.COMPLETED, completedAt: new Date(), processedBy: adminUserId, note: note ?? 'Dihapus admin dari Kelola Member' };
      const req = existing
        ? await tx.accountDeletionRequest.update({ where: { id: existing.id }, data: { ...done, blockers: Prisma.DbNull } })
        : await tx.accountDeletionRequest.create({
            data: { userId: customer.userId, channel: 'ADMIN', balanceSnapshot: new Prisma.Decimal(r.balance), ...done },
          });
      await this.anonymizeInTx(tx, customer.userId, customer.id, req.id, 'ADMIN', adminUserId);
      return { status: AccountDeletionStatus.COMPLETED, requestId: req.id };
    });
  }

  /** Admin menyelesaikan permintaan PENDING_REVIEW setelah penghalang dituntaskan. */
  async completeByAdmin(requestId: string, adminUserId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.accountDeletionRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new NotFoundException('Permintaan tidak ditemukan');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${req.userId} FOR UPDATE`;
      const fresh = await tx.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (fresh.status !== AccountDeletionStatus.PENDING_REVIEW) {
        throw new ConflictException(`Permintaan sudah ${fresh.status}`);
      }
      const customer = await tx.customer.findUnique({ where: { userId: req.userId }, select: { id: true } });
      if (!customer) throw new NotFoundException('Customer tidak ditemukan');
      const r = await this.blockersFor(tx, customer.id);
      if (r.blockers.length) {
        throw new ConflictException({
          message: 'Masih ada penghalang — tuntaskan dulu (mis. kembalikan saldo lewat refund resmi).',
          blockers: r.blockers,
        });
      }
      await tx.accountDeletionRequest.update({
        where: { id: requestId },
        data: { status: AccountDeletionStatus.COMPLETED, completedAt: new Date(), processedBy: adminUserId, note: note ?? null },
      });
      await this.anonymizeInTx(tx, req.userId, customer.id, requestId, req.channel as DeletionChannel, adminUserId);
      return { status: AccountDeletionStatus.COMPLETED, requestId };
    });
  }

  async cancelByAdmin(requestId: string, adminUserId: string, note: string) {
    const r = await this.prisma.accountDeletionRequest.updateMany({
      where: { id: requestId, status: AccountDeletionStatus.PENDING_REVIEW },
      data: { status: AccountDeletionStatus.CANCELLED, processedBy: adminUserId, note },
    });
    if (r.count === 0) throw new ConflictException('Permintaan tidak dalam status PENDING_REVIEW');
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'ACCOUNT_DELETION_CANCELLED', entity: 'AccountDeletionRequest', entityId: requestId },
    });
    return { status: AccountDeletionStatus.CANCELLED, requestId };
  }

  async listForAdmin(status?: AccountDeletionStatus) {
    return this.prisma.accountDeletionRequest.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, name: true, phone: true, email: true, deletedAt: true } } },
    });
  }

  /**
   * Anonimisasi data pribadi. TIDAK menyentuh order/pembayaran/ledger/top-up/
   * rekonsiliasi/audit (catatan keuangan & hukum).
   */
  private async anonymizeInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    customerId: string,
    requestId: string,
    channel: DeletionChannel,
    actorUserId: string | null,
  ) {
    const now = new Date();
    const unusablePassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_NAME,
        email: null,
        phone: null,
        avatarUrl: null,
        phoneVerifiedAt: null,
        passwordHash: unusablePassword,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        isActive: false,
        deletedAt: now,
      },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: {
        birthDate: null,
        gender: null,
        occupation: null,
        walletPinHash: null,
        pinSetAt: null,
        walletPinFailedAttempts: 0,
        walletPinLockedUntil: null,
      },
    });
    // Alamat dirujuk order (riwayat) → dianonimkan, bukan dihapus.
    await tx.customerAddress.updateMany({
      where: { customerId },
      data: {
        label: 'Dihapus',
        recipientName: DELETED_NAME,
        phone: '-',
        address: '[dihapus]',
        city: '-',
        province: '-',
        postalCode: null,
        latitude: null,
        longitude: null,
        isDefault: false,
      },
    });
    await tx.walletPinProof.deleteMany({ where: { customerId } });
    await tx.notification.deleteMany({ where: { userId } });
    if (before.phone) await tx.otpCode.deleteMany({ where: { phone: before.phone } });
    await revokeUserSessions(tx, userId, 'ACCOUNT_DELETED');
    await tx.auditLog.create({
      data: {
        userId: actorUserId ?? userId,
        action: 'ACCOUNT_DELETED',
        entity: 'User',
        entityId: userId,
        changes: { channel, requestId, by: actorUserId ? 'ADMIN' : 'SELF' },
      },
    });
    this.logger.log(`Akun ${userId} dianonimkan (permintaan ${requestId}, kanal ${channel})`);
  }

  assertConfirmation(confirm: string) {
    if ((confirm ?? '').trim().toUpperCase() !== 'HAPUS') {
      throw new BadRequestException('Ketik HAPUS untuk mengonfirmasi');
    }
  }
}
