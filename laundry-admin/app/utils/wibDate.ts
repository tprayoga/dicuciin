/**
 * Tanggal bisnis Di.Cuciin memakai WIB (Asia/Jakarta, UTC+7, tanpa DST).
 *
 * Input `<input type="date">` memberi "YYYY-MM-DD". `new Date('YYYY-MM-DD')`
 * dibaca sebagai tengah malam UTC = 07:00 WIB, sehingga promo/banner/voucher
 * baru mulai jam 07:00 dan berakhir jam 07:00 WIB di hari terakhir. Helper ini
 * mengubah tanggal ke awal/akhir hari WIB, dan sebaliknya untuk mengisi form.
 */
const WIB_TZ = 'Asia/Jakarta'
const WIB_OFFSET = '+07:00'

/** "YYYY-MM-DD" → instan ISO pukul 00:00:00.000 WIB. */
export function wibStartOfDay(date: string): string {
  return new Date(`${date}T00:00:00.000${WIB_OFFSET}`).toISOString()
}

/** "YYYY-MM-DD" → instan ISO pukul 23:59:59.999 WIB (hari terakhir ikut berlaku). */
export function wibEndOfDay(date: string): string {
  return new Date(`${date}T23:59:59.999${WIB_OFFSET}`).toISOString()
}

/** Instan ISO → "YYYY-MM-DD" menurut kalender WIB (untuk mengisi input date). */
export function toWibInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // en-CA memformat sebagai YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: WIB_TZ })
}

/** Tanggal tampilan (id-ID) menurut kalender WIB. */
export function formatWibDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { timeZone: WIB_TZ })
}

/** Bulan berjalan "YYYY-MM" menurut WIB (bukan UTC). */
export function currentWibMonth(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: WIB_TZ }).slice(0, 7)
}
