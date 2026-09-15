# Step 1: Project setup — what happened and why

This covers everything done to get from "nothing" to "a repo with a database,
ready for actual feature code." No app logic exists yet — this step was pure
plumbing.

## 1. Installed Postgres locally

Docker wasn't available on the machine, so instead of using
`docker-compose.yml` (the original plan), Postgres was installed directly via
Homebrew (`brew install postgresql@16`) and started as a background service
(`brew services start postgresql@16`) — it now runs automatically, including
after a restart.

A database called `miniopenfx_dev` was created inside it. This is where all
your balances, quotes, and trades will actually live once the app runs.

**Why this matters:** the app needs somewhere durable to store state (your
balances, every quote you've ever requested, every trade you've made). An
in-memory list would reset every time the server restarts — a real database
survives restarts, which is what "persistent" means.

## 2. Set up the Node.js/TypeScript project

- `package.json` — the project's manifest: its name, and the shortcut
  commands you'll run (`npm run dev` to start the server, `npm test` to run
  tests, etc.)
- `tsconfig.json` — tells TypeScript how strictly to check your code and
  where to find/output files. Strict mode is on, which catches more bugs at
  write-time instead of at runtime.
- Installed the actual libraries the app needs:
  - **express** — the web server framework that turns HTTP requests into
    function calls in your code
  - **zod** — validates incoming request data (e.g. rejects a trade request
    with a negative amount before it ever reaches your logic)
  - **@prisma/client** + **prisma** — the database toolkit (see below)
  - **vitest** + **supertest** — testing tools
  - **eslint** — flags messy or risky code patterns

## 3. Set up Prisma (the database toolkit)

Prisma lets you describe your data as a schema (in `prisma/schema.prisma`)
instead of writing raw SQL by hand. You describe *what* a `Balance`, `Quote`,
and `Trade` look like, and Prisma:
- generates a type-safe client you call from TypeScript
  (`prisma.balance.findMany()` instead of writing `SELECT * FROM ...`)
- generates and runs **migrations** — versioned scripts that create/alter the
  actual database tables to match your schema

One snag along the way: the `prisma` package installed a brand-new major
version (7) by default, which changed how the database connection is
configured in a way that's barely documented yet. That's risky for a
time-boxed, reviewer-run assignment, so it was pinned back down to the
current stable version (6.19.3) instead — same features, much better
documented, lower risk of something obscure breaking during your demo.

Running `npx prisma migrate dev --name init` then did two things:
1. Created the actual tables (`Balance`, `Quote`, `Trade`) inside
   `miniopenfx_dev`
2. Saved a record of that change under `prisma/migrations/` — so anyone who
   clones the repo (including whoever grades this) can recreate your exact
   database structure with one command

## 4. Wrote the data model

Three tables, matching the design spec:

- **Balance** — one row per currency (`USD`, `BTC`, `ETH`, `SOL`), holding
  the current amount.
- **Quote** — a "price lock" record: which currencies, which direction
  (buy/sell), the raw market price, the spread-adjusted rate you'd actually
  get, and when it expires.
- **Trade** — created only when a quote is successfully executed; records
  the final rate and the commission earned, and links back to the quote it
  came from.

## 5. Wrote the full design spec

[docs/superpowers/specs/2026-09-15-miniopenfx-design.md](../superpowers/specs/2026-09-15-miniopenfx-design.md)
is the technical reference for the whole project — every endpoint, every
error case, the exact quote/spread math, and the explicit scope decisions
(like "no auth, single account") with the reasoning behind them. This is
also the raw material you'll draw from when writing your README's
"architecture and trade-offs" section later.

## 6. Committed everything to git

One commit, containing the scaffolding and the spec — nothing app-specific
yet. `.env` (which holds your actual local database connection string) is
deliberately excluded from git via `.gitignore`, since it's local-machine
config, not something that belongs in a shared repo.

## What's next

Nothing runs yet — there's no server code, no endpoints. The next step is
turning the design spec into an ordered implementation plan (endpoint by
endpoint, with tests for each), then actually writing the code.
