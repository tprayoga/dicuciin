import { Prisma } from '@prisma/client';
import { D, money, toNum } from './money.util';

describe('money.util', () => {
  describe('toNum', () => {
    it('mengembalikan 0 untuk null/undefined', () => {
      expect(toNum(null)).toBe(0);
      expect(toNum(undefined)).toBe(0);
    });

    it('meneruskan number apa adanya', () => {
      expect(toNum(1500)).toBe(1500);
    });

    it('mengonversi Prisma.Decimal ke number', () => {
      expect(toNum(new Prisma.Decimal('68400.00'))).toBe(68400);
    });
  });

  describe('D & money', () => {
    it('aritmatika Decimal tetap eksak (tanpa drift float)', () => {
      // 0.1 + 0.2 di float = 0.30000000000000004
      const sum = D('0.1').plus('0.2');
      expect(sum.toString()).toBe('0.3');
    });

    it('money() membulatkan ke 2 desimal', () => {
      expect(money('100.005').toFixed(2)).toBe('100.01');
      expect(money('85500').toString()).toBe('85500');
    });

    it('diskon 20% dari 85500 = 17100 eksak', () => {
      const discount = D(85500).mul(20).div(100);
      expect(toNum(discount)).toBe(17100);
    });
  });
});
