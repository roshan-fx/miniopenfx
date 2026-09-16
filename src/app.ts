import express from "express";
import type { PriceProvider } from "./services/priceProvider.js";
import { BinancePriceProvider } from "./services/priceProvider.js";
import { pricesRouter } from "./routes/prices.js";
import { balancesRouter } from "./routes/balances.js";
import { quotesRouter } from "./routes/quotes.js";
import { tradesRouter } from "./routes/trades.js";
import { commissionRouter } from "./routes/commission.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(priceProvider: PriceProvider = new BinancePriceProvider()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (_req, res) => {
    res.json({
      service: "MiniOpenFX",
      message: "API-only FX/crypto quoting and trading service — no UI.",
      endpoints: {
        health: "GET /health",
        prices: "GET /api/v1/prices",
        balances: "GET /api/v1/balances",
        createQuote: "POST /api/v1/quotes",
        executeTrade: "POST /api/v1/trades",
        tradeHistory: "GET /api/v1/trades",
        commission: "GET /api/v1/commission",
      },
    });
  });

  app.use("/api/v1/prices", pricesRouter(priceProvider));
  app.use("/api/v1/balances", balancesRouter());
  app.use("/api/v1/quotes", quotesRouter(priceProvider));
  app.use("/api/v1/trades", tradesRouter());
  app.use("/api/v1/commission", commissionRouter());

  app.use(errorHandler);
  return app;
}
