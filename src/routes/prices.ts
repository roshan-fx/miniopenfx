import { Router } from "express";
import type { PriceProvider } from "../services/priceProvider.js";
import { parsePairToCurrency, SUPPORTED_CURRENCIES } from "../services/priceProvider.js";

export function pricesRouter(priceProvider: PriceProvider) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const pairsParam = typeof req.query.pairs === "string"
        ? req.query.pairs.split(",")
        : SUPPORTED_CURRENCIES.map((c) => `${c}USD`);

      const currencies = pairsParam.map(parsePairToCurrency);

      const prices = await Promise.all(
        currencies.map(async (currency) => ({
          pair: `${currency}USD`,
          midPrice: await priceProvider.getMidPrice(currency),
        })),
      );

      res.json({ prices });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
