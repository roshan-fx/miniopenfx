import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import type { PriceProvider } from "./priceProvider.js";
import { SUPPORTED_CURRENCIES } from "./priceProvider.js";

export const createQuoteSchema = z.object({
  baseCurrency: z.enum(SUPPORTED_CURRENCIES),
  quoteCurrency: z.literal("USD"),
  side: z.enum(["BUY", "SELL"]),
  amount: z.number().positive(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export async function createQuote(
  priceProvider: PriceProvider,
  input: CreateQuoteInput,
) {
  const midPrice = await priceProvider.getMidPrice(input.baseCurrency);
  const rate =
    input.side === "BUY"
      ? midPrice * (1 + config.quoteSpread)
      : midPrice / (1 + config.quoteSpread);
  const expiresAt = new Date(Date.now() + config.quoteTtlSeconds * 1000);

  return prisma.quote.create({
    data: {
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      side: input.side,
      amount: input.amount,
      midPrice,
      rate,
      expiresAt,
    },
  });
}
