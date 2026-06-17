import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { MembershipTierService } from './membership-tier.service';
import { UpsertB2BTierDto, UpsertMembershipTierDto } from './dto/membership.dto';

@ApiTags('Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('memberships')
export class MembershipsController {
  constructor(
    private readonly membershipTierService: MembershipTierService,
    private readonly b2bPartnerService: B2BPartnerService,
  ) {}

  @Get('tiers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Daftar tier membership retail' })
  async listRetailTiers() {
    return this.membershipTierService.listTiers();
  }

  @Post('tiers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Upsert tier membership retail' })
  async upsertRetailTier(@Body() dto: UpsertMembershipTierDto) {
    const { tier, ...data } = dto;
    return this.membershipTierService.upsertTier(
      tier,
      data as Prisma.MembershipTierConfigCreateInput,
    );
  }

  @Get('b2b-tiers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Daftar tier partner B2B' })
  async listB2BTiers() {
    return this.b2bPartnerService.listTiers();
  }

  @Post('b2b-tiers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Upsert tier partner B2B' })
  async upsertB2BTier(@Body() dto: UpsertB2BTierDto) {
    const { tier, ...data } = dto;
    return this.b2bPartnerService.upsertTier(
      tier,
      data as Prisma.B2BPartnerTierConfigCreateInput,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Status tier user login' })
  async me(@Request() req: any) {
    return this.membershipTierService.getStatusByUser(req.user?.userId);
  }
}
