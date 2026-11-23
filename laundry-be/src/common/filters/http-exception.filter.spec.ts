import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './http-exception.filter';

// Error tak tertangani tidak boleh membocorkan detail teknis (potongan kode, path file, nama constraint).
describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();
  (filter as any).logger = { error: jest.fn() };

  function run(exception: unknown) {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) };
    const host: any = {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/api/v1/x', method: 'DELETE' }) }),
    };
    filter.catch(exception, host);
    return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
  }
  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(
      'Invalid `this.prisma.outlet.delete()` invocation in /srv/dist/x.js:86 Foreign key constraint failed on the field: `orders_outletId_fkey (index)`',
      { code, clientVersion: '5.8.0' },
    );

  it('P2003 (masih dipakai data lain) → 409 dengan pesan umum, tanpa detail Prisma', () => {
    const { status, body } = run(prismaError('P2003'));
    expect(status).toBe(409);
    expect(JSON.stringify(body)).not.toMatch(/prisma|invocation|fkey|\/srv\//i);
  });

  it('P2002 → 409, P2025 → 404', () => {
    expect(run(prismaError('P2002')).status).toBe(409);
    expect(run(prismaError('P2025')).status).toBe(404);
  });

  it('error biasa → 500 dengan pesan umum (detail hanya di log)', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    expect(status).toBe(500);
    expect(body.message).toBe('Terjadi kesalahan pada server. Silakan coba lagi.');
  });

  it('HttpException tetap meneruskan pesannya', () => {
    const { status, body } = run(new BadRequestException('Outlet sedang tidak beroperasi.'));
    expect(status).toBe(400);
    expect(body.message).toBe('Outlet sedang tidak beroperasi.');
  });
});
