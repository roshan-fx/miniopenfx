import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FakePriceProvider } from "./helpers/fakePriceProvider.js";

async function createQuote(app: ReturnType<typeof createApp>, overrides = {}) {
  const res = await request(app)
    .post("/api/v1/quotes")
    .send({
      baseCurrency: "BTC",
      quoteCurrency: "USD",
      side: "BUY",
      amount: 0.1,
      ...overrides,
    });
  return res.body;
}

describe("POST /api/v1/trades", () => {
  it("executes a trade and updates balances", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const quote = await createQuote(app);

    const res = await request(app)
      .post("/api/v1/trades")
      .send({ quoteId: quote.id });

    expect(res.status).toBe(201);
    expect(res.body.baseCurrency).toBe("BTC");
    expect(Number(res.body.commission)).toBeCloseTo(0.1 * 62340.5 * 0.001, 4);

    const balances = await request(app).get("/api/v1/balances");
    const balanceRows = balances.body.balances as { currency: string; amount: string }[];
    const usd = balanceRows.find((b) => b.currency === "USD");
    const btc = balanceRows.find((b) => b.currency === "BTC");
    expect(Number(usd.amount)).toBeCloseTo(10000 - 0.1 * Number(quote.rate), 4);
    expect(Number(btc.amount)).toBeCloseTo(0.1, 8);
  });

  it("returns 404 for an unknown quote id", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app)
      .post("/api/v1/trades")
      .send({ quoteId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 410 for an already-consumed quote", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const quote = await createQuote(app);
    await request(app).post("/api/v1/trades").send({ quoteId: quote.id });

    const res = await request(app)
      .post("/api/v1/trades")
      .send({ quoteId: quote.id });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("GONE");
  });

  it("returns 422 when the balance can't cover the trade", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const quote = await createQuote(app, { amount: 1000 }); // far more than 10,000 USD covers

    const res = await request(app)
      .post("/api/v1/trades")
      .send({ quoteId: quote.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_BALANCE");
  });
});

describe("GET /api/v1/trades", () => {
  it("lists executed trades most-recent first", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const quoteA = await createQuote(app, { amount: 0.01 });
    await request(app).post("/api/v1/trades").send({ quoteId: quoteA.id });
    const quoteB = await createQuote(app, { amount: 0.02 });
    await request(app).post("/api/v1/trades").send({ quoteId: quoteB.id });

    const res = await request(app).get("/api/v1/trades");
    expect(res.status).toBe(200);
    expect(res.body.trades).toHaveLength(2);
    expect(Number(res.body.trades[0].amount)).toBeCloseTo(0.02, 8);
  });
});
