import { looksLikePhone, normalizePhone, phoneCandidates } from './phone.util';

describe('phone.util (Batch 5 — T6)', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['0812-3456-7890', '6281234567890'],
    ['+62 812 3456 7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
    ['(0812) 3456.7890', '6281234567890'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    '12345678', // bukan nomor seluler Indonesia
    '0212345678', // telepon rumah
    '+1 415 555 0100',
    'abc0812345678',
    '08123', // terlalu pendek
    '0812345678901234', // terlalu panjang
    'x@y.z',
  ])('tidak valid: %p → null', (input) => {
    expect(normalizePhone(input as any)).toBeNull();
  });

  it('kandidat mencakup semua format penyimpanan lama, kanonik lebih dulu', () => {
    expect(phoneCandidates('0812-3456-7890')).toEqual([
      '6281234567890',
      '081234567890',
      '+6281234567890',
      '81234567890',
      '0812-3456-7890',
    ]);
    expect(phoneCandidates('bukan nomor')).toEqual([]);
  });

  it('looksLikePhone membedakan nomor dari email/username', () => {
    expect(looksLikePhone('+62 812 3456 7890')).toBe(true);
    expect(looksLikePhone('budi@uji.test')).toBe(false);
    expect(looksLikePhone('budi')).toBe(false);
  });
});
