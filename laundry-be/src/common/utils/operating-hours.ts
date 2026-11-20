import { BadRequestException } from '@nestjs/common';

/**
 * Jam operasional outlet (Batch 6 — T8).
 *
 * `outlets.openTime` / `closeTime` berformat "HH:mm" dalam zona waktu outlet
 * (default WIB, UTC+7 — `OUTLET_TZ_OFFSET_MINUTES`). Aturan:
 *   - jam kosong / tidak valid → tanpa batasan (perilaku lama);
 *   - open == close → buka 24 jam;
 *   - close < open → lewat tengah malam (mis. 20:00–02:00).
 * Waktu mulai booking harus berada di [open, close).
 */
export interface OutletHours {
  openTime?: string | null;
  closeTime?: string | null;
}

export function tzOffsetMinutes(): number {
  const raw = parseInt(process.env.OUTLET_TZ_OFFSET_MINUTES ?? '', 10);
  return Number.isFinite(raw) && raw >= -720 && raw <= 840 ? raw : 420;
}

export function parseHm(value?: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Menit sejak tengah malam waktu lokal outlet. */
export function localMinutes(date: Date, offset = tzOffsetMinutes()): number {
  const shifted = new Date(date.getTime() + offset * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Jam valid? (null bila outlet tidak punya jam yang valid → tanpa batasan) */
export function normalizedHours(hours: OutletHours): { open: number; close: number } | null {
  const open = parseHm(hours.openTime);
  const close = parseHm(hours.closeTime);
  if (open === null || close === null) return null;
  return { open, close: close === 24 * 60 ? 24 * 60 : close };
}

export function isWithinOperatingHours(hours: OutletHours, date: Date, offset = tzOffsetMinutes()): boolean {
  const h = normalizedHours(hours);
  if (!h) return true;
  if (h.open === h.close || (h.open === 0 && h.close === 24 * 60)) return true;
  const m = localMinutes(date, offset);
  return h.open < h.close ? m >= h.open && m < h.close : m >= h.open || m < h.close;
}

export function formatHours(hours: OutletHours): string {
  const h = normalizedHours(hours);
  if (!h) return 'tanpa batas jam';
  if (h.open === h.close) return '24 jam';
  return `${hours.openTime}–${hours.closeTime}`;
}

export function assertWithinOperatingHours(hours: OutletHours, date: Date): void {
  if (!isWithinOperatingHours(hours, date)) {
    throw new BadRequestException(
      `Jadwal di luar jam operasional outlet (${formatHours(hours)} WIB). Pilih jam lain.`,
    );
  }
}
