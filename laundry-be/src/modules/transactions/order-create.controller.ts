import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  isStaff,
  scopeCheckoutIdentity,
} from "../../common/auth/access-policy";
import { CreateOrderDto } from "../orders/dto/order.dto";
import { TransactionService } from "./transaction.service";

/**
 * `POST /orders` (Batch 3) — satu pintu pembuatan order untuk app mobile (baru
 * & lama). Harga final dihitung mesin pricing tunggal (sama dengan
 * `/transactions/quote`): voucher, happy hour, harga B2B, promo, dan siklus
 * dryer. Order yang sama kemudian dibayar QRIS, VA, atau saldo.
 */
@ApiTags("Orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("orders")
export class OrderCreateController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Buat order ber-harga final (customer: hanya atas nama sendiri)",
  })
  async create(@Body() dto: CreateOrderDto, @Request() req: any) {
    const scoped = await scopeCheckoutIdentity(this.prisma, req.user, dto);
    return this.transactions.createOrder(
      {
        customerId: scoped.customerId,
        partnerId: (scoped as { partnerId?: string }).partnerId,
        outletId: scoped.outletId,
        sourcePlatform: scoped.sourcePlatform,
        items: scoped.items,
        voucherCode: scoped.voucherCode,
        promoCode: scoped.promoCode,
        deliveryFee: scoped.deliveryFee,
        notes: scoped.notes,
        customerAddressId: scoped.customerAddressId,
        // Atribusi staf hanya dari akun staf (customer tidak bisa mengisinya).
        staffUserId: isStaff(req.user) ? scoped.staffUserId : undefined,
        deviceId: scoped.deviceId,
        deviceCode: scoped.deviceCode,
        scheduledAt: scoped.scheduledAt,
      },
      req.user.userId,
    );
  }
}
