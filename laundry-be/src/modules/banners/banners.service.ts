import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { BannerPlacement, Prisma } from '@prisma/client';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateBannerDto) {
    return this.prisma.appBanner.create({
      data: {
        ...dto,
        promoId: dto.promoId || null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  /** Semua banner (admin) — opsional filter placement. */
  findAll(placement?: BannerPlacement) {
    return this.prisma.appBanner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { promo: { select: { code: true, name: true, bannerUrl: true } } },
    });
  }

  /** Banner aktif & dalam periode untuk ditampilkan di app (publik). */
  findActive(placement?: BannerPlacement) {
    const now = new Date();
    return this.prisma.appBanner.findMany({
      where: {
        isActive: true,
        ...(placement ? { placement } : {}),
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { promo: { select: { code: true, name: true, bannerUrl: true } } },
    });
  }

  async findOne(id: string) {
    const banner = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    const { promoId, ...rest } = dto;
    const data: Prisma.AppBannerUncheckedUpdateInput = { ...rest };
    if (promoId !== undefined) data.promoId = promoId || null;
    if (dto.startDate !== undefined) {
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    return this.prisma.appBanner.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appBanner.delete({ where: { id } });
    return { message: 'Banner berhasil dihapus' };
  }
}
