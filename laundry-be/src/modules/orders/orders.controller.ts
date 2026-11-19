import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto, CancelOrderDto } from './dto/order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  STAFF_ROLES,
  assertOrderAccess,
  resolveOutletScope,
  scopeCheckoutIdentity,
} from '../../common/auth/access-policy';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create new order (customer: hanya atas nama sendiri)' })
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
    const dto = await scopeCheckoutIdentity(this.prisma, req.user, createOrderDto);
    return this.ordersService.create(dto, req.user.userId);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get all orders (staf; non-owner hanya outlet yang ditugaskan)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async findAll(
    @Request() req: any,
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('outletId') outletId?: string,
  ) {
    const scope = await resolveOutletScope(this.prisma, req.user, outletId);
    return this.ordersService.findAll(page, limit, status, undefined, scope);
  }

  @Get('summary/dashboard')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get dashboard summary metrics (staf; terlingkup outlet)' })
  async getDashboardSummary(@Request() req: any, @Query('outletId') outletId?: string) {
    const scope = await resolveOutletScope(this.prisma, req.user, outletId);
    return this.ordersService.getDashboardSummary(scope);
  }

  @Get('summary/finance')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Ringkasan transaksi per bulan/outlet (owner: global; staf: hanya outlet yang ditugaskan)',
  })
  @ApiQuery({ name: 'month', required: false, type: String, example: '2026-05' })
  @ApiQuery({ name: 'outletId', required: false, type: String })
  async getFinanceSummary(
    @Request() req: any,
    @Query('month') month?: string,
    @Query('outletId') outletId?: string,
  ) {
    // Owner/super admin: global (atau outlet yang dipilih). Staf lain: hanya
    // gabungan outlet yang ditugaskan — tidak pernah global.
    const scope = await resolveOutletScope(this.prisma, req.user, outletId);
    return this.ordersService.getFinanceSummary(month, undefined, scope);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID (pemilik atau staf)' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    await assertOrderAccess(this.prisma, req.user, id);
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Update status proses order (staf; PAID/REFUNDED tidak bisa manual)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {
    await assertOrderAccess(this.prisma, req.user, id);
    return this.ordersService.updateStatus(id, updateOrderStatusDto, req.user.userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order (customer: hanya miliknya yang belum dibayar)' })
  async cancel(@Param('id') id: string, @Body() cancelOrderDto: CancelOrderDto, @Request() req: any) {
    await assertOrderAccess(this.prisma, req.user, id);
    return this.ordersService.cancel(id, cancelOrderDto, req.user.userId, req.user);
  }
}
