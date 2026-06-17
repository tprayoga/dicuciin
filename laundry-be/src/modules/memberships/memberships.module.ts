import { Module } from '@nestjs/common';
import { PartnersModule } from '../partners/partners.module';
import { MembershipTierService } from './membership-tier.service';
import { MembershipsController } from './memberships.controller';

@Module({
  imports: [PartnersModule],
  controllers: [MembershipsController],
  providers: [MembershipTierService],
  exports: [MembershipTierService],
})
export class MembershipsModule {}
