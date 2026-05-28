import { PrismaService } from '../prisma/prisma.service';

/**
 * Generate a unique sequential code using a PostgreSQL advisory lock
 * to prevent race conditions under concurrent requests.
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

  // Use a raw query with advisory lock to prevent race conditions
  // pg_try_advisory_xact_lock is transaction-scoped and auto-released
  const result = await prisma.$transaction(async (tx) => {
    // Acquire advisory lock keyed by prefix hash (transaction-scoped)
    const lockKey = hashStringToInt(fullPrefix);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

    let lastCode: string | null = null;

    if (tableName === 'order') {
      const last = await tx.order.findFirst({
        where: { orderNumber: { startsWith: fullPrefix } },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });
      lastCode = last?.orderNumber ?? null;
    } else {
      const last = await tx.customer.findFirst({
        where: { memberCode: { startsWith: fullPrefix } },
        orderBy: { createdAt: 'desc' },
        select: { memberCode: true },
      });
      lastCode = last?.memberCode ?? null;
    }

    let sequence = 1;
    if (lastCode) {
      const parts = lastCode.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }

    return `${fullPrefix}-${sequence.toString().padStart(padLength, '0')}`;
  });

  return result;
}

/** Simple deterministic hash of a string to a 32-bit integer for advisory locks */
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  // Ensure positive value within safe PostgreSQL bigint range
  return Math.abs(hash) % 2_147_483_647;
}
