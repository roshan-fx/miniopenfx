# MiniOpenFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MiniOpenFX API — prices, balances, quotes, trades, trade history, and commission tracking — as designed in the spec.

**Architecture:** Express + TypeScript HTTP layer, thin routes delegating to service functions, Prisma/Postgres for persistence. The Binance price source is injected as a `PriceProvider` interface so tests never hit the real network.

**Tech Stack:** Node.js, TypeScript, Express 5, Prisma 6, Postgres, Zod, Vitest, Supertest, dotenv.

**Spec:** [docs/superpowers/specs/2026-09-15-miniopenfx-design.md](../specs/2026-09-15-miniopenfx-design.md)

## Global Constraints

- Currencies: `USD` (base, seeded 10,000), `BTC`, `ETH`, `SOL` (seeded 0). All trades are `{crypto} <-> USD`.
- `QUOTE_SPREAD` default `0.001` (0.1%), `QUOTE_TTL_SECONDS` default `10` — both env-configurable.
- Rate formula: `BUY: midPrice * (1 + SPREAD)`, `SELL: midPrice / (1 + SPREAD)`.
- Commission: `amount * abs(midPrice - rate)`, always in USD.
- All API routes are under `/api/v1`.
- Error response shape: `{ error: { code, message } }`. Status codes: `400` validation, `404` not found, `410` expired/consumed, `422` insufficient balance, `502` upstream (Binance) failure.
- No authentication. Single implicit account (one row per currency in `Balance`).
- Prisma stays pinned to 6.x (`schema.prisma` `url = env("DATABASE_URL")`) — do not upgrade to 7.x mid-project.

---

## File Structure

```
src/
  config.ts                    # env-driven constants
  db.ts                        # Prisma client singleton
  errors.ts                    # AppError + subclasses
  middleware/errorHandler.ts   # turns AppError (and unknowns) into JSON responses
  services/
    priceProvider.ts           # PriceProvider interface + BinancePriceProvider + currency helpers
    balances.ts
    quotes.ts
    trades.ts
    commission.ts
  routes/
    prices.ts
    balances.ts
    quotes.ts
    trades.ts
    commission.ts
  app.ts                       # createApp(priceProvider?) wiring
  server.ts                    # entrypoint, calls createApp().listen()
prisma/
  seed.ts                      # idempotent balance seeding
tests/
  setup.ts                     # truncates + reseeds tables before each test
  helpers/fakePriceProvider.ts
  health.test.ts
  prices.test.ts
  balances.test.ts
  quotes.test.ts
  trades.test.ts
  commission.test.ts
vitest.config.ts
.env.test
.github/workflows/ci.yml
README.md
```

---

### Task 1: Test harness, config, errors, and app skeleton

**Files:**
- Create: `src/config.ts`, `src/db.ts`, `src/errors.ts`, `src/middleware/errorHandler.ts`, `src/app.ts`, `src/server.ts`
- Create: `vitest.config.ts`, `.env.test`, `tests/setup.ts`
- Test: `tests/health.test.ts`
- Modify: `package.json` (add `dotenv` dependency, `prisma.seed` field)

**Interfaces:**
- Produces: `config: { port, quoteSpread, quoteTtlSeconds }` from `src/config.ts`; `prisma` client from `src/db.ts`; `AppError, ValidationError, NotFoundError, GoneError, InsufficientBalanceError, UpstreamError` from `src/errors.ts`; `errorHandler` Express middleware from `src/middleware/errorHandler.ts`; `createApp(priceProvider?)` from `src/app.ts` returning an Express `app`.

- [ ] **Step 1: Create the test database**

Run: `createdb miniopenfx_test`

- [ ] **Step 2: Add `.env.test`**

```
DATABASE_URL="postgresql://roshanngowda@localhost:5432/miniopenfx_test?schema=public"
PORT=3001
QUOTE_SPREAD=0.001
QUOTE_TTL_SECONDS=10
```

- [ ] **Step 3: Apply migrations to the test database**

Run: `DATABASE_URL="postgresql://roshanngowda@localhost:5432/miniopenfx_test?schema=public" npx prisma migrate deploy`

- [ ] **Step 4: Install dotenv**

Run: `npm install dotenv`

- [ ] **Step 5: Write `src/config.ts`**

```typescript
import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  quoteSpread: Number(process.env.QUOTE_SPREAD ?? 0.001),
  quoteTtlSeconds: Number(process.env.QUOTE_TTL_SECONDS ?? 10),
};
```

- [ ] **Step 6: Write `src/db.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 7: Write `src/errors.ts`**

```typescript
export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class GoneError extends AppError {
  constructor(message: string) {
    super(message, 410, "GONE");
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message: string) {
    super(message, 422, "INSUFFICIENT_BALANCE");
  }
}

export class UpstreamError extends AppError {
  constructor(message: string) {
    super(message, 502, "UPSTREAM_ERROR");
  }
}
```

- [ ] **Step 8: Write `src/middleware/errorHandler.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
```

- [ ] **Step 9: Write the failing test `tests/health.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 10: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
```

- [ ] **Step 11: Write `tests/setup.ts`**

```typescript
import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Trade", "Quote", "Balance" RESTART IDENTITY CASCADE',
  );
  await prisma.balance.createMany({
    data: [
      { currency: "USD", amount: 10000 },
      { currency: "BTC", amount: 0 },
      { currency: "ETH", amount: 0 },
      { currency: "SOL", amount: 0 },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run tests/health.test.ts`
Expected: FAIL — `createApp` is not defined / module not found.

- [ ] **Step 13: Write `src/app.ts` (health check only for now)**

```typescript
import express from "express";
import type { PriceProvider } from "./services/priceProvider.js";
import { BinancePriceProvider } from "./services/priceProvider.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(priceProvider: PriceProvider = new BinancePriceProvider()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // route mounting for prices/balances/quotes/trades/commission happens in later tasks

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 14: Write `src/server.ts`**

```typescript
import { config } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();
app.listen(config.port, () => {
  console.log(`MiniOpenFX listening on :${config.port}`);
});
```

Note: `src/app.ts` imports `./services/priceProvider.js`, which doesn't exist
yet — that's Task 2. Create a minimal placeholder now so Task 1's test can
run:

```typescript
// src/services/priceProvider.ts (minimal version, expanded in Task 2)
export interface PriceProvider {
  getMidPrice(baseCurrency: string): Promise<number>;
}

export class BinancePriceProvider implements PriceProvider {
  async getMidPrice(_baseCurrency: string): Promise<number> {
    throw new Error("not implemented until Task 2");
  }
}
```

- [ ] **Step 15: Run the test to verify it passes**

Run: `npx vitest run tests/health.test.ts`
Expected: PASS

- [ ] **Step 16: Update `package.json` scripts and prisma seed field**

Add to `package.json`:
```json
"test": "vitest run",
```
(already present from initial scaffold — verify it's there)

Add a top-level field:
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "feat: add app skeleton, error handling, and test harness"
```

---

### Task 2: Binance price provider + prices endpoint

**Files:**
- Modify: `src/services/priceProvider.ts` (replace placeholder from Task 1)
- Create: `src/routes/prices.ts`, `tests/helpers/fakePriceProvider.ts`
- Test: `tests/prices.test.ts`
- Modify: `src/app.ts` (mount prices router)

**Interfaces:**
- Consumes: `AppError` subclasses from Task 1 (`ValidationError`, `UpstreamError`); `createApp(priceProvider?)` from Task 1.
- Produces: `PriceProvider` interface, `BinancePriceProvider`, `SUPPORTED_CURRENCIES`, `parsePairToCurrency(pair: string): string` from `src/services/priceProvider.ts`. `pricesRouter(priceProvider: PriceProvider): Router` from `src/routes/prices.ts`. `FakePriceProvider` from `tests/helpers/fakePriceProvider.ts` (used by all later test files).

- [ ] **Step 1: Write `tests/helpers/fakePriceProvider.ts`**

```typescript
import type { PriceProvider } from "../../src/services/priceProvider.js";

export class FakePriceProvider implements PriceProvider {
  constructor(private prices: Record<string, number>) {}

  async getMidPrice(baseCurrency: string): Promise<number> {
    const price = this.prices[baseCurrency];
    if (price === undefined) {
      throw new Error(`No fake price configured for ${baseCurrency}`);
    }
    return price;
  }
}
```

- [ ] **Step 2: Write the failing test `tests/prices.test.ts`**

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/prices.test.ts`
Expected: FAIL — `/api/v1/prices` returns 404 (route not mounted yet).

- [ ] **Step 4: Write `src/services/priceProvider.ts`**

```typescript
import { ValidationError, UpstreamError } from "../errors.js";

export const SUPPORTED_CURRENCIES = ["BTC", "ETH", "SOL"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const BINANCE_SYMBOLS: Record<SupportedCurrency, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function parsePairToCurrency(pair: string): SupportedCurrency {
  const currency = pair.replace(/USD$/, "");
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`Unsupported pair: ${pair}`);
  }
  return currency;
}

export interface PriceProvider {
  getMidPrice(baseCurrency: string): Promise<number>;
}

export class BinancePriceProvider implements PriceProvider {
  async getMidPrice(baseCurrency: string): Promise<number> {
    if (!isSupportedCurrency(baseCurrency)) {
      throw new ValidationError(`Unsupported currency: ${baseCurrency}`);
    }
    const symbol = BINANCE_SYMBOLS[baseCurrency];
    let res: Response;
    try {
      res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      );
    } catch {
      throw new UpstreamError("Failed to reach Binance");
    }
    if (!res.ok) {
      throw new UpstreamError(`Binance request failed: ${res.status}`);
    }
    const data = (await res.json()) as { price: string };
    return Number(data.price);
  }
}
```

- [ ] **Step 5: Write `src/routes/prices.ts`**

```typescript
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
```

- [ ] **Step 6: Mount the router in `src/app.ts`**

```typescript
import express from "express";
import type { PriceProvider } from "./services/priceProvider.js";
import { BinancePriceProvider } from "./services/priceProvider.js";
import { pricesRouter } from "./routes/prices.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(priceProvider: PriceProvider = new BinancePriceProvider()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1/prices", pricesRouter(priceProvider));

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/prices.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Binance price provider and GET /api/v1/prices"
```

---

### Task 3: Balances endpoint + seed script

**Files:**
- Create: `src/services/balances.ts`, `src/routes/balances.ts`, `prisma/seed.ts`
- Test: `tests/balances.test.ts`
- Modify: `src/app.ts` (mount balances router)

**Interfaces:**
- Consumes: `prisma` from `src/db.ts` (Task 1).
- Produces: `getBalances(): Promise<Balance[]>` from `src/services/balances.ts`; `balancesRouter(): Router` from `src/routes/balances.ts`.

- [ ] **Step 1: Write the failing test `tests/balances.test.ts`**

```typescript
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
```

Note: Prisma serializes `Decimal` to a string over JSON by default — the
test expects string amounts for this reason.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/balances.test.ts`
Expected: FAIL — 404, route not mounted.

- [ ] **Step 3: Write `src/services/balances.ts`**

```typescript
import { prisma } from "../db.js";

export async function getBalances() {
  return prisma.balance.findMany({ orderBy: { currency: "asc" } });
}
```

- [ ] **Step 4: Write `src/routes/balances.ts`**

```typescript
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
```

- [ ] **Step 5: Mount the router in `src/app.ts`**

Add:
```typescript
import { balancesRouter } from "./routes/balances.js";
// ...
app.use("/api/v1/balances", balancesRouter());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/balances.test.ts`
Expected: PASS

- [ ] **Step 7: Write `prisma/seed.ts`** (used for local dev / demo, not tests)

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const seedBalances = [
    { currency: "USD", amount: 10000 },
    { currency: "BTC", amount: 0 },
    { currency: "ETH", amount: 0 },
    { currency: "SOL", amount: 0 },
  ];

  for (const balance of seedBalances) {
    await prisma.balance.upsert({
      where: { currency: balance.currency },
      create: balance,
      update: {},
    });
  }

  console.log("Seeded balances:", await prisma.balance.findMany());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 8: Run the seed script against the dev database**

Run: `npm run db:seed`
Expected: prints the four seeded balances.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add GET /api/v1/balances and dev seed script"
```

---

### Task 4: Quote creation (spread math) + endpoint

**Files:**
- Create: `src/services/quotes.ts`, `src/routes/quotes.ts`
- Test: `tests/quotes.test.ts`
- Modify: `src/app.ts` (mount quotes router)

**Interfaces:**
- Consumes: `PriceProvider` (Task 2), `config` (Task 1), `prisma` (Task 1), `ValidationError` (Task 1).
- Produces: `createQuote(priceProvider, input): Promise<Quote>` from `src/services/quotes.ts`; `quotesRouter(priceProvider): Router` from `src/routes/quotes.ts`. Later tasks (5) read `Quote` rows this creates.

- [ ] **Step 1: Write the failing test `tests/quotes.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/quotes.test.ts`
Expected: FAIL — 404, route not mounted.

- [ ] **Step 3: Write `src/services/quotes.ts`**

```typescript
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import type { PriceProvider } from "./priceProvider.js";
import { SUPPORTED_CURRENCIES } from "./priceProvider.js";

export const createQuoteSchema = z.object({
  baseCurrency: z.enum(SUPPORTED_CURRENCIES),
  quoteCurrency: z.literal("USD"),
  side: z.enum(["BUY", "SELL"]),
  amount: z.number().positive(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export async function createQuote(
  priceProvider: PriceProvider,
  input: CreateQuoteInput,
) {
  const midPrice = await priceProvider.getMidPrice(input.baseCurrency);
  const rate =
    input.side === "BUY"
      ? midPrice * (1 + config.quoteSpread)
      : midPrice / (1 + config.quoteSpread);
  const expiresAt = new Date(Date.now() + config.quoteTtlSeconds * 1000);

  return prisma.quote.create({
    data: {
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      side: input.side,
      amount: input.amount,
      midPrice,
      rate,
      expiresAt,
    },
  });
}
```

- [ ] **Step 4: Write `src/routes/quotes.ts`**

```typescript
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
```

- [ ] **Step 5: Mount the router in `src/app.ts`**

Add:
```typescript
import { quotesRouter } from "./routes/quotes.js";
// ...
app.use("/api/v1/quotes", quotesRouter(priceProvider));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/quotes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add POST /api/v1/quotes with spread-adjusted rate"
```

---

### Task 5: Trade execution (transaction + all error cases) + endpoint

**Files:**
- Create: `src/services/trades.ts`, `src/routes/trades.ts`
- Test: `tests/trades.test.ts`
- Modify: `src/app.ts` (mount trades router)

**Interfaces:**
- Consumes: `prisma` (Task 1), `NotFoundError, GoneError, InsufficientBalanceError` (Task 1), `Quote` rows produced by `createQuote` (Task 4).
- Produces: `executeTrade(quoteId: string): Promise<Trade>`, `listTrades(limit, cursor?): Promise<{trades, nextCursor}>` from `src/services/trades.ts`; `tradesRouter(): Router` from `src/routes/trades.ts`. Task 7 (commission) reads `Trade.commission` this produces.

- [ ] **Step 1: Write the failing test `tests/trades.test.ts`**

```typescript
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
    const usd = balances.body.balances.find((b: any) => b.currency === "USD");
    const btc = balances.body.balances.find((b: any) => b.currency === "BTC");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trades.test.ts`
Expected: FAIL — 404, route not mounted.

- [ ] **Step 3: Write `src/services/trades.ts`**

```typescript
import { prisma } from "../db.js";
import {
  NotFoundError,
  GoneError,
  InsufficientBalanceError,
} from "../errors.js";

export async function executeTrade(quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) {
    throw new NotFoundError("Quote not found");
  }
  if (quote.consumed) {
    throw new GoneError("Quote already used");
  }
  if (quote.expiresAt < new Date()) {
    throw new GoneError("Quote expired");
  }

  const amount = Number(quote.amount);
  const rate = Number(quote.rate);
  const midPrice = Number(quote.midPrice);
  const commission = amount * Math.abs(midPrice - rate);

  const isBuy = quote.side === "BUY";
  const settleCurrency = isBuy ? quote.quoteCurrency : quote.baseCurrency;
  const settleAmount = isBuy ? amount * rate : amount;
  const creditCurrency = isBuy ? quote.baseCurrency : quote.quoteCurrency;
  const creditAmount = isBuy ? amount : amount * rate;

  const balance = await prisma.balance.findUnique({
    where: { currency: settleCurrency },
  });
  if (!balance || Number(balance.amount) < settleAmount) {
    throw new InsufficientBalanceError(`Insufficient ${settleCurrency} balance`);
  }

  // The transaction re-claims the quote atomically (consumed: false ->
  // true, count must be 1) so two concurrent trade requests against the
  // same quote can't both succeed — the race window between the checks
  // above and this transaction is closed here.
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.quote.updateMany({
      where: { id: quote.id, consumed: false, expiresAt: { gt: new Date() } },
      data: { consumed: true },
    });
    if (claimed.count === 0) {
      throw new GoneError("Quote expired or already used");
    }

    await tx.balance.update({
      where: { currency: settleCurrency },
      data: { amount: { decrement: settleAmount } },
    });
    await tx.balance.update({
      where: { currency: creditCurrency },
      data: { amount: { increment: creditAmount } },
    });

    return tx.trade.create({
      data: {
        quoteId: quote.id,
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        side: quote.side,
        amount: quote.amount,
        rate: quote.rate,
        commission,
      },
    });
  });
}

export async function listTrades(limit: number, cursor?: string) {
  const trades = await prisma.trade.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { executedAt: "desc" },
  });
  const hasMore = trades.length > limit;
  const page = hasMore ? trades.slice(0, limit) : trades;
  return {
    trades: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
```

- [ ] **Step 4: Write `src/routes/trades.ts`**

```typescript
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
```

- [ ] **Step 5: Mount the router in `src/app.ts`**

Add:
```typescript
import { tradesRouter } from "./routes/trades.js";
// ...
app.use("/api/v1/trades", tradesRouter());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/trades.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add POST/GET /api/v1/trades with atomic quote settlement"
```

---

### Task 6: Commission endpoint

**Files:**
- Create: `src/services/commission.ts`, `src/routes/commission.ts`
- Test: `tests/commission.test.ts`
- Modify: `src/app.ts` (mount commission router)

**Interfaces:**
- Consumes: `prisma` (Task 1), `Trade` rows produced by `executeTrade` (Task 5).
- Produces: `getTotalCommission(): Promise<{totalCommission, currency, tradeCount}>` from `src/services/commission.ts`; `commissionRouter(): Router` from `src/routes/commission.ts`.

- [ ] **Step 1: Write the failing test `tests/commission.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commission.test.ts`
Expected: FAIL — 404, route not mounted.

- [ ] **Step 3: Write `src/services/commission.ts`**

```typescript
import { prisma } from "../db.js";

export async function getTotalCommission() {
  const agg = await prisma.trade.aggregate({
    _sum: { commission: true },
    _count: true,
  });
  return {
    totalCommission: Number(agg._sum.commission ?? 0),
    currency: "USD",
    tradeCount: agg._count,
  };
}
```

- [ ] **Step 4: Write `src/routes/commission.ts`**

```typescript
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
```

- [ ] **Step 5: Mount the router in `src/app.ts`**

Add:
```typescript
import { commissionRouter } from "./routes/commission.js";
// ...
app.use("/api/v1/commission", commissionRouter());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/commission.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests across every file PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add GET /api/v1/commission"
```

---

### Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run typecheck`, `npm run lint`, and a Postgres service container for the test database — all defined in earlier tasks.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: miniopenfx_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/miniopenfx_test?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Verify locally that each CI step's command works**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all three succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: add GitHub Actions workflow (postgres service + test/lint/typecheck)"
```

---

### Task 8: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything built in Tasks 1-7 (this documents the finished system; no new code interfaces).

- [ ] **Step 1: Write `README.md`** covering:
  - One-paragraph overview (what MiniOpenFX is)
  - Setup instructions: `brew install postgresql@16`, `createdb miniopenfx_dev`, `cp .env.example .env`, `npm install`, `npx prisma migrate dev`, `npm run db:seed`, `npm run dev`
  - Full endpoint list with example `curl` requests/responses for all 6 endpoints
  - Architecture section (adapt from the design spec: quote-then-trade flow, why a spread/commission model, why single-account/no-auth, why Prisma 6 over 7)
  - "Trade-offs and things I'd do differently with more time" section (e.g. no auth, fixed currency list, floating-point business-logic math on top of Decimal storage)
  - Testing: `npm test`
  - Loom video link placeholder: `[Loom walkthrough](TODO: add link after recording)`
  - Deployment URL placeholder (filled in after Task 9)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, API reference, and architecture notes"
```

---

### Task 9: Deployment

**Files:**
- Create: deployment platform config as needed (e.g. `railway.json` or platform dashboard settings — no code changes)
- Modify: `README.md` (fill in the deployment URL placeholder)

**Interfaces:**
- Consumes: `npm run build`, `npm start`, `DATABASE_URL` env var — all already defined.

- [ ] **Step 1: Provision a Postgres instance and a Node service on the chosen host** (e.g. Railway) — manual dashboard step, confirm with the user before creating any account/billing-adjacent resource.
- [ ] **Step 2: Set environment variables on the host** (`DATABASE_URL`, `PORT`, `QUOTE_SPREAD`, `QUOTE_TTL_SECONDS`)
- [ ] **Step 3: Run migrations against the production database**

Run: `DATABASE_URL=<production-url> npx prisma migrate deploy`

- [ ] **Step 4: Run the seed script against production**

Run: `DATABASE_URL=<production-url> npm run db:seed`

- [ ] **Step 5: Deploy and verify** `GET /health` and `GET /api/v1/prices` respond correctly on the public URL.
- [ ] **Step 6: Update `README.md`** with the live URL.
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: add public deployment URL"
```

---

## Self-Review Notes

- **Spec coverage**: all 5 required endpoints (prices, balances, quotes, trades, trade history) plus the commission bonus endpoint are covered (Tasks 2-6); versioned routes (`/api/v1`) — Task 1; error status codes — Tasks 1, 4, 5; README — Task 8; tests — every task; CI — Task 7; deployment — Task 9.
- **Placeholder scan**: no TBD/TODO in code steps; README task lists concrete sections rather than filled prose since the content depends on the finished system, which is normal for a docs task.
- **Type consistency**: `PriceProvider.getMidPrice(baseCurrency: string): Promise<number>` is used identically in Tasks 2, 4. `executeTrade(quoteId: string)` / `listTrades(limit, cursor?)` signatures from Task 5 match their usage in Task 6 (none — Task 6 only reads `Trade` via Prisma directly) and route usage in Task 5 itself.
