import { prisma } from "../db.js";

export async function getTotalCommission() {
  const agg = await prisma.trade.aggregate({
    _sum: { commission: true },
    _count: true,
  });
  return {
    totalCommission: Number(agg._sum.commission ?? 0),
    currency: "USD",
    tradeCount: agg._count,
  };
}
