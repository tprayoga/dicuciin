import { BadRequestException } from '@nestjs/common';
import {
  assertWithinOperatingHours,
  isWithinOperatingHours,
  localMinutes,
  parseHm,
} from './operating-hours';

/** Waktu WIB (UTC+7) → Date. */
const wib = (hhmm: string, day = '2026-11-24') => new Date(`${day}T${hhmm}:00+07:00`);

describe('operating-hours (Batch 6 — T8)', () => {
  it('parseHm', () => {
    expect(parseHm('07:00')).toBe(420);
    expect(parseHm('7:30')).toBe(450);
    expect(parseHm('24:00')).toBe(1440);
    expect(parseHm('25:00')).toBeNull();
    expect(parseHm('07:60')).toBeNull();
    expect(parseHm('jam 7')).toBeNull();
    expect(parseHm(null)).toBeNull();
  });

  it('localMinutes memakai WIB', () => {
    expect(localMinutes(wib('21:15'), 420)).toBe(21 * 60 + 15);
    expect(localMinutes(new Date('2026-11-24T23:30:00Z'), 420)).toBe(6 * 60 + 30);
  });

  it('jam biasa 07:00–22:00: batas bawah inklusif, batas atas eksklusif', () => {
    const h = { openTime: '07:00', closeTime: '22:00' };
    expect(isWithinOperatingHours(h, wib('06:59'))).toBe(false);
    expect(isWithinOperatingHours(h, wib('07:00'))).toBe(true);
    expect(isWithinOperatingHours(h, wib('21:59'))).toBe(true);
    expect(isWithinOperatingHours(h, wib('22:00'))).toBe(false);
    expect(isWithinOperatingHours(h, wib('23:30'))).toBe(false);
  });

  it('lewat tengah malam 20:00–02:00', () => {
    const h = { openTime: '20:00', closeTime: '02:00' };
    expect(isWithinOperatingHours(h, wib('19:59'))).toBe(false);
    expect(isWithinOperatingHours(h, wib('23:00'))).toBe(true);
    expect(isWithinOperatingHours(h, wib('01:59'))).toBe(true);
    expect(isWithinOperatingHours(h, wib('02:00'))).toBe(false);
  });

  it('24 jam & data kosong/tidak valid → tanpa batasan', () => {
    expect(isWithinOperatingHours({ openTime: '00:00', closeTime: '00:00' }, wib('03:00'))).toBe(true);
    expect(isWithinOperatingHours({ openTime: '00:00', closeTime: '24:00' }, wib('03:00'))).toBe(true);
    expect(isWithinOperatingHours({ openTime: null, closeTime: null }, wib('03:00'))).toBe(true);
    expect(isWithinOperatingHours({ openTime: 'pagi', closeTime: '22:00' }, wib('03:00'))).toBe(true);
  });

  it('assert melempar 400 dengan jam outlet di pesan', () => {
    expect(() => assertWithinOperatingHours({ openTime: '07:00', closeTime: '22:00' }, wib('22:30'))).toThrow(
      BadRequestException,
    );
    expect(() => assertWithinOperatingHours({ openTime: '07:00', closeTime: '22:00' }, wib('22:30'))).toThrow(
      /07:00–22:00/,
    );
  });
});
