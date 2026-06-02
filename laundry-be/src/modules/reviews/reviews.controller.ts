import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, SetReviewFocusDto } from './dto/review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, ReviewSource } from '@prisma/client';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Buat ulasan/feedback (app & kiosk)' })
  async create(@Body() dto: CreateReviewDto, @Request() req: any) {
    return this.reviewsService.create(dto, req.user?.userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Daftar ulasan (admin) + filter' })
  @ApiQuery({ name: 'rating', required: false, type: Number })
  @ApiQuery({ name: 'isFocused', required: false, type: Boolean })
  @ApiQuery({ name: 'source', required: false, enum: ReviewSource })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('rating', new ParseIntPipe({ optional: true })) rating?: number,
    @Query('isFocused') isFocused?: string,
    @Query('source') source?: ReviewSource,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.reviewsService.findAll({
      rating,
      isFocused: isFocused === undefined ? undefined : isFocused === 'true',
      source,
      page,
      limit,
    });
  }

  @Get('focused')
  @ApiOperation({ summary: 'Ulasan pilihan (dikurasi) untuk ditampilkan di app' })
  async findFocused() {
    return this.reviewsService.findFocused();
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Ringkasan rating (rata-rata, total, distribusi)' })
  async stats() {
    return this.reviewsService.stats();
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Ambil ulasan berdasarkan order (cek sudah diulas)' })
  async findByOrder(@Param('orderId') orderId: string) {
    return this.reviewsService.findByOrder(orderId);
  }

  @Patch(':id/focus')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET)
  @ApiOperation({ summary: 'Tandai/lepas ulasan sebagai fokus (kurasi)' })
  async setFocus(@Param('id') id: string, @Body() dto: SetReviewFocusDto) {
    return this.reviewsService.setFocus(id, dto.isFocused);
  }
}
