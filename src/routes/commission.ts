import { Router } from "express";
import { getTotalCommission } from "../services/commission.js";

export function commissionRouter() {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await getTotalCommission());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
