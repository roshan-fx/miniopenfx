# MiniOpenFX

[![CI](https://github.com/roshan-fx/miniopenfx/actions/workflows/ci.yml/badge.svg)](https://github.com/roshan-fx/miniopenfx/actions/workflows/ci.yml)

An API-only FX/crypto-FX quoting and trading service, modeled after how
institutional FX platforms quote and settle trades. A single client can
fetch live prices for BTC, ETH, and SOL against USD (sourced from Binance),
check balances, request a time-limited quote (a frozen rate with a short
expiry), execute a trade against that specific quote, view trade history,
and see the platform's accumulated commission — the margin earned from the
spread built into every quote.

Built with Node.js, TypeScript, Express, and Postgres (via Prisma); fully
covered by an automated test suite; deployed live with CI running on every
push.

**Live demo:** https://miniopenfx-production.up.railway.app
**Loom walkthrough:** https://www.loom.com/share/87329b1444c94b16b519f8fbc13a163a

This is an API-only service — there is no homepage or UI, so the base URL
above shows nothing on its own. These are the actual API endpoints,
reachable directly (GET ones work in a browser; POST ones need curl,
Postman, or similar):

- `GET` https://miniopenfx-production.up.railway.app/health
- `GET` https://miniopenfx-production.up.railway.app/api/v1/prices
- `GET` https://miniopenfx-production.up.railway.app/api/v1/balances
- `POST` https://miniopenfx-production.up.railway.app/api/v1/quotes
- `POST` https://miniopenfx-production.up.railway.app/api/v1/trades
- `GET` https://miniopenfx-production.up.railway.app/api/v1/trades
- `GET` https://miniopenfx-production.up.railway.app/api/v1/commission

Full request/response details for each are in the [API reference](#api-reference) below.

## Contents

- [Setup](#setup)
- [Running tests](#running-tests)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Architecture](#architecture)
- [Trade-offs and scope decisions](#trade-offs-and-scope-decisions)
- [Deployment](#deployment)
- [Tech stack](#tech-stack)

## Setup

Requires Node.js 20+ and a local Postgres (Homebrew, in this case — Docker
wasn't available in development, so this uses a native Postgres install
instead of `docker-compose`).

```bash
# 1. Install and start Postgres
brew install postgresql@16
brew services start postgresql@16

# 2. Create the dev database
createdb miniopenfx_dev

# 3. Configure environment
cp .env.example .env
# Edit DATABASE_URL in .env, replacing YOUR_OS_USERNAME with your actual
# username (this assumes a local trust-auth Postgres with no password,
# which is what `brew install postgresql` sets up by default).

# 4. Install dependencies and apply the schema
npm install
npx prisma migrate dev

# 5. Seed starting balances (USD 10,000; BTC/ETH/SOL 0)
npm run db:seed

# 6. Run the server
npm run dev
```

The server listens on `http://localhost:3000` by default (`PORT` in `.env`).

## Running tests

Tests run against a separate database (`miniopenfx_test`) so they never
touch your dev data. `.env.test` holds its connection string — edit the
username in it if yours differs from the committed default.

```bash
createdb miniopenfx_test
set -a && source .env.test && set +a
npx prisma migrate deploy
npm test
```

## Project structure

```
src/
├── app.ts                    # wires routes + middleware together
├── server.ts                 # entry point — starts the HTTP server
├── config.ts                 # env-driven settings (spread, TTL, port)
├── db.ts                     # shared Prisma client
├── errors.ts                 # typed errors, each mapped to an HTTP status
├── middleware/
│   └── errorHandler.ts       # turns a thrown error into a JSON response
├── routes/                   # thin HTTP layer — one file per endpoint
│   ├── prices.ts
│   ├── balances.ts
│   ├── quotes.ts
│   ├── trades.ts
│   └── commission.ts
└── services/                 # the actual business logic, no HTTP awareness
    ├── priceProvider.ts      # Binance integration behind a swappable interface
    ├── quotes.ts             # spread/rate calculation, quote creation
    ├── trades.ts             # atomic trade execution + settlement
    ├── balances.ts
    └── commission.ts

tests/                        # one file per feature, mirrors src/
├── setup.ts                  # truncates + reseeds the test DB before each test
├── helpers/
│   └── fakePriceProvider.ts  # in-memory stand-in for Binance, used in every test
└── *.test.ts

prisma/
├── schema.prisma             # the 3 tables — see Data model below
├── migrations/                # versioned SQL, applied via `prisma migrate`
└── seed.ts                    # seeds starting balances (idempotent)

.github/workflows/ci.yml       # lint + typecheck + test, on every push
```

Routes only parse the request and call a service; services hold all the
actual logic and never import anything HTTP-related. Tests mirror this same
structure, one file per feature.

## Data model

Three Postgres tables (via Prisma), representing three different lifetimes:
`Balance` is current state, `Quote` is a temporary offer that may or may not
be taken, `Trade` is a permanent record of what actually happened.

**`Balance`** — one row per currency, the current holdings.
| Field | Type | Notes |
|---|---|---|
| `currency` | String (PK) | `"USD"`, `"BTC"`, `"ETH"`, or `"SOL"` |
| `amount` | Decimal(28,10) | Current balance |

**`Quote`** — a frozen, time-limited price offer.
| Field | Type | Notes |
|---|---|---|
| `id` | String (PK, UUID) | Referenced by `POST /trades` |
| `baseCurrency` / `quoteCurrency` | String | e.g. `BTC` / `USD` |
| `side` | `BUY` \| `SELL` | Direction of the trade |
| `amount` | Decimal(28,10) | How much `baseCurrency` |
| `midPrice` | Decimal(28,10) | Raw Binance price at quote time |
| `rate` | Decimal(28,10) | `midPrice` adjusted by the spread — the frozen, tradeable price |
| `consumed` | Boolean | Flips to `true` the moment a trade executes against it |
| `createdAt` / `expiresAt` | DateTime | `expiresAt` = `createdAt` + `QUOTE_TTL_SECONDS` |

**`Trade`** — a completed, executed transaction.
| Field | Type | Notes |
|---|---|---|
| `id` | String (PK, UUID) | |
| `quoteId` | String (FK, **unique**) | One quote can produce at most one trade — enforced at the DB level |
| `baseCurrency` / `quoteCurrency` / `side` / `amount` / `rate` | — | Copied from the quote at execution time |
| `commission` | Decimal(28,10) | `amount × \|midPrice − rate\|` |
| `executedAt` | DateTime | |

`Quote.id` ↔ `Trade.quoteId` is a 1-to-(0 or 1) relationship: a quote starts
with no trade, and either expires unused or gets exactly one trade created
against it — the `@unique` constraint on `quoteId` is what makes "trade
against the same quote twice" structurally impossible, not just an
application-level check.

## API reference

All routes are versioned under `/api/v1`. Errors share the shape
`{ "error": { "code": "...", "message": "..." } }`.

### `GET /api/v1/prices`

```bash
curl "http://localhost:3000/api/v1/prices?pairs=BTCUSD,ETHUSD"
```
```json
{ "prices": [
  { "pair": "BTCUSD", "midPrice": 62340.5 },
  { "pair": "ETHUSD", "midPrice": 2500.1 }
] }
```
Omit `?pairs=` to get all supported pairs (`BTCUSD`, `ETHUSD`, `SOLUSD`).

### `GET /api/v1/balances`

```bash
curl http://localhost:3000/api/v1/balances
```
```json
{ "balances": [
  { "currency": "BTC", "amount": "0" },
  { "currency": "ETH", "amount": "0" },
  { "currency": "SOL", "amount": "0" },
  { "currency": "USD", "amount": "10000" }
] }
```

### `POST /api/v1/quotes`

```bash
curl -X POST http://localhost:3000/api/v1/quotes \
  -H "Content-Type: application/json" \
  -d '{"baseCurrency":"BTC","quoteCurrency":"USD","side":"BUY","amount":0.1}'
```
```json
{
  "id": "b6dc93c0-5ca2-4c43-80b6-46fa224e1404",
  "baseCurrency": "BTC", "quoteCurrency": "USD", "side": "BUY",
  "amount": "0.1", "midPrice": "62340.5", "rate": "62402.8405",
  "consumed": false,
  "createdAt": "2026-09-15T07:03:23.967Z",
  "expiresAt": "2026-09-15T07:03:33.964Z"
}
```
`rate` is frozen at creation time (mid-price adjusted by a 0.1% spread —
buy above mid, sell below) and expires 30 seconds later. Both are
configurable via `QUOTE_SPREAD` / `QUOTE_TTL_SECONDS`.

### `POST /api/v1/trades`

```bash
curl -X POST http://localhost:3000/api/v1/trades \
  -H "Content-Type: application/json" \
  -d '{"quoteId":"b6dc93c0-5ca2-4c43-80b6-46fa224e1404"}'
```
```json
{
  "id": "ad421e9f-01c5-414b-8d9b-be18c398fa62",
  "quoteId": "b6dc93c0-5ca2-4c43-80b6-46fa224e1404",
  "baseCurrency": "BTC", "quoteCurrency": "USD", "side": "BUY",
  "amount": "0.1", "rate": "62402.8405", "commission": "6.23405",
  "executedAt": "2026-09-15T07:03:23.971Z"
}
```
Executes the trade at the exact rate the quote locked in, updates
balances, and permanently marks the quote as used.

**Error cases:**
| Condition | Status | `error.code` |
|---|---|---|
| Invalid request body | 400 | `VALIDATION_ERROR` |
| Quote ID doesn't exist | 404 | `NOT_FOUND` |
| Quote expired or already used | 410 | `GONE` |
| Balance can't cover the trade | 422 | `INSUFFICIENT_BALANCE` |
| Binance is unreachable | 502 | `UPSTREAM_ERROR` |

### `GET /api/v1/trades`

```bash
curl "http://localhost:3000/api/v1/trades?limit=20"
```
```json
{
  "trades": [
    {
      "id": "098f7b27-505c-425c-92b7-b39bed390b2b",
      "quoteId": "288ba528-7a56-4b93-b4f2-dbfe1c221660",
      "baseCurrency": "BTC", "quoteCurrency": "USD", "side": "BUY",
      "amount": "0.1", "rate": "76492.42601", "commission": "7.641601",
      "executedAt": "2026-09-15T15:35:38.291Z"
    }
  ],
  "nextCursor": null
}
```
Paginated, most recent first. Pass `nextCursor` back as `?cursor=` to get
the next page.

### `GET /api/v1/commission`

```bash
curl http://localhost:3000/api/v1/commission
```
```json
{ "totalCommission": 6.23405, "currency": "USD", "tradeCount": 1 }
```
Sums the platform's earned margin (the spread baked into every quote)
across all executed trades.

## Architecture

```
Client -> MiniOpenFX API (Express + TypeScript)
              |                  |
              v                  v
        Binance API         Postgres (Prisma)
     (live price feed)   (balances, quotes, trades)
```

- **Quote-then-trade, not instant execution.** A client first requests a
  quote (frozen rate + short expiry), then executes a trade against that
  specific quote. This mirrors real institutional FX platforms, where you
  never trade against a price that could have moved since you last looked
  — and it's what makes "expiry handling" (an explicit grading criterion)
  a real, testable behavior instead of an afterthought.
- **Spread-based commission.** BUY quotes price at `mid × (1 + spread)`,
  SELL quotes at `mid ÷ (1 + spread)`. The gap between the raw market
  price and the quoted rate is the platform's margin, recorded per-trade
  and summable via `/commission`.
- **Atomic trade settlement.** Executing a trade happens inside one
  database transaction that atomically flips the quote from
  `consumed: false` to `true` (and checks that flip actually changed a
  row) before touching any balance — this closes the race window where
  two concurrent requests could both try to spend the same quote.
- **Dependency-injected price source.** `PriceProvider` is an interface;
  `BinancePriceProvider` is the real implementation, `FakePriceProvider`
  is used in every test. No test ever makes a real network call.

## Trade-offs and scope decisions

- **No authentication, single implicit account.** The assignment doesn't
  require multi-tenancy, and building auth would have traded time away
  from the API/data-modeling work that's actually being evaluated. With
  more time, this would be the first thing to add (likely API-key based,
  rather than full user accounts).
- **Fixed currency set** (USD, BTC, ETH, SOL) rather than every symbol
  Binance lists — keeps balance seeding and demoing straightforward.
- **`midPrice` is Binance's last-traded price**, not a true bid/ask
  average — close enough in practice on liquid pairs like BTCUSDT, but
  worth naming as a simplification rather than pretending it's a precise
  order-book mid.
- **No platform-side ledger.** Only the client's balances are tracked;
  MiniOpenFX's own inventory position isn't modeled as a balance, only
  its commission revenue. A fuller build would track the platform's
  offsetting position too.
- **Business-logic math is floating-point**, layered on top of `Decimal`
  storage (chosen specifically to avoid rounding errors in persisted
  balances). Acceptable at this scale; a production system would use a
  decimal library consistently end-to-end instead of converting to
  `Number` for the arithmetic.
- **Prisma pinned to 6.x**, not 7.x — Prisma 7 changed how the database
  connection is configured (a new `prisma.config.ts`/driver-adapter
  pattern) in a way that's still thinly documented; 6.x is the better-
  understood, lower-risk choice for a time-boxed, reviewer-run project.

## Deployment

Deployed on Railway: a Node service (this repo, auto-deployed from
GitHub) plus a managed Postgres add-on in the same project.

- **Start command**: `npx prisma migrate deploy && npm run db:seed && npm start`
  — every deploy applies any pending migrations and re-runs the (safely
  idempotent) seed script before the server starts, so there's no separate
  manual migration step against production.
- **Env vars**: `DATABASE_URL` (referenced from the Postgres add-on),
  `QUOTE_SPREAD`, `QUOTE_TTL_SECONDS`. `PORT` is left unset — Railway
  injects its own, which `config.ts` already reads.
- **A real production issue, found and fixed**: `api.binance.com` returned
  `451 Unavailable For Legal Reasons` from Railway's hosting region — this
  worked fine locally but failed the moment it was live, since Binance
  geo-blocks some hosting regions even for public price data. Fixed by
  switching to `data-api.binance.vision`, Binance's documented public,
  read-only market-data mirror, which isn't subject to the same
  restriction. One-line change, verified against the live deployment
  afterward.

## Tech stack

Node.js, TypeScript, Express 5, Prisma 6 + Postgres, Zod, Vitest +
Supertest, GitHub Actions.
