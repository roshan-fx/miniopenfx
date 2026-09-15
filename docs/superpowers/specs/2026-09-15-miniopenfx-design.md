# MiniOpenFX — Design Spec

## Overview

MiniOpenFX is an API-only FX/crypto-FX quoting and trading service. A single
client can fetch live prices, view balances, request a quote, execute a trade
against that quote, and view trade history. The design favors clarity,
correctness, and simplicity over completeness, per the assignment's stated
grading priorities.

## Scope decisions (explicit assumptions)

- **No authentication, single implicit account.** The assignment does not
  require multi-tenancy. Modeling one account keeps the focus on API design,
  data modeling, and trade correctness rather than auth plumbing.
- **Fixed currency set**: USD (base, seeded at 10,000, treated as pegged 1:1
  to USDT for pricing purposes), BTC, ETH, SOL. All non-USD currencies start
  at a balance of 0. All trades are `{crypto} <-> USD`.
- **Prices sourced from Binance** (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`), no API
  key required for public market data endpoints.
- **In scope for this build**: unit/API tests, GitHub Actions CI, public
  deployment (bonus/extra-credit items from the assignment).

## Architecture

```
Client -> MiniOpenFX API (Express + TypeScript)
              |                  |
              v                  v
        Binance API         Postgres (Prisma)
     (live price feed)   (balances, quotes, trades)
```

- **Runtime**: Node.js + TypeScript, Express for HTTP, Zod for request
  validation.
- **Persistence**: Postgres via Prisma 6 (schema-based `url=env(...)`
  config — Prisma 7's new `prisma.config.ts`/driver-adapter pattern was
  considered and rejected as too new/undocumented for a time-boxed,
  reviewer-run assignment).
- **Testing**: Vitest + Supertest. The Binance client is mocked in tests —
  no real network calls in the test suite or CI.
- **CI**: GitHub Actions runs install → lint → typecheck → test on every
  push/PR.
- **Deployment**: a public hosting provider (e.g. Railway) with a managed
  Postgres add-on, giving a public URL for the extra-credit item.

## Data model (Prisma schema)

```prisma
enum Side { BUY  SELL }

model Balance {
  currency String  @id
  amount   Decimal @db.Decimal(28, 10)
}

model Quote {
  id            String   @id @default(uuid())
  baseCurrency  String
  quoteCurrency String
  side          Side
  amount        Decimal  @db.Decimal(28, 10)
  midPrice      Decimal  @db.Decimal(28, 10)   // raw Binance price, pre-spread
  rate          Decimal  @db.Decimal(28, 10)   // spread-adjusted, frozen rate
  consumed      Boolean  @default(false)
  createdAt     DateTime @default(now())
  expiresAt     DateTime
  trade         Trade?
}

model Trade {
  id            String   @id @default(uuid())
  quoteId       String   @unique
  quote         Quote    @relation(fields: [quoteId], references: [id])
  baseCurrency  String
  quoteCurrency String
  side          Side
  amount        Decimal  @db.Decimal(28, 10)
  rate          Decimal  @db.Decimal(28, 10)   // copied from quote at execution
  commission    Decimal  @db.Decimal(28, 10)   // amount * |midPrice - rate|
  executedAt    DateTime @default(now())
}
```

A `Quote` has at most one `Trade` (1:1, enforced by the unique `quoteId`),
matching the "a quote can be consumed exactly once" rule.

## API (versioned under `/api/v1`)

### `GET /api/v1/prices?pairs=BTCUSD,ETHUSD,SOLUSD`
Fetches current mid-prices from Binance for the requested pairs (defaults to
all supported pairs if `pairs` is omitted).

**200**: `{ prices: [{ pair: "BTCUSD", midPrice: 62340.50 }, ...] }`

### `GET /api/v1/balances`
Returns the current balance for every supported currency.

**200**: `{ balances: [{ currency: "USD", amount: 10000 }, ...] }`

### `POST /api/v1/quotes`
Request body: `{ baseCurrency: "BTC", quoteCurrency: "USD", side: "BUY", amount: 0.1 }`

Computes:
- `midPrice` = live Binance price for the pair
- `rate` = `side === "BUY" ? midPrice * (1 + SPREAD) : midPrice / (1 + SPREAD)`
  (`SPREAD` = 0.001 / 0.1%, configurable via `QUOTE_SPREAD` env var)
- `expiresAt` = `now + QUOTE_TTL_SECONDS` (default 10s)

Persists a `Quote` row and returns it.

**201**: `{ quoteId, baseCurrency, quoteCurrency, side, amount, rate, expiresAt }`
**400**: invalid body (bad currency, non-positive amount, etc.)
**502**: Binance price fetch failed

### `POST /api/v1/trades`
Request body: `{ quoteId: "..." }`

1. Look up the quote. `404` if it doesn't exist.
2. `410 Gone` if `now > expiresAt` or `consumed === true`.
3. Compute required balance debit; `422` if insufficient.
4. In one DB transaction: debit/credit the two currency balances, mark the
   quote `consumed`, insert a `Trade` row with
   `commission = amount * abs(midPrice - rate)`.

**Settlement direction** (`amount` is always denominated in `baseCurrency`,
e.g. BTC):
- `BUY`: debit `amount * rate` of `quoteCurrency` (USD), credit `amount` of
  `baseCurrency`. Insufficient-balance check is against the USD balance.
- `SELL`: debit `amount` of `baseCurrency`, credit `amount * rate` of
  `quoteCurrency` (USD). Insufficient-balance check is against the base
  currency balance.

**201**: `{ tradeId, baseCurrency, quoteCurrency, side, amount, rate, commission, executedAt }`
**404**: quote not found
**410**: quote expired or already used
**422**: insufficient balance

### `GET /api/v1/trades?limit=&cursor=`
Paginated trade history, most recent first.

**200**: `{ trades: [...], nextCursor: "..." | null }`

### `GET /api/v1/commission`
Platform revenue view — sums `commission` across all trades.

**200**: `{ totalCommission: 12.34, currency: "USD", tradeCount: 7 }`

## Error handling conventions

| Situation | Status |
|---|---|
| Request body fails Zod validation | `400` |
| Quote/trade id not found | `404` |
| Quote expired or already consumed | `410` |
| Insufficient balance for trade | `422` |
| Binance upstream failure/timeout | `502` |

All error responses share a shape: `{ error: { code, message } }`.

## Testing plan

- Unit: quote rate calculation (buy above mid, sell below mid, using the
  reciprocal spread formula), commission calculation.
- API/integration (Supertest, mocked Binance client, real test Postgres):
  - happy path: quote -> trade -> balances updated -> appears in history
  - expired quote is rejected (410)
  - already-consumed quote is rejected (410)
  - insufficient balance is rejected (422)
  - invalid request bodies are rejected (400)
  - trade history pagination
  - commission total sums correctly across multiple trades

## Out of scope

- Authentication / multi-user accounts
- Order book / partial fills / limit orders (every trade is a single
  quote-and-execute unit)
- Currency pairs beyond USD/BTC/ETH/SOL
- Rate limiting, request throttling
