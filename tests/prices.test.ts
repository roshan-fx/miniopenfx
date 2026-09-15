import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FakePriceProvider } from "./helpers/fakePriceProvider.js";

describe("GET /api/v1/prices", () => {
  it("returns prices for all supported currencies by default", async () => {
    const app = createApp(
      new FakePriceProvider({ BTC: 62340.5, ETH: 2500.1, SOL: 140.2 }),
    );
    const res = await request(app).get("/api/v1/prices");
    expect(res.status).toBe(200);
    expect(res.body.prices).toEqual(
      expect.arrayContaining([
        { pair: "BTCUSD", midPrice: 62340.5 },
        { pair: "ETHUSD", midPrice: 2500.1 },
        { pair: "SOLUSD", midPrice: 140.2 },
      ]),
    );
  });

  it("returns only the requested pairs", async () => {
    const app = createApp(new FakePriceProvider({ BTC: 62340.5 }));
    const res = await request(app).get("/api/v1/prices?pairs=BTCUSD");
    expect(res.status).toBe(200);
    expect(res.body.prices).toEqual([{ pair: "BTCUSD", midPrice: 62340.5 }]);
  });

  it("rejects an unsupported pair with 400", async () => {
    const app = createApp(new FakePriceProvider({}));
    const res = await request(app).get("/api/v1/prices?pairs=DOGEUSD");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
