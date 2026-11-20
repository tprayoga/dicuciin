/**
 * Normalisasi nomor HP Indonesia (Batch 5 — T6).
 *
 * Bentuk kanonik: `628…` (digit saja, tanpa `+`, tanpa `0` di depan).
 *   "0812-3456-7890"  → "6281234567890"
 *   "+62 812 3456 7890" → "6281234567890"
 *   "81234567890"     → "6281234567890"
 *
 * Data lama di `users.phone` bisa tersimpan dalam bentuk apa pun (`08…`,
 * `+628…`, `628…`). Pencarian memakai `phoneCandidates()` agar akun lama tetap
 * bisa login sebelum datanya dinormalisasi (lihat scripts/normalize-user-phones.ts).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Hanya digit, spasi, tanda baca umum, dan satu '+' di depan.
  if (!/^\+?[0-9\s\-().]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  // Nomor seluler Indonesia: 62 8xx, total 10–15 digit.
  if (!/^628\d{7,12}$/.test(digits)) return null;
  return digits;
}

/** True bila string tampak seperti nomor HP (bukan email/username). */
export function looksLikePhone(input: string | null | undefined): boolean {
  if (!input) return false;
  return /^\+?[0-9\s\-().]{8,20}$/.test(input.trim());
}

/**
 * Semua bentuk penyimpanan yang mungkin untuk satu nomor (kanonik dulu), untuk
 * mencocokkan data lama. Kosong bila nomor tidak valid.
 */
export function phoneCandidates(input: string | null | undefined): string[] {
  const canonical = normalizePhone(input);
  if (!canonical) return [];
  const local = `0${canonical.slice(2)}`;
  const set = new Set<string>([canonical, local, `+${canonical}`, canonical.slice(2)]);
  const raw = input?.trim();
  if (raw) set.add(raw);
  return [...set];
}
