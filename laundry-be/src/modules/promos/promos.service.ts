import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';
import { Prisma, PromoType } from '@prisma/client';
import { toNum } from '../../common/utils/money.util';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';

type PrismaTx = Prisma.TransactionClient;

/** Item pesanan untuk evaluasi promo: subtotal per layanan. */
export interface PromoEvalItem {
  serviceId?: string;
  subtotal: Prisma.Decimal.Value;
}

export interface PromoEvalInput {
  code: string;
  customerId?: string;
  items: PromoEvalItem[];
  outletId?: string;
  deliveryFee?: Prisma.Decimal.Value;
  /** Jalankan di dalam transaksi pemanggil (mis. saat membuat order). */
  tx?: PrismaTx;
}

export interface PromoEvalResult {
  promo: Prisma.PromoGetPayload<{ include: { rules: true } }>;
  /** Potongan harga di checkout (0 untuk CASHBACK). */
  discount: Prisma.Decimal;
  /** Kredit wallet saat order dibayar (0 kecuali CASHBACK). */
  cashback: Prisma.Decimal;
  /** Subtotal item yang termasuk promo (untuk promo terbatas layanan). */
  eligibleSubtotal: Prisma.Decimal;
}

/** Bulatkan nilai uang ke rupiah penuh (tanpa pecahan sen). */
const toRupiah = (v: Prisma.Decimal): Prisma.Decimal =>
  v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

/** Parse CSV id ("a, b ,c") → Set id non-kosong. */
const parseIdCsv = (csv?: string | null): Set<string> =>
  new Set(
    (csv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

@Injectable()
export class PromosService {
  constructor(
    private prisma: PrismaService,
    private walletLedger: WalletLedgerService,
  ) {}

  async create(createPromoDto: CreatePromoDto) {
    const { rule, ...promoData } = createPromoDto;

    const existing = await this.prisma.promo.findUnique({
      where: { code: promoData.code },
    });
    if (existing) {
      throw new ConflictException('Promo code already exists');
    }

    return this.prisma.promo.create({
      data: {
        ...promoData,
        startDate: new Date(promoData.startDate),
        endDate: new Date(promoData.endDate),
        ...(rule
          ? {
              rules: {
                create: rule,
              },
            }
          : {}),
      },
      include: { rules: true },
    });
  }

  async update(id: string, updatePromoDto: UpdatePromoDto) {
    const promo = await this.prisma.promo.findUnique({
      where: { id },
      include: { rules: true },
    });
    if (!promo) throw new NotFoundException('Promo not found');

    const { rule, code, startDate, endDate, ...rest } = updatePromoDto;

    // Kode harus tetap unik bila diubah.
    if (code && code !== promo.code) {
      const clash = await this.prisma.promo.findUnique({ where: { code } });
      if (clash) throw new ConflictException('Promo code already exists');
    }

    const existingRuleId = promo.rules[0]?.id;

    return this.prisma.promo.update({
      where: { id },
      data: {
        ...rest,
        ...(code ? { code } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(rule
          ? {
              rules: existingRuleId
                ? { update: { where: { id: existingRuleId }, data: rule } }
                : { create: rule },
            }
          : {}),
      },
      include: { rules: true },
    });
  }

  async remove(id: string) {
    const promo = await this.prisma.promo.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Promo not found');

    await this.prisma.promo.delete({ where: { id } });
    return { message: 'Promo deleted successfully' };
  }

  /**
   * Sumber kebenaran TUNGGAL untuk validasi + kalkulasi promo. Dipakai bersama
   * oleh `POST /promos/validate` (preview) dan pembuatan order (realisasi),
   * sehingga preview = hasil sebenarnya. Melempar error bila promo tidak valid.
   *
   * Catatan: pemakaian (PromoUsage + usedCount) TIDAK ditulis di sini — itu
   * dicatat saat order DIBAYAR via `commitUsage`.
   */
  async evaluatePromo(input: PromoEvalInput): Promise<PromoEvalResult> {
    const db = input.tx ?? this.prisma;

    const promo = await db.promo.findUnique({
      where: { code: input.code },
      include: { rules: true },
    });
    if (!promo) throw new NotFoundException('Kode promo tidak ditemukan');
    if (!promo.isActive) throw new BadRequestException('Promo tidak aktif');

    const now = new Date();
    if (now < promo.startDate || now > promo.endDate) {
      throw new BadRequestException('Promo tidak berlaku saat ini');
    }
    if (promo.quota != null && promo.usedCount >= promo.quota) {
      throw new BadRequestException('Kuota promo sudah habis');
    }

    const rule = promo.rules[0];
    const sum = (items: PromoEvalItem[]) =>
      items.reduce(
        (acc, it) => acc.plus(it.subtotal),
        new Prisma.Decimal(0),
      );

    const orderSubtotal = sum(input.items);

    // Batas outlet: bila di-set, outlet order wajib termasuk.
    const outletSet = parseIdCsv(rule?.applicableOutlets);
    if (outletSet.size > 0 && (!input.outletId || !outletSet.has(input.outletId))) {
      throw new BadRequestException('Promo tidak berlaku di outlet ini');
    }

    // Batas layanan: diskon hanya atas subtotal item layanan yang termasuk.
    let eligibleSubtotal = orderSubtotal;
    const serviceSet = parseIdCsv(rule?.applicableServices);
    if (serviceSet.size > 0) {
      const eligible = input.items.filter(
        (it) => it.serviceId && serviceSet.has(it.serviceId),
      );
      if (eligible.length === 0) {
        throw new BadRequestException(
          'Promo tidak berlaku untuk layanan pada pesanan ini',
        );
      }
      eligibleSubtotal = sum(eligible);
    }

    // Minimal transaksi: atas total nilai order.
    if (rule?.minTransaction && orderSubtotal.lt(rule.minTransaction)) {
      throw new BadRequestException(
        `Minimal transaksi Rp ${toNum(rule.minTransaction).toLocaleString('id-ID')}`,
      );
    }

    // Batas pemakaian per customer (hanya menghitung pemakaian yang sudah PAID).
    if (input.customerId && rule?.maxUsagePerCustomer) {
      const used = await db.promoUsage.count({
        where: { promoId: promo.id, customerId: input.customerId },
      });
      if (used >= rule.maxUsagePerCustomer) {
        throw new BadRequestException(
          'Anda sudah mencapai batas pemakaian promo ini',
        );
      }
    }

    let discount = new Prisma.Decimal(0);
    let cashback = new Prisma.Decimal(0);
    switch (promo.promoType) {
      case PromoType.PERCENTAGE:
        discount = eligibleSubtotal.mul(promo.value).div(100);
        break;
      case PromoType.FIXED_AMOUNT:
        discount = new Prisma.Decimal(promo.value);
        break;
      case PromoType.FREE_DELIVERY:
        discount = new Prisma.Decimal(input.deliveryFee ?? 0);
        break;
      case PromoType.CASHBACK:
        cashback = eligibleSubtotal.mul(promo.value).div(100);
        break;
    }

    // Cap maxDiscount untuk benefit (diskon maupun cashback).
    if (rule?.maxDiscount) {
      if (discount.gt(rule.maxDiscount)) discount = new Prisma.Decimal(rule.maxDiscount);
      if (cashback.gt(rule.maxDiscount)) cashback = new Prisma.Decimal(rule.maxDiscount);
    }
    // Diskon tidak boleh melebihi subtotal yang termasuk (kecuali gratis ongkir
    // yang sudah dibatasi nilai ongkir).
    if (
      promo.promoType !== PromoType.FREE_DELIVERY &&
      discount.gt(eligibleSubtotal)
    ) {
      discount = eligibleSubtotal;
    }

    return {
      promo,
      discount: toRupiah(discount),
      cashback: toRupiah(cashback),
      eligibleSubtotal,
    };
  }

  /**
   * Catat pemakaian promo saat order DIBAYAR (PAID). HARUS dipanggil di dalam
   * transaksi pembayaran (gateway `settlePaid` & wallet pay). Idempoten via
   * unik `idempotencyKey` cashback + guard PromoUsage. Kuota dinaikkan
   * best-effort: kalau kuota habis di titik ini, diskon yang sudah diberikan
   * tetap dihormati (uang sudah masuk).
   */
  async commitUsage(tx: PrismaTx, orderId: string): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, promo: { include: { rules: true } } },
    });
    if (!order || !order.promoId || !order.promo) return;

    // Idempoten: jangan catat dua kali untuk order yang sama.
    const existing = await tx.promoUsage.findFirst({ where: { orderId } });
    if (existing) return;

    if (order.customerId) {
      await tx.promoUsage.create({
        data: {
          promoId: order.promoId,
          customerId: order.customerId,
          orderId,
          discount: order.discountAmount,
        },
      });
    }

    await tx.promo.update({
      where: { id: order.promoId },
      data: { usedCount: { increment: 1 } },
    });

    // Cashback → kredit ke wallet customer.
    if (order.promo.promoType === PromoType.CASHBACK && order.customerId) {
      const rule = order.promo.rules[0];
      const serviceSet = parseIdCsv(rule?.applicableServices);
      const eligibleSubtotal = order.items
        .filter((it) => serviceSet.size === 0 || serviceSet.has(it.serviceId))
        .reduce((acc, it) => acc.plus(it.subtotal), new Prisma.Decimal(0));

      let cashback = eligibleSubtotal.mul(order.promo.value).div(100);
      if (rule?.maxDiscount && cashback.gt(rule.maxDiscount)) {
        cashback = new Prisma.Decimal(rule.maxDiscount);
      }
      cashback = toRupiah(cashback);

      if (cashback.gt(0)) {
        const wallet = await tx.wallet.findUnique({
          where: { customerId: order.customerId },
        });
        if (wallet) {
          // Cashback → BONUS_BALANCE (non-withdrawable), lewat satu pintu
          // WalletLedgerService (SSoT wallet_ledgers, increment atomik).
          // Sebelumnya keliru kredit ke MAIN (`balance`) via tulisan langsung —
          // itu membuat cashback bisa ditarik & tercatat di tabel berbeda (G4).
          await this.walletLedger.creditCashback({
            tx,
            walletId: wallet.id,
            amount: cashback,
            orderId,
            referenceType: 'CASHBACK',
            referenceId: order.promoId,
            description: `Cashback promo ${order.promo.code} untuk order ${order.orderNumber}`,
            idempotencyKey: `cashback-${orderId}`,
          });
        }
      }
    }
  }

  /**
   * Validasi kode promo untuk preview di checkout. `customerId` diturunkan dari
   * user login (bukan body) agar tak bisa dipalsukan.
   */
  async validatePromo(
    userId: string | undefined,
    code: string,
    opts: {
      items?: PromoEvalItem[];
      orderAmount?: number;
      outletId?: string;
      deliveryFee?: number;
    },
  ) {
    let customerId: string | undefined;
    if (userId) {
      const customer = await this.prisma.customer.findUnique({
        where: { userId },
        select: { id: true },
      });
      customerId = customer?.id;
    }

    const items: PromoEvalItem[] =
      opts.items && opts.items.length > 0
        ? opts.items
        : [{ subtotal: opts.orderAmount ?? 0 }];

    const { promo, discount, cashback } = await this.evaluatePromo({
      code,
      customerId,
      items,
      outletId: opts.outletId,
      deliveryFee: opts.deliveryFee,
    });

    return {
      promo,
      discount: toNum(discount),
      cashback: toNum(cashback),
      isValid: true,
    };
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [promos, total] = await Promise.all([
      this.prisma.promo.findMany({
        skip,
        take: limit,
        include: { rules: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promo.count(),
    ]);

    return {
      data: promos,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const promo = await this.prisma.promo.findUnique({
      where: { id },
      include: {
        rules: true,
        usages: {
          include: {
            customer: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!promo) throw new NotFoundException('Promo not found');
    return promo;
  }
}
