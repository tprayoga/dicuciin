import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ReconciliationReason,
  ReconciliationStatus,
  RefundMethod,
  UserRole,
} from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  ADMIN_ROLES,
  resolveOutletScope,
} from "../../common/auth/access-policy";
import {
  ExecuteRefundDto,
  RefundRequestDto,
  ReviewReconciliationDto,
} from "./dto/payment.dto";
import { ReconciliationService } from "./reconciliation.service";

/** Hanya administrator yang boleh menyetujui & mengeksekusi refund. */
const REFUND_APPROVERS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER];

@ApiTags("Payments — Rekonsiliasi & Refund")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("payments")
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("refund-requests")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary: "Customer mengajukan refund order miliknya (belum dieksekusi)",
  })
  request(@Body() dto: RefundRequestDto, @Request() req: any) {
    return this.reconciliation.requestRefund(
      req.user.userId,
      dto.orderId,
      dto.reason,
    );
  }

  @Get("refund-requests/mine")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "Status permintaan refund milik customer" })
  mine(@Request() req: any) {
    return this.reconciliation.listMine(req.user.userId);
  }

  @Get("reconciliations")
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: "Daftar dana yang perlu ditinjau/refund (admin, lingkup outlet)",
  })
  @ApiQuery({ name: "status", required: false, enum: ReconciliationStatus })
  @ApiQuery({ name: "reason", required: false, enum: ReconciliationReason })
  @ApiQuery({ name: "outletId", required: false })
  async list(
    @Request() req: any,
    @Query("status") status?: ReconciliationStatus,
    @Query("reason") reason?: ReconciliationReason,
    @Query("outletId") outletId?: string,
  ) {
    const outletScope = await resolveOutletScope(
      this.prisma,
      req.user,
      outletId,
    );
    return this.reconciliation.list({ status, reason, outletScope });
  }

  @Get("reconciliations/:id/history")
  @Roles(...REFUND_APPROVERS)
  @ApiOperation({ summary: "Jejak audit rekonsiliasi" })
  history(@Param("id") id: string) {
    return this.reconciliation.history(id);
  }

  @Post("reconciliations/:id/review")
  @Roles(...REFUND_APPROVERS)
  @ApiOperation({ summary: "Setujui / tolak / tutup (SUPER_ADMIN, OWNER)" })
  review(
    @Param("id") id: string,
    @Body() dto: ReviewReconciliationDto,
    @Request() req: any,
  ) {
    return this.reconciliation.review(
      id,
      req.user.userId,
      dto.decision,
      dto.note,
    );
  }

  @Post("reconciliations/:id/execute")
  @Roles(...REFUND_APPROVERS)
  @ApiOperation({
    summary:
      "Eksekusi refund yang disetujui — tepat sekali (SUPER_ADMIN, OWNER)",
  })
  execute(
    @Param("id") id: string,
    @Body() dto: ExecuteRefundDto,
    @Request() req: any,
  ) {
    return this.reconciliation.execute(
      id,
      req.user.userId,
      dto.method as RefundMethod,
      dto.reference,
      dto.note,
    );
  }
}
