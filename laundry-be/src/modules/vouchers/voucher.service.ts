import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  UserSegment,
  VoucherStatus,
  VoucherType,
  MembershipTier,
  B2BPartnerTier,
} from '@prisma/client';
import { toNum } from '../../common/utils/money.util';
import {
  CreateVoucherTemplateDto,
  UpdateVoucherTemplateDto,
} from './dto/voucher.dto';

type PrismaTx = Prisma.TransactionClient;

export interface VoucherEvalItem {
  serviceId?: string;
  subtotal: Prisma.Decimal.Value;
}

export interface ValidateVoucherInput {
  code: string;
  segment: UserSegment;
  items: VoucherEvalItem[];
  tier?: MembershipTier | null;
  b2bTier?: B2BPartnerTier | null;
  outletId?: string;
  ownerCustomerId?: string;
  ownerPartnerId?: string;
}

export interface IssueVoucherInput {
  templateId: string;
  customerId?: string;
  partnerId?: string;
  sourceType?: string;
  sourceId?: string;
  tx?: PrismaTx;
}

const toRupiah = (v: Prisma.Decimal): Prisma.Decimal =>
  v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

const parseIdCsv = (csv?: string | null): Set<string> =>
  new Set(
    (csv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

/**
 * Voucher engine: template (definisi), user voucher (instance milik pemilik), dan
 * redemption (audit). Aturan utama (keputusan 5 & lainnya):
 * - 1 voucher per transaksi (non-stackable) → ditegakkan di pemakaian + DB unique.
 * - Voucher harus ACTIVE & belum kedaluwarsa.
 * - Voucher harus sesuai segment (RETAIL/B2B) pemilik.
 * - Voucher harus sesuai tier bila ada tier restriction.
 */
@Injectable()
export class VoucherService {
  constructor(private prisma: PrismaService) {}

  // --- Template (admin) ---

  mapTemplateDto(
    dto: CreateVoucherTemplateDto | UpdateVoucherTemplateDto,
  ): Prisma.VoucherTemplateCreateInput {
    return {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      isStackable: false,
    } as Prisma.VoucherTemplateCreateInput;
  }

  async createTemplate(data: Prisma.VoucherTemplateCreateInput) {
    const existing = await this.prisma.voucherTemplate.findUnique({
      where: { code: data.code },
    });
    if (existing) throw new BadRequestException('Kode template voucher sudah ada');
    return this.prisma.voucherTemplate.create({ data });
  }

  async updateTemplate(id: string, data: Prisma.VoucherTemplateUpdateInput) {
    const template = await this.prisma.voucherTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template voucher tidak ditemukan');
    return this.prisma.voucherTemplate.update({ where: { id }, data });
  }

  async listTemplates(segment?: UserSegment) {
    return this.prisma.voucherTemplate.findMany({
      where: segment ? { segment } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async listIssued(status?: VoucherStatus, segment?: UserSegment) {
    return this.prisma.userVoucher.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(segment ? { segment } : {}),
      },
      include: {
        template: true,
        customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
        partner: { select: { companyName: true, partnerCode: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async listRedemptions() {
    return this.prisma.voucherRedemption.findMany({
      include: {
        userVoucher: { include: { template: true } },
        order: { select: { orderNumber: true, totalAmount: true, orderDate: true } },
      },
      orderBy: { redeemedAt: 'desc' },
      take: 200,
    });
  }

  /** Terbitkan voucher ke pemilik (dari campaign/referral/tier/manual). */
  async issue(input: IssueVoucherInput) {
    const db = input.tx ?? this.prisma;
    if (!input.customerId && !input.partnerId) {
      throw new BadRequestException('Pemilik voucher (customer/partner) wajib diisi');
    }

    const template = await db.voucherTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template) throw new NotFoundException('Template voucher tidak ditemukan');
    if (!template.isActive) throw new BadRequestException('Template voucher tidak aktif');
    if (template.quota != null && template.issuedCount >= template.quota) {
      throw new BadRequestException('Kuota penerbitan voucher sudah habis');
    }

    const expiresAt =
      template.endDate ??
      (template.validityDays
        ? new Date(Date.now() + template.validityDays * 86_400_000)
        : null);

    const userVoucher = await db.userVoucher.create({
      data: {
        templateId: template.id,
        customerId: input.customerId,
        partnerId: input.partnerId,
        segment: template.segment,
        code: `${template.code}-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: VoucherStatus.ACTIVE,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        expiresAt,
      },
    });

    await db.voucherTemplate.update({
      where: { id: template.id },
      data: { issuedCount: { increment: 1 } },
    });

    return userVoucher;
  }

  /** Voucher milik seorang pemilik. */
  async listForOwner(owner: { customerId?: string; partnerId?: string }, status?: VoucherStatus) {
    return this.prisma.userVoucher.findMany({
      where: {
        ...(owner.customerId ? { customerId: owner.customerId } : {}),
        ...(owner.partnerId ? { partnerId: owner.partnerId } : {}),
        ...(status ? { status } : {}),
      },
      include: { template: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async listForUser(userId: string, status?: VoucherStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, b2bPartner: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return this.listForOwner(
      {
        customerId: user.customer?.id,
        partnerId: user.b2bPartner?.id,
      },
      status,
    );
  }

  /**
   * Validasi + hitung diskon voucher. Melempar error bila tidak valid. Tidak
   * mengubah status (status diubah saat `redeem` ketika order dibayar).
   */
  async validate(input: ValidateVoucherInput) {
    const db = this.prisma;
    const userVoucher = await db.userVoucher.findUnique({
      where: { code: input.code },
      include: { template: true },
    });
    if (!userVoucher) throw new NotFoundException('Voucher tidak ditemukan');

    // Kepemilikan (bila konteks pemilik diberikan).
    if (
      (input.ownerCustomerId && userVoucher.customerId !== input.ownerCustomerId) ||
      (input.ownerPartnerId && userVoucher.partnerId !== input.ownerPartnerId)
    ) {
      throw new ForbiddenException('Voucher bukan milik Anda');
    }

    // Harus aktif & belum dipakai/dibatalkan.
    if (userVoucher.status !== VoucherStatus.ACTIVE) {
      throw new BadRequestException(
        `Voucher tidak bisa dipakai (status ${userVoucher.status})`,
      );
    }

    // Belum kedaluwarsa.
    if (userVoucher.expiresAt && new Date() > userVoucher.expiresAt) {
      throw new BadRequestException('Voucher sudah kedaluwarsa');
    }

    const template = userVoucher.template;
    if (!template.isActive) throw new BadRequestException('Voucher tidak aktif');

    // Segment: RETAIL tidak bisa pakai voucher B2B, dan sebaliknya.
    if (userVoucher.segment !== input.segment) {
      throw new BadRequestException(
        `Voucher ini khusus segmen ${userVoucher.segment}`,
      );
    }

    // Batasan tier.
    if (template.tierRestriction && input.tier !== template.tierRestriction) {
      throw new BadRequestException(
        `Voucher khusus tier ${template.tierRestriction}`,
      );
    }
    if (template.b2bTierRestriction && input.b2bTier !== template.b2bTierRestriction) {
      throw new BadRequestException(
        `Voucher khusus tier ${template.b2bTierRestriction}`,
      );
    }

    const sum = (items: VoucherEvalItem[]) =>
      items.reduce((acc, it) => acc.plus(it.subtotal), new Prisma.Decimal(0));
    const orderSubtotal = sum(input.items);

    // Batasan outlet.
    const outletSet = parseIdCsv(template.applicableOutlets);
    if (outletSet.size > 0 && (!input.outletId || !outletSet.has(input.outletId))) {
      throw new BadRequestException('Voucher tidak berlaku di outlet ini');
    }

    // Batasan layanan → subtotal yang termasuk.
    let eligibleSubtotal = orderSubtotal;
    const serviceSet = parseIdCsv(template.applicableServices);
    if (serviceSet.size > 0) {
      const eligible = input.items.filter(
        (it) => it.serviceId && serviceSet.has(it.serviceId),
      );
      if (eligible.length === 0) {
        throw new BadRequestException(
          'Voucher tidak berlaku untuk layanan pada pesanan ini',
        );
      }
      eligibleSubtotal = sum(eligible);
    }

    // Minimal transaksi.
    if (template.minTransaction && orderSubtotal.lt(template.minTransaction)) {
      throw new BadRequestException(
        `Minimal transaksi Rp ${toNum(template.minTransaction).toLocaleString('id-ID')}`,
      );
    }

    const discount = this.computeDiscount(template, eligibleSubtotal);

    return { userVoucher, template, discount, eligibleSubtotal };
  }

  /** Hitung diskon menurut tipe voucher. */
  private computeDiscount(
    template: { voucherType: VoucherType; value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null },
    eligibleSubtotal: Prisma.Decimal,
  ): Prisma.Decimal {
    let discount = new Prisma.Decimal(0);
    switch (template.voucherType) {
      case VoucherType.PERCENTAGE_DISCOUNT:
        discount = eligibleSubtotal.mul(template.value).div(100);
        break;
      case VoucherType.NOMINAL_DISCOUNT:
      case VoucherType.TIER_EXCLUSIVE:
      case VoucherType.B2B_EXCLUSIVE:
        discount = new Prisma.Decimal(template.value);
        break;
      case VoucherType.FREE_WASH:
      case VoucherType.FREE_DRY:
      case VoucherType.FREE_WASH_DRY:
        // Gratis layanan: potongan = subtotal layanan yang termasuk.
        discount = eligibleSubtotal;
        break;
      case VoucherType.LOTTERY_TICKET:
        // Tiket undian: bukan potongan harga.
        discount = new Prisma.Decimal(0);
        break;
    }
    if (template.maxDiscount && discount.gt(template.maxDiscount)) {
      discount = new Prisma.Decimal(template.maxDiscount);
    }
    if (discount.gt(eligibleSubtotal)) discount = eligibleSubtotal;
    return toRupiah(discount);
  }

  /**
   * Tandai voucher USED + catat redemption saat order DIBAYAR. Harus dipanggil
   * dalam transaksi pembayaran. `orderId` unik di `voucher_redemptions` →
   * satu voucher per transaksi (keputusan 5). Idempoten via guard redemption.
   */
  async redeem(
    tx: PrismaTx,
    input: {
      userVoucherId: string;
      orderId: string;
      customerId?: string;
      partnerId?: string;
      discountApplied: Prisma.Decimal.Value;
    },
  ) {
    const existing = await tx.voucherRedemption.findFirst({
      where: { orderId: input.orderId },
    });
    if (existing) return existing; // idempoten

    const voucher = await tx.userVoucher.findUnique({
      where: { id: input.userVoucherId },
    });
    if (!voucher) throw new NotFoundException('Voucher tidak ditemukan');
    if (voucher.status !== VoucherStatus.ACTIVE) {
      throw new BadRequestException('Voucher sudah tidak aktif');
    }

    await tx.userVoucher.update({
      where: { id: voucher.id },
      data: { status: VoucherStatus.USED, usedAt: new Date() },
    });

    return tx.voucherRedemption.create({
      data: {
        userVoucherId: voucher.id,
        orderId: input.orderId,
        customerId: input.customerId,
        partnerId: input.partnerId,
        discountApplied: new Prisma.Decimal(input.discountApplied),
        status: 'APPLIED',
      },
    });
  }

  /**
   * Balikkan redemption saat order di-refund (keputusan 10): voucher kembali
   * ACTIVE bila belum kedaluwarsa, redemption ditandai REVERSED.
   */
  async reverseRedemption(tx: PrismaTx, orderId: string) {
    const redemption = await tx.voucherRedemption.findFirst({
      where: { orderId, status: 'APPLIED' },
      include: { userVoucher: true },
    });
    if (!redemption) return;

    await tx.voucherRedemption.update({
      where: { id: redemption.id },
      data: { status: 'REVERSED', reversedAt: new Date() },
    });

    const stillValid =
      !redemption.userVoucher.expiresAt ||
      new Date() <= redemption.userVoucher.expiresAt;
    await tx.userVoucher.update({
      where: { id: redemption.userVoucherId },
      data: {
        status: stillValid ? VoucherStatus.ACTIVE : VoucherStatus.EXPIRED,
        usedAt: null,
      },
    });
  }
}
