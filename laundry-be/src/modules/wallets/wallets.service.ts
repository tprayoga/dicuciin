import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TopupWalletDto, PayWithWalletDto, RefundWalletDto } from './dto/wallet.dto';
import {
  WalletTransactionType,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

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
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.userId !== userId) {
      throw new UnauthorizedException('Tidak boleh mengakses PIN customer lain');
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
    if (!customer.walletPinHash) throw new BadRequestException('PIN wallet belum diatur');

    const valid = await bcrypt.compare(pin, customer.walletPinHash);
    if (!valid) throw new UnauthorizedException('PIN salah');

    return { valid: true };
  }

  async getWallet(customerId: string) {
    const wallet = await this.prisma.wallet.findUnique({
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

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getTransactions(customerId: string, page: number = 1, limit: number = 10) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      data: transactions,
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

    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Increment atomik di DB → balanceBefore/After diturunkan dari hasil update,
        // mencegah lost-update saat ada top-up bersamaan. idempotencyKey ganda →
        // create gagal P2002 dan seluruh transaksi (termasuk increment) di-rollback.
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        const balanceAfter = updatedWallet.balance;
        const balanceBefore = balanceAfter.minus(amount);

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionType: WalletTransactionType.TOPUP,
            amount,
            balanceBefore,
            balanceAfter,
            description: description || 'Wallet top-up',
            idempotencyKey,
          },
        });

        return {
          wallet: updatedWallet,
          transaction,
        };
      });
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }

  async pay(customerId: string, payWithWalletDto: PayWithWalletDto) {
    const { orderId, amount, idempotencyKey } = payWithWalletDto;

    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

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
        // Potong saldo secara atomik: hanya berhasil bila saldo >= amount.
        // Mencegah lost-update / overspend saat ada request bersamaan.
        const decremented = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });

        if (decremented.count === 0) {
          throw new BadRequestException('Saldo wallet tidak cukup');
        }

        const refreshed = await tx.wallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });
        const balanceAfter = refreshed.balance;
        const balanceBefore = balanceAfter.plus(amount);

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            transactionType: WalletTransactionType.PAYMENT,
            amount: -amount,
            balanceBefore,
            balanceAfter,
            description: `Payment for order ${order.orderNumber}`,
            idempotencyKey,
          },
        });

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

        return {
          wallet: refreshed,
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

  async refund(customerId: string, refundWalletDto: RefundWalletDto) {
    const { orderId, amount, description, idempotencyKey } = refundWalletDto;

    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Increment atomik (lihat topup) → cegah lost-update saat refund bersamaan.
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        const balanceAfter = updatedWallet.balance;
        const balanceBefore = balanceAfter.minus(amount);

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            transactionType: WalletTransactionType.REFUND,
            amount,
            balanceBefore,
            balanceAfter,
            description: description || `Refund for order ${order.orderNumber}`,
            idempotencyKey,
          },
        });

        return {
          wallet: updatedWallet,
          transaction,
        };
      });
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }
}
