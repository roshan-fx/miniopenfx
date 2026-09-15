import { Router } from "express";
import { z, ZodError } from "zod";
import { executeTrade, listTrades } from "../services/trades.js";
import { ValidationError } from "../errors.js";

const createTradeSchema = z.object({ quoteId: z.string().uuid() });

export function tradesRouter() {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const { quoteId } = createTradeSchema.parse(req.body);
      const trade = await executeTrade(quoteId);
      res.status(201).json(trade);
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new ValidationError("quoteId must be a valid UUID"));
      }
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const result = await listTrades(limit, cursor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
