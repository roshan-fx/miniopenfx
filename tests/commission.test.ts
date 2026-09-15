import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FakePriceProvider } from "./helpers/fakePriceProvider.js";

describe("GET /api/v1/commission", () => {
  it("returns zero with no trades yet", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app).get("/api/v1/commission");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalCommission: 0,
      currency: "USD",
      tradeCount: 0,
    });
  });

  it("sums commission across multiple trades", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));

    const quoteA = await request(app).post("/api/v1/quotes").send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "BUY",
      amount: 0.1,
    });
    await request(app).post("/api/v1/trades").send({ quoteId: quoteA.body.id });

    const quoteB = await request(app).post("/api/v1/quotes").send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "SELL",
      amount: 0.05,
    });
    await request(app).post("/api/v1/trades").send({ quoteId: quoteB.body.id });

    const res = await request(app).get("/api/v1/commission");
    expect(res.status).toBe(200);
    expect(res.body.tradeCount).toBe(2);
    const expected = 0.1 * 62340.5 * 0.001 + 0.05 * (62340.5 - 62340.5 / 1.001);
    expect(res.body.totalCommission).toBeCloseTo(expected, 2);
  });
});
