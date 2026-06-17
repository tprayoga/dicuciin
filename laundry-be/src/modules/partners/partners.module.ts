import { Module } from '@nestjs/common';
import { B2BPartnerService } from './b2b-partner.service';
import { PartnersController } from './partners.controller';

@Module({
  controllers: [PartnersController],
  providers: [B2BPartnerService],
  exports: [B2BPartnerService],
})
export class PartnersModule {}
