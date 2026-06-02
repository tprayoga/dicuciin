import { PipeTransform, Injectable } from '@nestjs/common';

/**
 * Parse query/param numerik yang OPSIONAL secara aman.
 *
 * Berbeda dengan `ParseIntPipe({ optional: true })` yang hanya melewati
 * `undefined`/`null`, pipe ini juga menangani kasus param hilang yang sudah
 * dikonversi `ValidationPipe({ transform: true })` global menjadi `''` atau
 * `NaN` (karena tipe param `number`). Tanpa ini, endpoint paginated 400 bila
 * `page`/`limit` tidak dikirim.
 *
 * Nilai hilang/tidak valid → [defaultValue] (atau `undefined` bila tak diset).
 */
@Injectable()
export class ParseOptionalIntPipe
  implements PipeTransform<unknown, number | undefined>
{
  constructor(private readonly defaultValue?: number) {}

  transform(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return this.defaultValue;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    // Param hilang → NaN (akibat transform global) → pakai default.
    if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
      return this.defaultValue;
    }
    return parsed;
  }
}
