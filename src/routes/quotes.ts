import { Router } from "express";
import { ZodError } from "zod";
import type { PriceProvider } from "../services/priceProvider.js";
import { createQuote, createQuoteSchema } from "../services/quotes.js";
import { ValidationError } from "../errors.js";

export function quotesRouter(priceProvider: PriceProvider) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const input = createQuoteSchema.parse(req.body);
      const quote = await createQuote(priceProvider, input);
      res.status(201).json(quote);
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ValidationError(err.issues.map((i) => i.message).join("; ")),
        );
      }
      next(err);
    }
  });

  return router;
}
