import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FakePriceProvider } from "./helpers/fakePriceProvider.js";

describe("GET /api/v1/balances", () => {
  it("returns the seeded balances", async () => {
    const app = createApp(new FakePriceProvider({}));
    const res = await request(app).get("/api/v1/balances");
    expect(res.status).toBe(200);
    expect(res.body.balances).toEqual(
      expect.arrayContaining([
        { currency: "USD", amount: "10000" },
        { currency: "BTC", amount: "0" },
        { currency: "ETH", amount: "0" },
        { currency: "SOL", amount: "0" },
      ]),
    );
  });
});
