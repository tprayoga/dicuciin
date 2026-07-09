import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TopupWalletDto,
  PayWithWalletDto,
  RefundWalletDto,
} from './dto/wallet.dto';
import {
  WalletType,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
  UserRole,
  Prisma,
} from '@prisma/client';
import { PromosService } from '../promos/promos.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { mapLedgerToTransaction } from './wallet-history.mapper';

/**
 * Service fitur wallet yang menghadap HTTP/mobile: PIN, top-up, pembayaran, dan
 * refund. Orkestrasi validasi (owner order, status, PIN) + efek samping order
 * (payment/status log/promo), tetapi **mutasi saldo didelegasikan** ke
 * `WalletLedgerService` sebagai satu-satunya pintu (SSoT `wallet_ledgers`).
 *
 * `wallet_transactions` tidak lagi ditulis (dual-write dihentikan di T9). Histori
 * dibaca dari `wallet_ledgers` (via `mapLedgerToTransaction`), dan respons
 * top-up/pay/refund menurunkan field `transaction` dari baris ledger agar
 * kontrak lama tetap. Tabel `wallet_transactions` disimpan untuk arsip.
 */
@Injectable()
export class WalletsService {
  constructor(
    private prisma: PrismaService,
    private promosService: PromosService,
    private walletLedger: WalletLedgerService,
  ) {}

  /**
   * Akun customer lama dapat belum memiliki row wallet. Buat wallet saldo nol
   * saat pertama kali diakses agar endpoint wallet tetap dapat digunakan.
   */
  private async getOrCreateWallet(customerId: string) {
    const existing = await this.prisma.wallet.findUnique({
      where: { customerId },
    });
    if (existing) return existing;

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.wallet.upsert({
      where: { customerId },
      update: {},
      create: { customerId, balance: 0 },
    });
  }

  /**
   * Terjemahkan bentrok unique key (Prisma P2002) — mis. idempotencyKey ganda —
   * menjadi ConflictException. Mengandalkan unique constraint DB lebih aman dari
   * cek-lalu-tulis manual yang racy (dua request bisa lolos cek bersamaan).
   */
  private rethrowDuplicate(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Transaction already processed');
    }
    throw err;
  }

  /** Pastikan customer ada dan dimiliki oleh user yang sedang login. */
  private async getOwnedCustomer(customerId: string, userId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.userId !== userId) {
      throw new UnauthorizedException(
        'Tidak boleh mengakses PIN customer lain',
      );
    }
    return customer;
  }

  /** Set / ganti PIN wallet (6 digit, disimpan sebagai hash bcrypt). */
  async setPin(customerId: string, userId: string, pin: string) {
    await this.getOwnedCustomer(customerId, userId);

    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { walletPinHash: pinHash, pinSetAt: new Date() },
    });

    return { message: 'PIN wallet berhasil disimpan' };
  }

  /** Verifikasi PIN wallet. */
  async verifyPin(customerId: string, userId: string, pin: string) {
    const customer = await this.getOwnedCustomer(customerId, userId);
    if (!customer.walletPinHash)
      throw new BadRequestException('PIN wallet belum diatur');

    const valid = await bcrypt.compare(pin, customer.walletPinHash);
    if (!valid) throw new UnauthorizedException('PIN salah');

    return { valid: true };
  }

  async getWallet(customerId: string) {
    await this.getOrCreateWallet(customerId);

    return this.prisma.wallet.findUniqueOrThrow({
      where: { customerId },
      include: {
        customer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  async getTransactions(
    customerId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const wallet = await this.getOrCreateWallet(customerId);

    const skip = (page - 1) * limit;

    // Baca dari `wallet_ledgers` (SSoT) lalu petakan ke bentuk histori lama agar
    // kontrak endpoint/mobile tidak berubah. Menampilkan seluruh mutasi uang
    // (MAIN + BONUS) — lebih lengkap dari sebelumnya, tetapi bentuk baris sama.
    const [ledgers, total] = await Promise.all([
      this.prisma.walletLedger.findMany({
        where: { walletId: wallet.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletLedger.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      data: ledgers.map(mapLedgerToTransaction),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async topup(customerId: string, topupWalletDto: TopupWalletDto) {
    const { amount, description, idempotencyKey } = topupWalletDto;

    const wallet = await this.getOrCreateWallet(customerId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Mutasi saldo (increment atomik) lewat satu pintu WalletLedgerService →
        // menulis wallet_ledgers (SSoT). idempotencyKey ganda → ledger.create
        // gagal P2002 dan seluruh transaksi di-rollback.
        const ledger = await this.walletLedger.topUp({
          tx,
          walletId: wallet.id,
          amount,
          referenceType: 'TOPUP',
          description: description || 'Wallet top-up',
          idempotencyKey,
        });

        return {
          wallet: { ...wallet, balance: ledger.balanceAfter },
          transaction: mapLedgerToTransaction(ledger),
        };
      });
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }

  async pay(customerId: string, payWithWalletDto: PayWithWalletDto) {
    const { orderId, amount, idempotencyKey } = payWithWalletDto;

    const wallet = await this.getOrCreateWallet(customerId);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Hanya boleh membayar order milik customer ini (jika order ber-owner).
    if (order.customerId && order.customerId !== customerId) {
      throw new UnauthorizedException('Order bukan milik customer ini');
    }

    if (order.status === OrderStatus.PAID) {
      throw new ConflictException('Order sudah dibayar');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Potong saldo lewat satu pintu WalletLedgerService (MAIN_BALANCE saja —
        // perilaku sama seperti sebelumnya). Guard saldo cukup + potong atomik
        // (cegah overspend/lost-update) ditangani di dalam service ledger; saldo
        // kurang → BadRequestException.
        const ledger = await this.walletLedger.debit(WalletType.MAIN_BALANCE, {
          tx,
          walletId: wallet.id,
          amount,
          orderId,
          referenceType: 'PAYMENT',
          description: `Payment for order ${order.orderNumber}`,
          idempotencyKey,
        });

        const transaction = mapLedgerToTransaction(ledger);

        // Catat pembayaran (paymentNumber unik diturunkan dari orderNumber →
        // pembayaran kedua atas order yang sama akan ditolak constraint unik).
        const payment = await tx.payment.create({
          data: {
            orderId,
            paymentNumber: `PAY-${order.orderNumber}`,
            paymentMethod: PaymentMethod.WALLET,
            amount,
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            notes: 'Pembayaran via saldo wallet',
          },
        });

        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAID },
        });

        await tx.orderStatusLog.create({
          data: {
            orderId,
            status: OrderStatus.PAID,
            notes: 'Dibayar via saldo wallet',
            createdBy: customerId,
          },
        });

        // Pemakaian promo dicatat saat order benar-benar dibayar.
        await this.promosService.commitUsage(tx, orderId);

        return {
          wallet: { ...wallet, balance: ledger.balanceAfter },
          transaction,
          payment,
          order: updatedOrder,
        };
      });
    } catch (err) {
      // Bentrok unik (idempotencyKey atau paymentNumber) → pembayaran ganda.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Order sudah dibayar');
      }
      throw err;
    }
  }

  async refund(
    customerId: string,
    userId: string,
    refundWalletDto: RefundWalletDto,
  ) {
    const { orderId, description } = refundWalletDto;
    return this.processRefund({
      orderId,
      expectedCustomerId: customerId,
      actorUserId: userId,
      description,
      requireCustomerOwnership: true,
    });
  }

  async refundByAdmin(
    orderId: string,
    adminUserId: string,
    description: string,
  ) {
    const [admin, order] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: adminUserId },
        select: {
          role: true,
          outletUsers: { select: { outletId: true } },
        },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { outletId: true },
      }),
    ]);
    if (!admin) throw new ForbiddenException('Admin tidak ditemukan');
    if (!order) throw new NotFoundException('Order not found');

    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.ADMIN_OUTLET,
    ];
    if (!allowedRoles.includes(admin.role)) {
      throw new ForbiddenException('Tidak memiliki izin refund');
    }
    if (
      admin.role === UserRole.ADMIN_OUTLET &&
      !admin.outletUsers.some(
        (assignment) => assignment.outletId === order.outletId,
      )
    ) {
      throw new ForbiddenException('Order bukan dari outlet yang Anda kelola');
    }

    return this.processRefund({
      orderId,
      actorUserId: adminUserId,
      description,
      requireCustomerOwnership: false,
    });
  }

  private async processRefund(params: {
    orderId: string;
    expectedCustomerId?: string;
    actorUserId: string;
    description: string;
    requireCustomerOwnership: boolean;
  }) {
    const {
      orderId,
      expectedCustomerId,
      actorUserId,
      description,
      requireCustomerOwnership,
    } = params;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { userId: true } },
        payments: {
          where: { status: PaymentStatus.PAID },
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!order.customerId || !order.customer) {
      throw new BadRequestException(
        'Order tanpa customer tidak dapat direfund ke wallet',
      );
    }
    if (
      requireCustomerOwnership &&
      (order.customerId !== expectedCustomerId ||
        order.customer.userId !== actorUserId)
    ) {
      throw new UnauthorizedException('Order bukan milik customer ini');
    }
    if (order.status === OrderStatus.REFUNDED) {
      throw new ConflictException('Order sudah direfund');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'Refund hanya tersedia sebelum proses laundry dimulai',
      );
    }

    const payment = order.payments[0];
    if (!payment) {
      throw new BadRequestException('Pembayaran lunas tidak ditemukan');
    }

    const customerId = order.customerId;
    const wallet = await this.getOrCreateWallet(customerId);
    const amount = payment.amount;
    const idempotencyKey = `refund-order-${orderId}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const markedRefunded = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PAID },
          data: {
            status: PaymentStatus.REFUNDED,
            notes: description,
          },
        });
        if (markedRefunded.count === 0) {
          throw new ConflictException('Order sudah direfund');
        }

        // Kembalikan saldo lewat satu pintu WalletLedgerService (increment atomik
        // ke MAIN_BALANCE) → menulis wallet_ledgers (SSoT).
        const ledger = await this.walletLedger.credit(WalletType.MAIN_BALANCE, {
          tx,
          walletId: wallet.id,
          amount,
          orderId,
          referenceType: 'REFUND',
          description,
          idempotencyKey,
        });

        const transaction = mapLedgerToTransaction(ledger);

        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.REFUNDED,
            cancelReason: description,
          },
        });
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: OrderStatus.REFUNDED,
            notes: description,
            createdBy: actorUserId,
          },
        });

        return {
          wallet: { ...wallet, balance: ledger.balanceAfter },
          transaction,
          payment: { ...payment, status: PaymentStatus.REFUNDED },
          order: updatedOrder,
        };
      });
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }
}
