import { PrismaService } from '../prisma/prisma.service';

/**
 * Generate a unique sequential code. Aman untuk request paralel: nomor diambil
 * dari tabel `daily_sequences` dengan increment atomik (INSERT … ON CONFLICT).
 *
 * Pattern: {prefix}-{YYYYMMDD}-{padded sequence}
 * Example: ORD-20260528-000001
 */
export async function generateDailySequence(
  prisma: PrismaService,
  prefix: string,
  tableName: 'order' | 'customer',
  codeField: 'orderNumber' | 'memberCode',
  padLength = 6,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const fullPrefix = `${prefix}-${dateStr}`;

  // Nilai awal bila kunci hari ini belum ada: lanjutkan dari nomor terakhir
  // yang sudah tersimpan (kompatibel dengan data sebelum tabel ini dibuat).
  let lastCode: string | null = null;
  if (tableName === 'order') {
    const last = await prisma.order.findFirst({
      where: { orderNumber: { startsWith: fullPrefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    lastCode = last?.orderNumber ?? null;
  } else {
    const last = await prisma.customer.findFirst({
      where: { memberCode: { startsWith: fullPrefix } },
      orderBy: { memberCode: 'desc' },
      select: { memberCode: true },
    });
    lastCode = last?.memberCode ?? null;
  }
  let initial = 1;
  if (lastCode) {
    const lastSeq = parseInt(lastCode.split('-').pop() ?? '', 10);
    if (!isNaN(lastSeq)) initial = lastSeq + 1;
  }

  // Increment ATOMIK: pemanggil paralel pertama menyisipkan `initial`, sisanya
  // menaikkan nilai yang ada → setiap pemanggil mendapat nomor berbeda.
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "daily_sequences" ("key", "value", "updatedAt")
    VALUES (${fullPrefix}, ${initial}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = "daily_sequences"."value" + 1, "updatedAt" = NOW()
    RETURNING "value"`;
  const result = `${fullPrefix}-${Number(rows[0].value).toString().padStart(padLength, '0')}`;

  return result;
}
