import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const dryRun = !process.argv.includes('--write');

function adjustment(rule: any, subtotal: Prisma.Decimal) {
  if (rule.priceType === 'DISCOUNT_PERCENT') return subtotal.mul(rule.value).div(100);
  if (rule.priceType === 'FIXED_DISCOUNT') return Prisma.Decimal.min(rule.value, subtotal);
  if (rule.priceType === 'FIXED_PRICE') {
    return Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.minus(rule.value));
  }
  return new Prisma.Decimal(0);
}

function specificity(rule: any) {
  return [
    rule.partnerId ? 8 : 0,
    rule.tier ? 4 : 0,
    rule.outletId ? 2 : 0,
    rule.serviceId ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      partnerId: { not: null },
      discountAmount: { gt: 0 },
      b2bPricingRuleUsages: { none: {} },
    },
    include: { partner: true, items: true },
    orderBy: { orderDate: 'asc' },
    take: Number(process.env.B2B_PRICING_BACKFILL_LIMIT ?? 500),
  });

  let inserted = 0;
  let skipped = 0;

  for (const order of orders) {
    if (!order.partner) {
      skipped++;
      continue;
    }

    const usageByRule = new Map<string, Prisma.Decimal>();
    for (const item of order.items) {
      const rules = await prisma.b2BPricingRule.findMany({
        where: {
          isActive: true,
          OR: [{ partnerId: order.partnerId }, { partnerId: null }],
          AND: [
            { OR: [{ tier: order.partner.tier }, { tier: null }] },
            { OR: [{ outletId: order.outletId }, { outletId: null }] },
            { OR: [{ serviceId: item.serviceId }, { serviceId: null }] },
            { OR: [{ startDate: null }, { startDate: { lte: order.orderDate } }] },
            { OR: [{ endDate: null }, { endDate: { gte: order.orderDate } }] },
          ],
        },
      });
      const rule = rules.sort(
        (a, b) =>
          b.priority - a.priority ||
          specificity(b) - specificity(a) ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      )[0];
      if (!rule) continue;

      const amount = adjustment(rule, item.subtotal);
      if (amount.lte(0)) continue;
      usageByRule.set(
        rule.id,
        (usageByRule.get(rule.id) ?? new Prisma.Decimal(0)).plus(amount),
      );
    }

    if (usageByRule.size === 0) {
      skipped++;
      continue;
    }

    const rows = Array.from(usageByRule.entries()).map(([ruleId, amount]) => ({
      orderId: order.id,
      ruleId,
      partnerId: order.partnerId,
      discountAmount: amount.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
      createdAt: order.orderDate,
    }));

    if (!dryRun) {
      await prisma.b2BPricingRuleUsage.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
    inserted += rows.length;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scannedOrders: orders.length,
        usageRows: inserted,
        skippedOrders: skipped,
        note: dryRun ? 'Run with --write to insert rows.' : 'Rows inserted.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
