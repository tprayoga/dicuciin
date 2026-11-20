import {
  Min, IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

class OrderItemDto {
  @ApiProperty()
  @IsString()
  serviceId: string;

  @ApiProperty({ description: 'Dryer: 1–3 siklus; mesin cuci: 1 (divalidasi server)' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  machineType?: string;
}

export class CreateOrderDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, description: 'Nomor HP/email/member code customer untuk kiosk' })
  @IsString()
  @IsOptional()
  customerLookup?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerAddressId?: string;

  @ApiProperty()
  @IsString()
  outletId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  kioskId?: string;

  @ApiProperty({ required: false, description: 'Staff yang membuat order (kiosk/kasir)' })
  @IsString()
  @IsOptional()
  staffUserId?: string;

  @ApiProperty()
  @IsString()
  sourcePlatform: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  deliveryFee?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  promoCode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  // ── Booking mesin (Fase 1 Batch 1): order + booking HOLD dibuat atomik ──
  @ApiProperty({ required: false, description: 'Mesin yang dipesan (alur booking)' })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Kode mesin (alternatif deviceId)' })
  @IsString()
  @IsOptional()
  deviceCode?: string;

  @ApiProperty({ required: false, description: 'Jadwal pemakaian (ISO 8601); kosong = sekarang' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiProperty({
    required: false,
    description: 'Batch 3: kode voucher — diterapkan ke harga order untuk SEMUA metode bayar',
  })
  @IsString()
  @IsOptional()
  voucherCode?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  cancelReason: string;
}
