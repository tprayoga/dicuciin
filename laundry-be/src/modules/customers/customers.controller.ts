import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CustomersService, CUSTOMER_SEGMENTS, CustomerSegment } from './customers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STAFF_ROLES, assertCustomerAccess } from '../../common/auth/access-policy';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET, UserRole.CASHIER, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create new customer/member' })
  async create(@Body() createCustomerDto: CreateCustomerDto, @Request() req: any) {
    // K1: saldo awal = kredit saldo tanpa pembayaran → aturan sama dengan
    // top-up manual (POST /wallets/customer/:id/topup): hanya SUPER_ADMIN/OWNER.
    if (
      (createCustomerDto.initialBalance ?? 0) > 0 &&
      req.user?.role !== UserRole.SUPER_ADMIN &&
      req.user?.role !== UserRole.OWNER
    ) {
      throw new ForbiddenException('Hanya Owner yang boleh mengisi saldo awal member');
    }
    return this.customersService.create(createCustomerDto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get all customers (staf)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'segment', required: false, enum: CUSTOMER_SEGMENTS })
  async findAll(
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
    @Query('search') search?: string,
    @Query('segment') segment?: string,
  ) {
    const seg = (CUSTOMER_SEGMENTS as readonly string[]).includes(segment ?? '')
      ? (segment as CustomerSegment)
      : 'all';
    return this.customersService.findAll(page, Math.min(limit ?? 10, 100), {
      search: search?.slice(0, 100),
      segment: seg,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID (pemilik atau staf)' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    await assertCustomerAccess(this.prisma, req.user, id);
    return this.customersService.findOne(id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get customer orders (pemilik atau staf)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOrders(
    @Param('id') id: string,
    @Request() req: any,
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
  ) {
    await assertCustomerAccess(this.prisma, req.user, id);
    return this.customersService.getOrders(id, page, limit);
  }

  @Get(':id/wallet')
  @ApiOperation({ summary: 'Get customer wallet (pemilik atau staf)' })
  async getWallet(@Param('id') id: string, @Request() req: any) {
    await assertCustomerAccess(this.prisma, req.user, id);
    return this.customersService.getWallet(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistik member (pemilik atau staf)' })
  async getStats(@Param('id') id: string, @Request() req: any) {
    await assertCustomerAccess(this.prisma, req.user, id);
    return this.customersService.getStats(id);
  }
}
