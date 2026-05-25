import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TopupWalletDto, PayWithWalletDto, RefundWalletDto } from './dto/wallet.dto';
import { WalletTransactionType } from '@prisma/client';

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

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

    if (idempotencyKey) {
      const existing = await this.prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Transaction already processed');
      }
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

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
  }

  async pay(customerId: string, payWithWalletDto: PayWithWalletDto) {
    const { orderId, amount, idempotencyKey } = payWithWalletDto;

    if (idempotencyKey) {
      const existing = await this.prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Transaction already processed');
      }
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { customerId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

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

      return {
        wallet: updatedWallet,
        transaction,
      };
    });
  }

  async refund(customerId: string, refundWalletDto: RefundWalletDto) {
    const { orderId, amount, description, idempotencyKey } = refundWalletDto;

    if (idempotencyKey) {
      const existing = await this.prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Transaction already processed');
      }
    }

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

    return this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

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
  }
}
