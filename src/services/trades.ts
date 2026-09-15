import { prisma } from "../db.js";
import {
  NotFoundError,
  GoneError,
  InsufficientBalanceError,
} from "../errors.js";

export async function executeTrade(quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) {
    throw new NotFoundError("Quote not found");
  }
  if (quote.consumed) {
    throw new GoneError("Quote already used");
  }
  if (quote.expiresAt < new Date()) {
    throw new GoneError("Quote expired");
  }

  const amount = Number(quote.amount);
  const rate = Number(quote.rate);
  const midPrice = Number(quote.midPrice);
  const commission = amount * Math.abs(midPrice - rate);

  const isBuy = quote.side === "BUY";
  const settleCurrency = isBuy ? quote.quoteCurrency : quote.baseCurrency;
  const settleAmount = isBuy ? amount * rate : amount;
  const creditCurrency = isBuy ? quote.baseCurrency : quote.quoteCurrency;
  const creditAmount = isBuy ? amount : amount * rate;

  const balance = await prisma.balance.findUnique({
    where: { currency: settleCurrency },
  });
  if (!balance || Number(balance.amount) < settleAmount) {
    throw new InsufficientBalanceError(`Insufficient ${settleCurrency} balance`);
  }

  // The transaction re-claims the quote atomically (consumed: false ->
  // true, count must be 1) so two concurrent trade requests against the
  // same quote can't both succeed — the race window between the checks
  // above and this transaction is closed here.
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.quote.updateMany({
      where: { id: quote.id, consumed: false, expiresAt: { gt: new Date() } },
      data: { consumed: true },
    });
    if (claimed.count === 0) {
      throw new GoneError("Quote expired or already used");
    }

    await tx.balance.update({
      where: { currency: settleCurrency },
      data: { amount: { decrement: settleAmount } },
    });
    await tx.balance.update({
      where: { currency: creditCurrency },
      data: { amount: { increment: creditAmount } },
    });

    return tx.trade.create({
      data: {
        quoteId: quote.id,
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        side: quote.side,
        amount: quote.amount,
        rate: quote.rate,
        commission,
      },
    });
  });
}

export async function listTrades(limit: number, cursor?: string) {
  const trades = await prisma.trade.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { executedAt: "desc" },
  });
  const hasMore = trades.length > limit;
  const page = hasMore ? trades.slice(0, limit) : trades;
  return {
    trades: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
