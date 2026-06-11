import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Kolom uang disimpan sebagai Prisma.Decimal; secara default ke-serialize jadi
 * STRING di JSON ("350000"). Klien (Flutter/admin) mengharapkan number, jadi
 * konversi Decimal → number di batas response. Aman karena nilai rupiah jauh di
 * bawah Number.MAX_SAFE_INTEGER. Date/Buffer/null dibiarkan apa adanya.
 */
function serializeDecimals(value: unknown): unknown {
  if (value == null) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(serializeDecimals);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeDecimals(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((response) => {
        // Jika response sudah punya shape { data, meta } (pagination), pisahkan
        if (
          response &&
          typeof response === 'object' &&
          'data' in response &&
          'meta' in response
        ) {
          return {
            success: true,
            data: serializeDecimals(response.data) as T,
            meta: response.meta,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          data: serializeDecimals(response) as T,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
