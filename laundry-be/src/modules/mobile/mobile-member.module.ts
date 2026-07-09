import { Module } from '@nestjs/common';
import { MobileMemberController } from './mobile-member.controller';
import { MobileMemberService } from './mobile-member.service';

@Module({
  controllers: [MobileMemberController],
  providers: [MobileMemberService],
})
export class MobileMemberModule {}
