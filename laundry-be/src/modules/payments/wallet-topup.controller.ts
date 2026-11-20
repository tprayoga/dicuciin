import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { WalletTopupDto } from "./dto/payment.dto";
import { WalletTopupService } from "./wallet-topup.service";

/**
 * Batch 4 — top-up saldo milik SENDIRI (customer dari JWT, tidak pernah dari
 * body/URL). Saldo bertambah hanya setelah pelunasan Midtrans terverifikasi.
 */
@ApiTags("Wallets — Top-up")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller("wallets/me")
export class WalletTopupController {
  constructor(
    private readonly topups: WalletTopupService,
    private readonly config: ConfigService,
  ) {}

  @Post("topup")
  @ApiOperation({
    summary: "Buat tagihan top-up QRIS/VA (nominal divalidasi server)",
  })
  create(@Body() dto: WalletTopupDto, @Request() req: any) {
    return this.topups.requestTopup(req.user.userId, dto);
  }

  @Get("topups")
  @ApiOperation({ summary: "Riwayat top-up" })
  list(@Request() req: any) {
    return this.topups.list(req.user.userId);
  }

  @Get("topups/:topupNumber")
  @ApiOperation({
    summary: "Status top-up (diverifikasi ke provider bila lewat batas waktu)",
  })
  status(@Param("topupNumber") n: string, @Request() req: any) {
    return this.topups.getStatus(req.user.userId, n);
  }

  @Post("topups/:topupNumber/cancel")
  @ApiOperation({ summary: "Batalkan top-up yang belum dibayar" })
  cancel(@Param("topupNumber") n: string, @Request() req: any) {
    return this.topups.cancel(req.user.userId, n);
  }

  @Post("topups/:topupNumber/simulate")
  @ApiOperation({ summary: "[DEV] Simulasikan pelunasan (hanya gateway mock)" })
  simulate(@Param("topupNumber") n: string, @Request() req: any) {
    if (this.config.get<string>("APP_ENV", "development") === "production") {
      throw new ForbiddenException("Tidak tersedia di produksi");
    }
    return this.topups.simulatePaid(req.user.userId, n);
  }
}
