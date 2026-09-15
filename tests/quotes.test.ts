import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FakePriceProvider } from "./helpers/fakePriceProvider.js";

describe("POST /api/v1/quotes", () => {
  it("creates a BUY quote priced above mid", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app).post("/api/v1/quotes").send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "BUY",
      amount: 0.1,
    });
    expect(res.status).toBe(201);
    expect(res.body.side).toBe("BUY");
    expect(Number(res.body.rate)).toBeCloseTo(62340.5 * 1.001, 4);
    expect(res.body.consumed).toBe(false);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("creates a SELL quote priced below mid", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app).post("/api/v1/quotes").send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "SELL",
      amount: 0.1,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.rate)).toBeCloseTo(62340.5 / 1.001, 4);
  });

  it("rejects a non-positive amount with 400", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app).post("/api/v1/quotes").send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "BUY",
      amount: -1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
