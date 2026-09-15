import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  quoteSpread: Number(process.env.QUOTE_SPREAD ?? 0.001),
  quoteTtlSeconds: Number(process.env.QUOTE_TTL_SECONDS ?? 30),
};
