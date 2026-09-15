import { Router } from "express";
import { getBalances } from "../services/balances.js";

export function balancesRouter() {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const balances = await getBalances();
      res.json({ balances });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
