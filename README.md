# Yuva Polyprint — Manufacturing ERP

Flexible packaging manufacturing ERP: quotation → order → planning → multi-stage
production → quality/waste → costing → dispatch, with full job-level traceability.

> **Status: project scaffold.** The platform foundation is in place and verified.
> No business modules are implemented yet — they are added one at a time as each
> is confirmed in scope.

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
|          | pino logging, helmet, CORS, rate limiting, JWT auth plumbing        |
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

Generate real JWT secrets — the example values are placeholders and the API
refuses to boot with anything under 32 characters:

```bash
openssl rand -base64 48
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
    │   └── logger.ts         pino instance with credential redaction
    ├── middleware/
    │   ├── authenticate.ts   JWT verification + authorize(...roles) guard
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
    │   └── layout/           app shells: office sidebar, shop-floor operator
    ├── features/             ← business features live here (see its README)
    ├── hooks/                cross-feature hooks only
    ├── lib/
    │   ├── api-client.ts     Axios instance, interceptors, ApiClientError
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

---

## Conventions

Detailed rules live next to the code they govern:

- **API modules** — `apps/api/src/modules/README.md`
- **Web features** — `apps/web/src/features/README.md`
- **UI primitives** — `apps/web/src/components/ui/README.md`
- **Layout shells** — `apps/web/src/components/layout/README.md`
- **Shared hooks** — `apps/web/src/hooks/README.md`

Four rules worth repeating here:

1. **Money and material quantities use `Decimal`, never `Float`.** This system
   computes costs, consumption, and estimated-vs-actual variance. Floating point
   will drift, and drift in a costing engine is a silent correctness bug.
2. **Features never import from each other.** Anything two features need is
   promoted to `components/`, `hooks/`, or `lib/`. This is the single rule that
   keeps twenty modules from turning into a dependency knot.
3. **Server state belongs to TanStack Query, not Zustand.** Zustand is for real
   client state only — open panels, filter selections, shop-floor session.
4. **Mobile-first.** Every screen starts at 375px. The shop-floor operator view
   is a separate shell with large touch targets, not a responsive squeeze of the
   office layout.

---

## Adding a module end to end

1. Model it in `apps/api/prisma/schema.prisma`, then `npm run db:migrate`.
2. Put the request/response contract in `packages/shared`.
3. Build the API module in `apps/api/src/modules/<module>/` and register its
   router in `apps/api/src/routes/index.ts`.
4. Build the web feature in `apps/web/src/features/<feature>/` and register its
   routes in `apps/web/src/app/router.tsx`.
5. Run `npm run lint && npm run typecheck && npm test`.

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
- **Not yet verified against a live database.** Migrations and the
  `/health/ready` probe have not been exercised against a running PostgreSQL
  instance, because the schema currently defines no models.
