/**
 * Throwaway demo script — walks through one quote -> trade cycle by hand,
 * using the same math the real endpoints will use. Not part of the app.
 * Run with: npx tsx scripts/dummy-trade-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SPREAD = 0.001; // 0.1%, same as QUOTE_SPREAD in .env
const TTL_MS = 10_000;

async function main() {
  // 1. Seed starting balances (idempotent - safe to re-run)
  await prisma.balance.upsert({
    where: { currency: "USD" },
    create: { currency: "USD", amount: 10000 },
    update: {},
  });
  await prisma.balance.upsert({
    where: { currency: "BTC" },
    create: { currency: "BTC", amount: 0 },
    update: {},
  });

  console.log("--- Before trade ---");
  console.log(await prisma.balance.findMany());

  // 2. Pretend this came from Binance (real code would fetch it live)
  const midPrice = 62340.5;

  // 3. Client wants to BUY 0.1 BTC -> create a quote
  const side = "BUY" as const;
  const amount = 0.1;
  const rate = midPrice * (1 + SPREAD); // BUY: pay slightly above mid

  const quote = await prisma.quote.create({
    data: {
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side,
      amount,
      midPrice,
      rate,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  console.log("\n--- Quote created ---");
  console.log(quote);

  // 4. Client confirms the trade against that quote (immediately, so it's valid)
  if (quote.consumed) throw new Error("quote already used");
  if (quote.expiresAt < new Date()) throw new Error("quote expired");

  const usdCost = amount * rate;
  const commission = amount * Math.abs(midPrice - rate);

  const usdBalance = await prisma.balance.findUniqueOrThrow({ where: { currency: "USD" } });
  if (Number(usdBalance.amount) < usdCost) throw new Error("insufficient USD balance");

  const [, , trade] = await prisma.$transaction([
    prisma.balance.update({
      where: { currency: "USD" },
      data: { amount: { decrement: usdCost } },
    }),
    prisma.balance.update({
      where: { currency: "BTC" },
      data: { amount: { increment: amount } },
    }),
    prisma.trade.create({
      data: {
        quoteId: quote.id,
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        side: quote.side,
        amount: quote.amount,
        rate: quote.rate,
        commission,
      },
    }),
  ]);
  await prisma.quote.update({ where: { id: quote.id }, data: { consumed: true } });

  console.log("\n--- Trade executed ---");
  console.log(trade);

  console.log("\n--- After trade ---");
  console.log(await prisma.balance.findMany());
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
