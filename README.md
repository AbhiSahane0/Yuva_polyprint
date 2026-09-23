# Yuva Polyprint — Manufacturing ERP

Flexible packaging manufacturing ERP: quotation → order → planning → multi-stage
production → quality/waste → costing → dispatch, with full job-level traceability.

> **Status: in use, and being built out module by module.** Quoting, costing,
> rates, stock, buying, the cylinder register, job sheets, orders and the
> production floor are
> implemented and verified against the works' own paperwork — seven of their
> 2022 quotations reproduce to the paisa, and all fourteen tabs of their
> September job-sheet workbook cost exactly. Planning, production, quality,
> dispatch and reporting are not built yet; they are added one at a time as each
> is confirmed in scope.
>
> | Built                                                                                                                                                                                       | Not yet                                                                                                            |
> | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
> | Customers · **Quotations** · **Orders** · **Production** · **Employees** · Rates · Costing · Inventory · Purchase · Design & cylinders · Artwork · **Job sheets** · Users · Sign-in monitor | Planning · Product master · Quality & waste · Machines · Warehouse · Dispatch · Reports · Overview · Operator view |

---

## Table of contents

- [Stack](#stack)
- [Getting started](#getting-started)
- [Folder structure](#folder-structure)
  - [Repository root](#repository-root)
  - [`packages/shared`](#packagesshared)
  - [`apps/api`](#appsapi)
  - [`apps/web`](#appsweb)
- [Where does my code go?](#where-does-my-code-go)
- [Scripts](#scripts)
- [Signing in](#signing-in)
- [Emailing a quotation](#emailing-a-quotation)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Adding a module end to end](#adding-a-module-end-to-end)
- [Notes and known issues](#notes-and-known-issues)

---

## Stack

| Layer    | Choice                                                              |
| -------- | ------------------------------------------------------------------- |
| Web      | React 19, Vite 8, TypeScript, Tailwind CSS v4, TanStack Query v5    |
|          | React Router v7, React Hook Form + Zod, Zustand, lucide-react       |
| API      | Node 22, Express 5, TypeScript, Prisma 7 (`pg` driver adapter), Zod |
|          | pino logging, helmet, CORS, rate limiting, session auth (scrypt)    |
| Database | PostgreSQL 17                                                       |
| Tooling  | npm workspaces, ESLint flat config, Prettier, Vitest, Husky, CI     |

---

## Getting started

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
```

Start PostgreSQL (requires Docker Desktop to be running):

```bash
npm run db:up
```

Apply migrations, then start all three workspaces:

```bash
npm run db:migrate
```

```bash
npm run dev
```

Create an administrator, or there is no way to sign in:

```bash
ADMIN_USERNAME=you ADMIN_PASSWORD='choose-a-real-one' ADMIN_NAME='Your Name' npm run seed:admin -w @yuva/api
```

| Service | URL                          |
| ------- | ---------------------------- |
| Web     | http://localhost:5173        |
| API     | http://localhost:4000        |
| Health  | http://localhost:4000/health |
| Adminer | http://localhost:8080        |

---

## Folder structure

Three workspaces in one npm-workspaces monorepo:

```
Yuva_polyprint/
├── apps/
│   ├── api/          Express + Prisma REST API
│   └── web/          React single-page application
└── packages/
    └── shared/       contracts imported by BOTH api and web
```

**Why a monorepo.** The API and the client share request/response shapes. Keeping
them in one repo with a shared package means a contract change breaks the build
at compile time instead of breaking production at runtime. npm workspaces was
chosen over Turborepo/Nx deliberately — it is built into npm and there is no
extra build tool to maintain.

### Repository root

```
├── package.json              workspace definitions + orchestration scripts
├── package-lock.json         single lockfile for all three workspaces
├── tsconfig.base.json        strict compiler options every workspace extends
├── eslint.config.mjs         ESLint flat config for the whole monorepo
├── .prettierrc.json          formatting rules
├── .prettierignore           paths Prettier skips (dist, generated client)
├── .editorconfig             editor-level whitespace rules
├── .nvmrc                    pinned Node version (22.20.0)
├── .gitignore                ignores node_modules, dist, .env, generated client
├── docker-compose.yml        local PostgreSQL 17 + Adminer
├── .github/workflows/ci.yml  lint → format → typecheck → test → build on PRs
├── .husky/
│   ├── pre-commit            runs lint-staged on staged files
│   └── pre-push              runs typecheck across all workspaces
└── .vscode/
    ├── settings.json         format-on-save, workspace TypeScript SDK
    └── extensions.json       recommended extensions (ESLint, Tailwind, Prisma)
```

`tsconfig.base.json` is where strictness lives — including
`noUncheckedIndexedAccess` and `noImplicitReturns`. Every workspace extends it
rather than redefining its own rules, so strictness cannot silently drift
between the API and the client.

### `packages/shared`

Contracts used by **both** sides. This package must stay free of business logic
and of any dependency on Express, React, or Prisma.

```
packages/shared/
├── package.json
├── tsconfig.json             composite build → dist/ (consumed as a real package)
└── src/
    ├── index.ts              barrel export — the package's entire public surface
    ├── constants/
    │   ├── roles.ts          the 7 platform roles + display labels
    │   ├── http.ts           HTTP_STATUS map and stable ERROR_CODE values
    │   └── pagination.ts     default page size and the max page size cap
    ├── types/
    │   ├── api.ts            ApiSuccess / ApiFailure / ApiResponse envelopes
    │   └── pagination.ts     PaginationMeta and Paginated<T>
    └── schemas/
        └── common.ts         reusable Zod schemas (id param, pagination, sort)
```

**Why `ERROR_CODE` matters.** The client branches on the machine-readable `code`,
never on the human-readable `message`. That means error copy can be reworded — or
translated — without breaking client logic.

This package is built to `dist/` and consumed as a real dependency, so imports
read `@yuva/shared`, not `../../../packages/shared/src`. `npm run dev` runs its
compiler in watch mode so changes propagate live.

### `apps/api`

```
apps/api/
├── package.json
├── tsconfig.json
├── vitest.config.ts          node environment, serial file execution
├── Dockerfile                multi-stage, non-root production image
├── .env.example              every variable the API reads, documented
├── prisma.config.ts          Prisma 7 config — datasource URL comes from env
├── prisma/
│   └── schema.prisma         datasource, generator, and modelling conventions
└── src/
    ├── server.ts             entry point: boot, listen, graceful shutdown
    ├── app.ts                Express app factory (no port binding)
    ├── app.test.ts           smoke tests for the application shell
    ├── config/
    │   └── env.ts            Zod-validated environment, parsed once at boot
    ├── lib/
    │   ├── prisma.ts         PrismaClient singleton + pg driver adapter
    │   ├── password.ts       scrypt hashing and constant-time verification
    │   ├── storage.ts        Cloudflare R2 — signs URLs, never moves bytes
    │   └── logger.ts         pino instance with credential redaction
    ├── middleware/
    │   ├── authenticate.ts   session lookup + requireAdmin / requireModule
    │   ├── validate.ts       Zod validation for body / query / params
    │   ├── error-handler.ts  404 fallback + terminal error handler
    │   ├── rate-limit.ts     baseline API limiter + stricter auth limiter
    │   └── request-logger.ts per-request correlation id and one log line
    ├── routes/
    │   ├── index.ts          the /api surface map — modules register here
    │   └── health.route.ts   liveness (/health) and readiness (/health/ready)
    ├── utils/
    │   ├── api-error.ts      ApiError with named constructors
    │   ├── api-response.ts   ok / created / noContent / paginated helpers
    │   └── async-handler.ts  promise-rejection forwarding for handlers
    ├── types/
    │   └── express.d.ts      augments Express.Request with `user`
    ├── modules/              ← business modules live here (see its README)
    ├── scripts/              one-off and seeding scripts (seed:costing, …)
    └── generated/            Prisma client output — git-ignored, never edited
```

**`app.ts` is split from `server.ts` on purpose.** `createApp()` returns a
configured Express app without binding a port, so tests can drive the full
middleware stack in-process via supertest — no ports, no teardown races.

**Request lifecycle.** A request passes through helmet → CORS → compression →
body parsing → request logger (assigns the correlation id) → rate limiter →
route → `validate` → controller → service. Anything thrown lands in
`error-handler.ts`, which is the single place that formats a failure response.

**Layering rule:** `routes → controller → service → repository/Prisma`.
Controllers never contain business logic; services never touch `req`/`res`.

### `apps/web`

```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts            React + Tailwind plugins, @ alias, /api dev proxy
├── index.html                SPA entry document
├── nginx.conf                production SPA routing + cache headers
├── Dockerfile                multi-stage build → nginx
├── .env.example              VITE_ variables (these are PUBLIC — never secrets)
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx              React root mount
    ├── App.tsx               composes providers + router
    ├── App.test.tsx          render smoke test
    ├── app/
    │   ├── providers.tsx     QueryClientProvider, BrowserRouter, devtools
    │   ├── query-client.ts   TanStack Query defaults and retry policy
    │   └── router.tsx        the route map — features register here
    ├── components/
    │   ├── ui/               generic primitives: Button, Input, Modal, Table
    │   └── layout/           AppShell — sidebar on desktop, drawer on mobile
    ├── features/             ← business features live here (see its README)
    ├── hooks/                cross-feature hooks only
    ├── lib/
    │   ├── api-client.ts     Axios instance, interceptors, ApiClientError
    │   ├── download.ts       saveBlob / openBlobUrl for fetched files
    │   ├── toast.ts          tiny Zustand store
    │   └── utils.ts          cn() — Tailwind-aware class merging
    ├── config/
    │   └── env.ts            validated VITE_ variables
    ├── styles/
    │   └── index.css         Tailwind v4 @theme — the design tokens
    ├── types/
    ├── assets/
    └── test/
        └── setup.ts          jest-dom matchers for Vitest
```

**`src/app/` vs `src/features/`.** `app/` is application wiring that exists once
— providers, the router, the query client. `features/` is business
functionality, one folder per module. Wiring never contains business logic.

**`components/ui/` vs `features/*/components/`.** If it has no idea what an
order is, it belongs in `ui/`. If it renders an order, it belongs to the feature.
Promote to `ui/` only when a second feature genuinely needs it.

**`styles/index.css` is the design system.** Tailwind v4 is configured in CSS via
`@theme` — there is no `tailwind.config.js`. The tokens are carried over from the
approved wireframe, so `bg-brand-600` and `text-ink-500` are the vocabulary.
Never hardcode hex values in components.

**Client env vars are public.** Anything prefixed `VITE_` is inlined into the
bundle and readable by any visitor. Never put a secret in `apps/web/.env`.

---

## Where does my code go?

| What you are writing                       | Where it goes                                 |
| ------------------------------------------ | --------------------------------------------- |
| A request/response shape both sides use    | `packages/shared/src/`                        |
| A database table                           | `apps/api/prisma/schema.prisma`               |
| An API endpoint                            | `apps/api/src/modules/<module>/`              |
| Business rules, calculations, transactions | `<module>.service.ts`                         |
| Something every endpoint needs             | `apps/api/src/middleware/`                    |
| A screen                                   | `apps/web/src/features/<feature>/pages/`      |
| A data-fetching hook                       | `apps/web/src/features/<feature>/api/`        |
| A reusable button/input/modal              | `apps/web/src/components/ui/`                 |
| A component only one feature uses          | `apps/web/src/features/<feature>/components/` |
| A colour, radius, or font size             | `apps/web/src/styles/index.css`               |

---

## Scripts

Run from the repository root.

| Script                            | Does                                           |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | shared (watch) + API + web concurrently        |
| `npm run build`                   | builds shared → API → web, in dependency order |
| `npm run typecheck`               | typechecks every workspace                     |
| `npm run lint` / `lint:fix`       | ESLint across the monorepo                     |
| `npm run format` / `format:check` | Prettier write / verify                        |
| `npm test`                        | Vitest in every workspace                      |
| `npm run db:up` / `db:down`       | start / stop the Postgres container            |
| `npm run db:migrate`              | create and apply a migration                   |
| `npm run db:studio`               | open Prisma Studio                             |
| `npm run db:generate`             | regenerate the Prisma client                   |
| `npm run clean`                   | remove all node_modules and build output       |

Workspace scripts worth knowing:

| Script                                          | Does                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run seed:admin -w @yuva/api`               | create the first administrator (refuses if one exists)                 |
| `npm run seed:materials -w @yuva/api`           | seed the material catalogue                                            |
| `npm run seed:costing -w @yuva/api`             | machines, wages and ink figures for the rate costing                   |
| `npm run seed:excel-rates -w @yuva/api`         | bring rates and master data to the client's own workbook               |
| `npm run schema:docs -w @yuva/api`              | regenerate `docs/database-schema.md` from the live database            |
| `npm run db:copy-to-remote -w @yuva/api`        | copy local data up to Neon                                             |
| `npm run import:legacy -w @yuva/api`            | import the legacy spreadsheet                                          |
| `npm run check:job-sheets -w @yuva/api`         | cost the works' job-sheet workbook and check all fourteen              |
| `npm run seed:job-sheet-materials -w @yuva/api` | the ten materials the job sheet needs                                  |
| `npm run quote:job-sheets -w @yuva/api`         | quote the works' own finished jobs and check the quote covers the cost |

---

## Database schema

A diagram and full column reference live in
[`docs/database-schema.md`](./docs/database-schema.md) — GitHub renders the ER
diagram inline. For an interactive version you can drag around and export,
paste [`docs/database-schema.dbml`](./docs/database-schema.dbml) into
[dbdiagram.io](https://dbdiagram.io/d).

Both are generated from the live database, never written by hand:

```bash
npm run schema:docs -w @yuva/api
```

Re-run it after any migration and commit the result.

---

## Legacy data import

The May-2025 "Jobs Data" sheet in `csv_files/` is loaded by a dedicated script.
`csv_files/` is git-ignored (it holds client data), so the sheet must be present
locally for the import to run.
It splits the sheet's combined `Comapny Name, Address & Mobile` column into
separate company / address / mobile / alt-phone fields, adds an `email` column,
and loads all job rows with their specs.

```bash
npm run import:legacy -w @yuva/api -- --dry-run
```

```bash
npm run import:legacy -w @yuva/api
```

`--dry-run` prints the parse and writes nothing. A plain run refuses to proceed
if the tables already hold data; `--fresh` replaces them. Every skipped row and
every customer needing human review is written to
`apps/api/import-reports/legacy-jobs-report.json`.

Text columns are filled with the literal `'NA'` where the sheet was blank.
Numeric columns use `NULL` instead — `'NA'` is not a number, and values the
sheet stores as ranges (`"15-16"`, `"60-70"`) are kept in their own text columns.

---

## Documentation

Each app documents itself, next to the code it describes:

| Document                                                                               | Covers                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/api/README.md`](./apps/api/README.md)                                           | Every endpoint, the request/response envelope, **all the calculations with worked examples**, the job sheet and what a run actually cost, **orders and the status rules**, the data model, and the scripts |
| [`apps/web/README.md`](./apps/web/README.md)                                           | Every screen and what it does, how server state is handled, which figures are previewed in the browser, and the UI components                                                                              |
| [`docs/quotation-module.md`](./docs/quotation-module.md)                               | **The whole quotation, in plain words** — every input and what it does to the price, the rate chain step by step, why a bigger order is now cheaper, and what to say to the client                         |
| [`apps/web/src/features/costing/README.md`](./apps/web/src/features/costing/README.md) | **The Costing screen, figure by figure** — what each machine, wage, overhead and method switch means, what it moves, and what is not on the screen at all                                                  |
| [`docs/job-sheet-module.md`](./docs/job-sheet-module.md)                               | **The job sheet, in plain words** — the mix drums, the overheads, the wastage check, how it replaces the spreadsheet, and a worked example from drums to cost a kilogram                                   |
| [`docs/old-quotation-check.md`](./docs/old-quotation-check.md)                         | **Seven of the works' own 2022 quotations, rebuilt here and matched to the paisa** — what was entered on each, what came out, and the two figures that changed over time                                   |
| [`docs/stations.md`](./docs/stations.md)                                               | **Printing stations** — what one is, what decides how many a job has when there is no artwork yet, and what each one adds to the rate and the cylinder bill                                                |
| [`docs/setup.md`](./docs/setup.md)                                                     | **What to enter before the first quotation** — machines, wages, films, inks, adhesive and the overheads, in dependency order, and what goes wrong quietly when one is missed                               |
| [`docs/formulas.md`](./docs/formulas.md)                                               | **Every formula in one place** — the laminate, the pouch, the cylinder, the rate, GST and the advance, each against the cell it answers to in the client's workbook                                        |
| [`docs/database-schema.md`](./docs/database-schema.md)                                 | ER diagram and full column reference, generated from the live database                                                                                                                                     |

Start with [`docs/quotation-module.md`](./docs/quotation-module.md) if you want
the explanation, or [`docs/formulas.md`](./docs/formulas.md) if you want the
reference — the first says what each figure means and why, the second says
exactly how it is worked out. It is the reference: every figure in order,
with a worked example that ties out against the client's own spreadsheet to the
paisa, and a list of which numbers the office can change and where. The API's
[Calculations](./apps/api/README.md#calculations) section covers the same ground
with more of the reasoning behind each choice.

---

## Signing in

The app is behind a username and password. There is no JWT, no OTP and no social
sign-in — a session is an opaque token stored server-side, which means an admin
can revoke it instantly.

Create the first administrator once, then add everyone else from the Users
screen:

```bash
ADMIN_USERNAME=anand ADMIN_PASSWORD='choose-a-real-one' ADMIN_NAME='Anand Hase' npm run seed:admin -w @yuva/api
```

The script refuses to run if an active administrator already exists.

**Access is two tiers and no more.** An administrator sees everything and manages
users; everyone else sees only the sections ticked for them — Customers,
Quotations, Rates (which carries Costing), Inventory, Purchase, Design &
Cylinders (which carries its artwork), Jobs. The sidebar
hides the rest, and the API refuses it independently, because hiding a link is
not access control.

**A button belongs to what it changes, not to the screen it sits on.** Deleting
a material is on the Inventory screen as well as Rates, and on both it needs the
**rates** module — it is a change to the price list. Somebody who may record a
stock movement should not thereby be able to remove the material the movement
was against.

Full detail, including how sessions and passwords are stored:
[`apps/api/README.md`](./apps/api/README.md#authentication-and-access).

---

## Emailing a quotation

The Quotations screen can send a quotation to the customer with the PDF
attached, through [Resend](https://resend.com). The customer's saved address is
filled in automatically, and more can be typed in.

Set `RESEND_API_KEY` and `MAIL_FROM` in `apps/api/.env`. It is optional — with
no key the rest of the app is unaffected and only this action reports that email
is unavailable.

**One thing decides whether this works for real customers.**
`onboarding@resend.dev` needs no domain but Resend will only deliver to the
address that owns the Resend account. Sending to a customer needs `MAIL_FROM` on
a domain verified in the Resend dashboard. `delivered@resend.dev` tests the
whole path without emailing anybody.

Full detail:
[`apps/api/README.md`](./apps/api/README.md#sending-quotations-by-email).

---

## Deployment

The API runs on **Render** as a Docker container, the web app on **Vercel** as
static files, and the database is **Neon**. The browser only ever talks to the
Vercel domain.

```
browser ──► Vercel (static React)
              │  /api/*  rewritten at the edge
              ▼
            Render (Express + Chromium)
              │
              ▼
            Neon (Postgres, us-east-2)
```

**Why the rewrite.** `vercel.json` proxies `/api/*` to Render, so to the
browser every request is same-origin. There is no CORS to configure, no
preflight round-trip, and no API URL baked into the bundle — `VITE_API_BASE_URL`
keeps its default of `/api` in every environment, exactly as in development.

### Files

| File                                           | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| [`apps/api/Dockerfile`](./apps/api/Dockerfile) | Three-stage build for the API image                   |
| [`render.yaml`](./render.yaml)                 | Render Blueprint — service, region, health check      |
| [`vercel.json`](./vercel.json)                 | Vercel build and the `/api` rewrite                   |
| [`.dockerignore`](./.dockerignore)             | Keeps host `node_modules` and `.env` out of the image |

### Deploying the API (Render)

1. Render → **New → Blueprint** → pick this repository. It reads `render.yaml`.
2. **Leave Root Directory blank.** This is a monorepo — the API build needs the
   root `package-lock.json` and `packages/shared`, both above `apps/api`. If
   Root Directory is set to `apps/api`, the build context becomes `apps/api` and
   every `COPY` in the Dockerfile fails with `not found`. In the dashboard the
   correct settings are:

   | Field                          | Value                 |
   | ------------------------------ | --------------------- |
   | Root Directory                 | _blank_               |
   | Dockerfile Path                | `apps/api/Dockerfile` |
   | Docker Build Context Directory | `.`                   |

3. Fill in the prompted values:

   | Variable         | Value                                                                                                                                                                                           |
   | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`   | Neon **pooled** endpoint (host contains `-pooler`)                                                                                                                                              |
   | `DIRECT_URL`     | Neon **direct** endpoint — boot migrations need it                                                                                                                                              |
   | `CORS_ORIGINS`   | the Vercel origins, comma-separated — see [Two ways the browser can reach the API](#two-ways-the-browser-can-reach-the-api). Only omit this if you switch to the proxied setup                  |
   | `RESEND_API_KEY` | Optional. Enables emailing a quotation; without it every other screen still works                                                                                                               |
   | `MAIL_FROM`      | The sender, e.g. `Yuva Polyprint <quotations@yourdomain.com>`. **Decides whether customers can be emailed at all** — see [Sending quotations](./apps/api/README.md#sending-quotations-by-email) |
   | `GSTIN_API_KEY`  | Optional. Enables the **Verify** button on a GST number; the offline format and check-digit validation works without it                                                                         |
   | `R2_*`           | Optional as a **set** of four — see [Design files live in Cloudflare R2](./apps/api/README.md#design-files-live-in-cloudflare-r2). Enables uploading artwork against a design                   |

   Those are optional. Leave them unset and the app runs normally, with only
   "send quotation", "verify GSTIN" and the artwork panel reporting themselves
   unavailable. `GSTIN_API_BASE_URL` is fixed in `render.yaml` and needs no
   prompt.

   The R2 keys are all four or none: three out of four boots happily and then
   fails on the first upload with a signing error nobody can trace back to a
   missing variable, so that is refused at boot instead. The bucket also needs a
   CORS rule naming the Vercel origin, or uploads fail at the preflight — the
   API README has the policy to paste in.

4. Wait for the first build. It is slow — the image is ~1.8GB, mostly Chromium.
5. Confirm `https://<service>.onrender.com/health/ready` returns
   `{"status":"ready","database":"connected"}`.

**The API documents itself at `/docs`.** Once deployed, `https://<service>.onrender.com/docs`
is a browsable, testable reference and `/docs/openapi.json` is the spec behind it.
Both are open — reading changes nothing and every endpoint they describe answers
401 without a session — so the URL can be handed to a developer as-is. There is
no sandbox, though: **Try it out writes to production.**

> **Order matters when a migration adds a required column.** Migrations run on
> boot, so pushing applies them — but running one by hand _ahead_ of the deploy
> leaves the live build unable to write the new column. The gazette migration
> added `film_width_mm` as `NOT NULL` with no default, and until the matching
> code shipped, saving a quotation failed. Apply by pushing, or apply by hand
> and deploy immediately after.

**Migrations run on boot.** The container runs `prisma migrate deploy` before
starting the server, so a deploy can never serve against an older schema.
`migrate deploy` only applies pending migrations — it never resets or drops.

### Two ways the browser can reach the API

Pick one and set it deliberately. The difference is one environment variable.

|                               | **Direct** (current)                     | **Proxied**                                   |
| ----------------------------- | ---------------------------------------- | --------------------------------------------- |
| `VITE_API_BASE_URL` on Vercel | `https://<service>.onrender.com/api`     | unset (defaults to `/api`)                    |
| `CORS_ORIGINS` on Render      | must list the Vercel origins             | not needed                                    |
| `vercel.json` rewrite         | unused                                   | carries every `/api` call                     |
| Slow requests                 | limited only by the API                  | must finish inside Vercel's ~30s edge timeout |
| Session token                 | header — files must be fetched by script | header today; a cookie becomes possible       |

**Direct is the right default for this app, because of the PDF.** Rendering a
quotation takes **15–20 seconds** on Render's free tier — Chromium has to lay
the document out — and longer from cold. Proxying that through Vercel puts it
under an edge timeout it can genuinely exceed, turning a slow preview into a
failed one. Direct calls have no such ceiling.

Proxied is simpler where every request is fast: no CORS at all, and preview
deployments need no configuration.

**Sign-in adds one consequence to whichever you pick.** The session token
travels in an `Authorization` header, and a browser navigation cannot carry a
header — so an authenticated file can never be an `<a href>` or an `<object
data>`. It has to be fetched by script and handed to the page as a blob, which
is what `requestBlob()` in the web client does. Moving to the proxied setup, or
to a custom domain, would make an httpOnly cookie possible and lift that
restriction; until then it applies.

**Whichever you choose, build API URLs from the configured base.** `apiUrl()` in
[`lib/api-client.ts`](./apps/web/src/lib/api-client.ts) exists for the places
the browser fetches a URL itself — an `<object>` embed, a download link, a plain
`fetch` — because those bypass the axios instance. Writing `/api/…` by hand in
those spots silently assumes the API is same-origin. That is true of the Vite
dev proxy and false in production the moment `VITE_API_BASE_URL` points
elsewhere, which is how the quotation PDF once 404'd against the frontend's own
domain while every other call worked.

### Preview deployments and CORS

Vercel builds every pull request to its own hostname —
`yuva-polyprint-git-my-branch-me.vercel.app`, a new one per branch and per
commit. **Nothing needs configuring for these to work**, because the browser
never calls Render: `vercel.json` rewrites `/api` at the edge, so a preview
proxies through its own hostname exactly as production does. There is no
cross-origin request, so there is no origin to allow.

If a preview is blocked by CORS, the rewrite is being bypassed. Check, in order:

1. **`VITE_API_BASE_URL` must not be set in Vercel.** If it points at the Render
   URL, the browser calls Render directly and every preview hostname is a fresh
   origin Render has never heard of. Delete it in all three environments —
   Production, Preview and Development. It defaults to `/api`, which is what
   makes the rewrite work. Nothing in `apps/web/src` contains an absolute URL.
2. **The rewrite destination must be your real Render hostname.** If it is
   wrong, `/api` goes nowhere and the natural next move is to point the app
   straight at Render — which is what causes the CORS error in the first place.

   ```bash
   grep destination vercel.json
   ```

**If you do choose to call Render directly**, `CORS_ORIGINS` entries accept `*`,
matching within a single hostname label, so one pattern covers every preview:

```
CORS_ORIGINS=https://yuva-polyprint.vercel.app,https://yuva-polyprint-*.vercel.app
```

Keep the project name in the pattern. `https://*.vercel.app` would let any site
anyone deploys on Vercel call this API with credentials attached. The wildcard
cannot cross a dot, so `https://yuva-polyprint-*.vercel.app` will not match
`https://yuva-polyprint-x.attacker.com`.

### Deploying the web app (Vercel)

1. Put your Render URL in `vercel.json` — the one line under `rewrites`:

   ```json
   "destination": "https://yuva-polyprint-api.onrender.com/api/:path*"
   ```

   It defaults to the service name in `render.yaml`. Correct it if Render gave
   you a different hostname, and commit.

2. Vercel → **Add New → Project** → pick this repository. `vercel.json` supplies
   the build; leave the framework preset as **Other**.
3. **No environment variables are needed.**

### Chromium

Puppeteer's bundled Chromium is linked against glibc and cannot run on Alpine's
musl, so the image installs Alpine's own build and points Puppeteer at it via
`PUPPETEER_EXECUTABLE_PATH`. The font packages are not optional — without them
every glyph in the quotation PDF renders as an empty box.

### Cold starts

Render's free tier stops the service after 15 minutes of inactivity, and the
next request has to start a ~1.8GB container. That wake can outlast Vercel's
30-second edge timeout, in which case the first request after an idle period
fails and a retry — once the container is up — succeeds.

If that becomes annoying in daily use, Render's Starter plan does not spin down.
A scheduled ping is the cheaper workaround, but it only narrows the window.

---

## Conventions

Detailed rules live next to the code they govern:

- **API modules** — `apps/api/src/modules/README.md`
- **Web features** — `apps/web/src/features/README.md`
- **UI primitives** — `apps/web/src/components/ui/README.md`
- **Layout shells** — `apps/web/src/components/layout/README.md`
- **Shared hooks** — `apps/web/src/hooks/README.md`

Five rules worth repeating here:

1. **Money and material quantities use `Decimal`, never `Float`.** This system
   computes costs, consumption, and estimated-vs-actual variance. Floating point
   will drift, and drift in a costing engine is a silent correctness bug.
2. **Features never import from each other.** Anything two features need is
   promoted to `components/`, `hooks/`, or `lib/`. This is the single rule that
   keeps twenty modules from turning into a dependency knot.
3. **Server state belongs to TanStack Query, not Zustand.** Zustand is for real
   client state only — open panels, filter selections, shop-floor session.
4. **Mobile-first.** Every screen starts at 375px, and a table either becomes
   cards below `md` or gets an `overflow-x-auto` wrapper — never a clipping card
   with no scroller, which makes the columns past the fold unreachable rather
   than merely off screen. Anything clickable shows a pointer, from one base
   rule rather than a class on each. The shop-floor operator view is a separate
   shell with large touch targets, not a responsive squeeze of the office
   layout.
5. **A Tailwind colour class only exists if its token does.** Tailwind v4
   generates a utility from `@theme`, and generates **nothing** — silently — for
   a shade with no token. `text-danger-700` was written in fourteen files
   against a palette that stopped at 600, so the error line on every modal in
   the app inherited body grey and did not read as an error. The ramps are
   complete now, and `apps/web/src/styles/theme-tokens.test.ts` fails the build
   if a class ever names a shade that is not defined. Same family as rule 1: a
   wrong answer that looks like a right one.

---

## Adding a module end to end

1. Model it in `apps/api/prisma/schema.prisma`, then `npm run db:migrate`.
2. Put the request/response contract in `packages/shared`.
3. **Add the module key to `APP_MODULES`** in
   `packages/shared/src/constants/modules.ts`. One list feeds the user editor's
   tick boxes, the sidebar and the API guards, so a module added anywhere else
   is unreachable and invisible — `requireModule` will not compile without it.

   Not every API module needs one. `artwork` has its own folder, routes and
   service but no key: it is guarded by `cylinders`, because design files are
   part of the design register and a separate tick box would only be one more
   thing to forget. Give a module its own key when somebody could reasonably be
   trusted with it and not with its neighbour.

   A module can also require **two** keys. Deleting a design needs `cylinders`
   and `customers`, because the screen belongs to one and the record being
   destroyed belongs to the other.

4. Build the API module in `apps/api/src/modules/<module>/` and register its
   router in `apps/api/src/routes/index.ts`.
5. Build the web feature in `apps/web/src/features/<feature>/`, register its
   routes in `apps/web/src/app/router.tsx`, and add it to `NAV` in
   `apps/web/src/components/layout/AppShell.tsx`.
6. Add its paths to `apps/api/src/openapi/openapi.ts` so `/docs` covers it.
7. Run `npm run lint && npm run typecheck && npm test`.

---

## Notes and known issues

- **Prisma 7 requires a driver adapter.** The connection pool is owned by `pg`
  and configured in `apps/api/src/lib/prisma.ts`, not through the connection
  string. Pool size is environment-dependent (20 in production, 5 locally).
- **`$connect()` is lazy under a driver adapter.** `connectDatabase()` issues a
  real `SELECT 1` at boot so a bad `DATABASE_URL` fails immediately rather than
  on the first request that happens to need the database.
- **The generated Prisma client is git-ignored** (`apps/api/src/generated/`) and
  rebuilt by a `postinstall` hook, so a fresh clone works after `npm install`.
- **TypeScript is pinned to 5.9, not 7.** TypeScript 7 is released, but
  `typescript-eslint` does not support it yet; upgrading would cost linting.
- **`lint-staged` is pinned to 16.** Version 17 requires Node ≥ 22.22.1.
- **`npm audit` reports a high-severity advisory** in `deepmerge-ts`, reachable
  only through the Prisma **CLI** (`@prisma/config`) — a dev dependency excluded
  from the runtime image by `npm ci --omit=dev`. The suggested `audit fix --force`
  downgrades to Prisma 6, so it is deliberately not applied.
- **The app requires a sign-in.** There is no anonymous access to any module.
  A fresh database therefore needs `seed:admin` before anyone can get in — see
  [Signing in](#signing-in).
- **A quotation PDF takes a few seconds on Render's free tier, and the time is
  almost all cold starts.** Measured: the render itself is ~130 ms locally and
  ~370 ms with the CPU throttled 8×, so it is not the bottleneck. Neon's free
  tier suspends after inactivity — a first query costs ~1.7 s against ~0.2 s
  warm — and the web service sleeps after 15 minutes idle, so Chromium relaunches
  too. Two idle systems waking on the same click. Every screen that waits shows a
  spinner; do not mistake it for a hang.
- **R2 has no versioning, so "Delete for good" is final.** Nothing in the
  bucket is recoverable once erased — there is no undelete to fall back on, by
  design, since the point of the action is that the file stops existing. The
  row survives to say it was there and who erased it; the bytes do not.
- **An R2 bucket's CORS policy names origins explicitly**, so a browser upload
  that works locally fails in production until the deployed origin is added.
  The failure is a preflight the browser blocks, which surfaces as a status of
  `0` and no readable error — the upload code turns that into a message naming
  CORS, because nothing else would.
- **Vite's file watcher does not fire on this machine**, so the dev server can
  serve stale code and — more confusingly — stale CSS. Tailwind re-scans source
  files on a full restart, not on a save, so a class whose utility has never
  been generated before renders as nothing at all: no gap, a border falling back
  to black. It cost two false bug reports before it was understood. If a change
  does not appear, restart `npm run dev -w apps/web` before believing the screen.
- **Ten of the works' twelve comparable finished jobs would have been quoted at
  or above what they actually cost**, mean gap +8.0%, worst −6.6% —
  `npm run quote:job-sheets`. The two Lokraja Atta tabs are **set aside** from
  that summary rather than dropped: they ran at **26.2% wastage against an
  allowance of 7**, so their cost says nothing about whether the rate was close,
  and averaging them in buries what every other job is telling you. They still
  print, marked, with the reason. The check is not expected to agree to the
  paisa — a quotation prices film at the catalogue and carries the allowance,
  where a job sheet uses the week's purchase rates and what was actually lost —
  so what it reports is the **sign**.
- **Two costing settings were four years stale, and the gap was mostly them.**
  Transport stood at Rs 10 a kilogram where the works' own tabs median 6.80, and
  packing at Rs 5 where they median 1.22 — four times out. Correcting both, on a
  date so nothing already quoted moved, took the mean gap from +10.8% to +8.0%.
  Pricing the film at what the works paid that week instead (`--sheet-rates`)
  moves it to +7.7%, which says the rate list was never the problem. The 8%
  wastage allowance is left alone on purpose: it is commercial protection, not a
  forecast, and Lokraja is why.
- **A quotation's rate barely moved with the order size, and now it does.**
  Everything in the works' Estimation-sheet method scales with the kilograms, so
  the only fixed cost on a job was Rs 250 of sundries and doubling the order
  moved the rate by twenty paise. The `rateModel` setting switches to charging
  the whole crew and the bank by the day, where the make-ready is the same
  whatever the order — about Rs 9.50 a kilogram between 1,000 and 2,000 kg. It
  lifts the level too, roughly Rs 27 a kilogram at 1,000 kg and much more on a
  small order, which says the small jobs were being quoted under cost.
- **Two of the figures that model rests on are fitted, not given.** Rs 20,000
  for a day of the works and 0.75 days of make-ready came from the works' own
  fourteen job sheets, not from the works. Both are on the Costing screen, and
  nothing is precise until they recognise them.
- **Laminator 2 is a copy of Laminator 1.** Its real speed, horsepower, loaded
  rate and setup time are recorded nowhere — the job-sheet workbook names
  "Lamination 1" and "Lamination 2" only as two lamination _passes_, gives both
  the same 20% share of the day, and has never run the second. The two machines
  therefore price identically until somebody says how they differ.
- **The works' job-sheet spreadsheet splits a day's electricity 60 / 20 / 20 /
  10 / 10, which comes to 120.** Every job costed that way carried a sixth more
  electricity than the day cost. The works confirmed 100 is what was meant; the
  app's defaults are that same weighting rescaled, and
  `restate:stage-shares` corrects sheets already entered. The six older tabs
  charge a flat `days × 5000` instead, which is a separate question — that rate
  may no longer be what a day costs now they have set it at Rs 6,000.
- **One tab of that workbook has an empty profit row.**
  `Copy of Radhey Bhadan 200g` was costed with no margin at all — Rs 303.28 a
  kilogram where the usual ten per cent makes it Rs 323.14. The app follows the
  sheet rather than correcting it and reports the gap, because the sheet is the
  record of what was charged.
- **The eight spot inks carry no laydown or solids, deliberately.** A quotation
  prices an unnamed "special colour" at the dearest ink having all three of
  laydown, solids and a rate — Magenta at Rs 235. Give Gold a laydown and every
  quotation raised afterwards prices its special colours at Rs 510, more than
  double, with nobody having chosen it. LDPE carries no density for the same
  reason and cannot yet be used as a quotation ply.
- **None of the three new quotation designs is wired to the Download PDF
  button.** Folio, Dossier and Statement render from real data through
  `preview:quotations`; the button still sends the original document until the
  works picks one.
- **The letterhead artwork is 762 KB of PNG**, which becomes ~1 MB of base64 in
  the HTML and ~670 KB of the finished 787 KB PDF. Resampling the header and
  footer to around 800px wide would take the PDF to roughly 200 KB with no code
  change — the asset loader reads dimensions from the file header, so the layout
  follows. Worth doing for the download and the email attachment; it will not
  move generation time much.
