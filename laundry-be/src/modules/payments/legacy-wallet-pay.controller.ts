import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { assertCustomerAccess } from "../../common/auth/access-policy";
import { LegacyPayWithWalletDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

/**
 * Rute lama `POST /wallets/customer/:customerId/pay` — dipakai aplikasi mobile
 * versi lama (sebelum Batch 1). Batch 1.5: dialihkan ke jalur bayar-saldo
 * tunggal (`PaymentsService.payOrderWithWalletForCustomer`) sehingga:
 * - order dikunci & tagihan QRIS/VA aktif mencegah bayar dobel;
 * - booking mesin HOLD → RESERVED (dulu tertinggal HOLD lalu kedaluwarsa);
 * - nominal = total order dari server (`amount` klien diabaikan).
 * Bentuk respons lama dipertahankan: `{ wallet: { balance }, order, payment }`.
 */
@ApiTags("Wallets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("wallets")
export class LegacyWalletPayController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("customer/:customerId/pay")
  @ApiOperation({
    summary:
      "[Kompatibilitas app lama] Bayar order dengan saldo (nominal = total order)",
  })
  async pay(
    @Param("customerId") customerId: string,
    @Body() dto: LegacyPayWithWalletDto,
    @Request() req: any,
  ) {
    await assertCustomerAccess(this.prisma, req.user, customerId);
    const result = await this.payments.payOrderWithWalletForCustomer(
      customerId,
      dto.orderId,
    );
    const [wallet, payment] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { customerId } }),
      this.prisma.payment.findUnique({
        where: { paymentNumber: `PAY-${result.orderNumber}` },
      }),
    ]);
    return {
      wallet,
      payment,
      order: {
        id: result.orderId,
        orderNumber: result.orderNumber,
        status: result.status,
      },
      amount: result.amount,
    };
  }
}
