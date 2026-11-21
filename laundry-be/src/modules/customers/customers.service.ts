import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UserRole, OrderStatus } from "@prisma/client";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { toNum } from "../../common/utils/money.util";
import { normalizePhone, phoneCandidates } from "../../common/utils/phone.util";
import { WalletLedgerService } from "../wallets/wallet-ledger.service";
import { generateDailySequence } from "../../common/utils/sequence.util";
import { conflictFromUniqueViolation } from "../../common/utils/unique-violation.util";

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private walletLedger: WalletLedgerService,
  ) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const {
      name,
      email,
      password,
      gender,
      birthDate,
      initialBalance = 0,
    } = createCustomerDto;
    // Batch 5 (T6): simpan kanonik 628…; cek duplikat terhadap semua format lama.
    const rawPhone = createCustomerDto.phone?.trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
    if (rawPhone && !phone) {
      throw new BadRequestException("Nomor HP tidak valid");
    }

    if (!email && !phone) {
      throw new BadRequestException("Email atau nomor telepon wajib diisi");
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        throw new ConflictException("Email sudah terdaftar");
      }
    }

    if (phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: { in: phoneCandidates(phone) } },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ConflictException("Nomor telepon sudah terdaftar");
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Satu pembuat kode member untuk semua kanal (app & loket). Dulu loket
    // memakai "kode terakhir + 1" tanpa memajukan counter harian sehingga
    // registrasi aplikasi berikutnya bentrok (temuan uji 2026-11-21).
    const memberCode = await generateDailySequence(this.prisma, "MBR", "customer", "memberCode", 6);

    // Member + wallet + saldo awal dalam SATU transaksi. Saldo awal TIDAK lagi
    // ditulis langsung ke wallet.balance: dicatat lewat ledger (SSoT) sebagai
    // top-up manual agar saldo & wallet_ledgers selalu cocok.
    return this.prisma
      .$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          memberCode,
          gender,
          birthDate: birthDate ? new Date(birthDate) : undefined,
          user: {
            create: {
              name,
              email,
              phone,
              passwordHash,
              passwordChangedAt: new Date(),
              role: UserRole.CUSTOMER,
            },
          },
          wallet: {
            create: {},
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
            },
          },
          wallet: true,
        },
      });

      if (initialBalance > 0 && created.wallet) {
        const ledger = await this.walletLedger.topUp({
          tx,
          walletId: created.wallet.id,
          amount: initialBalance,
          referenceType: "TOPUP",
          description: "Saldo awal member (admin)",
        });
        return {
          ...created,
          wallet: { ...created.wallet, balance: ledger.balanceAfter },
        };
      }
      return created;
      })
      .catch((err) => {
        // Dua pendaftaran paralel untuk nomor/email yang sama → 409 yang jelas.
        throw conflictFromUniqueViolation(err) ?? err;
      });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isActive: true,
            },
          },
          wallet: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.customer.count(),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        wallet: true,
        addresses: true,
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  async getOrders(id: string, page: number = 1, limit: number = 10) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        skip,
        take: limit,
        include: {
          outlet: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.order.count({ where: { customerId: id } }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Statistik ringkas member untuk dashboard mobile. */
  async getStats(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const paidStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.RECEIVED,
      OrderStatus.WASHING,
      OrderStatus.DRYING,
      OrderStatus.IRONING,
      OrderStatus.PACKING,
      OrderStatus.READY_PICKUP,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.COMPLETED,
    ];

    const [totalOrders, completedOrders, spend, favItems] = await Promise.all([
      this.prisma.order.count({ where: { customerId: id } }),
      this.prisma.order.count({
        where: { customerId: id, status: OrderStatus.COMPLETED },
      }),
      this.prisma.order.aggregate({
        where: { customerId: id, status: { in: paidStatuses } },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ["serviceName"],
        where: { order: { customerId: id } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      }),
    ]);

    return {
      totalOrders,
      completedOrders,
      totalSpending: toNum(spend._sum.totalAmount),
      favoriteService: favItems[0]?.serviceName ?? null,
    };
  }

  async getWallet(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        wallet: {
          include: {
            transactions: {
              take: 10,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer.wallet;
  }

}
