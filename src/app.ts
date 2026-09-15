import express from "express";
import type { PriceProvider } from "./services/priceProvider.js";
import { BinancePriceProvider } from "./services/priceProvider.js";
import { pricesRouter } from "./routes/prices.js";
import { balancesRouter } from "./routes/balances.js";
import { quotesRouter } from "./routes/quotes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(priceProvider: PriceProvider = new BinancePriceProvider()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1/prices", pricesRouter(priceProvider));
  app.use("/api/v1/balances", balancesRouter());
  app.use("/api/v1/quotes", quotesRouter(priceProvider));

  // route mounting for trades/commission happens in later tasks

  app.use(errorHandler);
  return app;
}
