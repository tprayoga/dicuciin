import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UserRole, OrderStatus, Prisma } from "@prisma/client";
import { tzOffsetMinutes } from "../../common/utils/operating-hours";

export const CUSTOMER_SEGMENTS = ["all", "new", "active", "balance", "inactive"] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

/** Awal bulan berjalan menurut zona waktu bisnis (WIB), dalam UTC. */
function startOfMonthLocal(now: Date): Date {
  const off = tzOffsetMinutes() * 60_000;
  const local = new Date(now.getTime() + off);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - off);
}
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

  /**
   * Daftar member untuk Kelola Member: pencarian & segmen di server (dulu filter
   * hanya di 100 baris pertama di browser, dan dropdown segmen tidak berfungsi),
   * plus ringkasan yang benar untuk kartu statistik.
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    opts: { search?: string; segment?: CustomerSegment } = {},
  ) {
    const skip = (page - 1) * limit;
    const now = new Date();
    const monthStart = startOfMonthLocal(now);
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeOrder = {
      orderDate: { gte: activeSince },
      status: { notIn: [OrderStatus.DRAFT, OrderStatus.CANCELLED] },
    };

    // Member yang sudah dihapus (dianonimkan) tidak tampil di Kelola Member.
    const base: Prisma.CustomerWhereInput = { user: { deletedAt: null } };
    const segmentWhere: Record<CustomerSegment, Prisma.CustomerWhereInput> = {
      all: {},
      new: { createdAt: { gte: monthStart } },
      active: { orders: { some: activeOrder } },
      balance: { wallet: { balance: { gt: 0 } } },
      inactive: { user: { deletedAt: null, isActive: false } },
    };
    const keyword = opts.search?.trim();
    // Nomor HP disimpan 62xxx — "0812…" juga harus ketemu.
    const digits = keyword?.replace(/\D/g, "") ?? "";
    const phoneTerms =
      digits.length >= 3
        ? [digits, ...(digits.startsWith("0") ? [`62${digits.slice(1)}`] : [])]
        : [];
    const searchWhere: Prisma.CustomerWhereInput = keyword
      ? {
          OR: [
            { memberCode: { contains: keyword, mode: "insensitive" } },
            { user: { name: { contains: keyword, mode: "insensitive" } } },
            ...phoneTerms.map((t) => ({ user: { phone: { contains: t } } })),
            { user: { email: { contains: keyword, mode: "insensitive" } } },
          ],
        }
      : {};
    const where: Prisma.CustomerWhereInput = {
      AND: [base, segmentWhere[opts.segment ?? "all"] ?? {}, searchWhere],
    };

    const [customers, total, totalAll, newThisMonth, active30d, balanceSum] =
      await Promise.all([
        this.prisma.customer.findMany({
          where,
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
            _count: {
              select: {
                orders: {
                  where: { status: { notIn: [OrderStatus.DRAFT, OrderStatus.CANCELLED] } },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.customer.count({ where }),
        this.prisma.customer.count({ where: base }),
        this.prisma.customer.count({ where: { ...base, createdAt: { gte: monthStart } } }),
        this.prisma.customer.count({ where: { ...base, orders: { some: activeOrder } } }),
        this.prisma.wallet.aggregate({
          where: { customer: base },
          _sum: { balance: true },
        }),
      ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        // Di dalam meta: interceptor respons hanya meneruskan data + meta.
        summary: {
          totalMembers: totalAll,
          newThisMonth,
          active30d,
          totalBalance: toNum(balanceSum._sum.balance ?? 0),
        },
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
