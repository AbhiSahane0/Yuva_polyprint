# Yuva Polyprint — Manufacturing ERP

Flexible packaging manufacturing ERP: quotation → order → planning → multi-stage
production → quality/waste → costing → dispatch, with full job-level traceability.

> **Status: project scaffold.** Platform infrastructure is in place and verified.
> No business modules are implemented yet — they are added one at a time as each
> is confirmed in scope.

---

## Stack

| Layer    | Choice                                                              |
| -------- | ------------------------------------------------------------------- |
| Web      | React 19, Vite 8, TypeScript, Tailwind CSS v4, TanStack Query v5    |
|          | React Router v7, React Hook Form + Zod, Zustand, lucide-react       |
| API      | Node 22, Express 5, TypeScript, Prisma 7 (`pg` driver adapter), Zod |
|          | pino logging, helmet, CORS, rate limiting, JWT auth plumbing        |
| Database | PostgreSQL 17                                                       |
| Tooling  | npm workspaces, ESLint 9 flat config, Prettier, Vitest, Husky, CI   |

---

## Layout

```
yuva-polyprint/
├── apps/
│   ├── api/                  Express + Prisma REST API
│   │   ├── prisma/           schema.prisma, migrations
│   │   ├── prisma.config.ts  Prisma 7 config (datasource URL from env)
│   │   └── src/
│   │       ├── config/       env.ts — validated once at boot
│   │       ├── lib/          prisma.ts, logger.ts
│   │       ├── middleware/   auth, validation, errors, rate limit, logging
│   │       ├── modules/      ← business modules go here (see its README)
│   │       ├── routes/       the API surface map
│   │       ├── utils/        ApiError, response envelopes, asyncHandler
│   │       ├── app.ts        Express app factory (testable, no port binding)
│   │       └── server.ts     boot + graceful shutdown
│   └── web/                  React SPA
│       └── src/
│           ├── app/          providers, router, query client
│           ├── components/   ui/ primitives, layout/ shells
│           ├── features/     ← business features go here (see its README)
│           ├── lib/          api-client.ts, utils.ts
│           └── styles/       Tailwind v4 theme (wireframe design tokens)
└── packages/
    └── shared/               contracts used by BOTH sides — envelopes,
                              error codes, pagination, roles, zod schemas
```

**Why a shared package:** request/response shapes are defined once and imported
by the API and the client, so a contract change breaks the build instead of
breaking production.

---

## Getting started

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
```

Generate real JWT secrets (the example values are placeholders):

```bash
openssl rand -base64 48
```

Start PostgreSQL (requires Docker Desktop running):

```bash
npm run db:up
```

Apply migrations, then start everything:

```bash
npm run db:migrate
```

```bash
npm run dev
```

- Web → http://localhost:5173
- API → http://localhost:4000
- Health → http://localhost:4000/health
- Adminer (DB browser) → http://localhost:8080

---

## Scripts

Run from the repo root.

| Script                      | Does                                               |
| --------------------------- | -------------------------------------------------- |
| `npm run dev`               | shared (watch) + API + web concurrently            |
| `npm run build`             | builds shared → API → web in order                 |
| `npm run typecheck`         | typechecks every workspace                         |
| `npm run lint`              | ESLint across the monorepo (`lint:fix` to autofix) |
| `npm run format`            | Prettier write (`format:check` to verify)          |
| `npm test`                  | Vitest in every workspace                          |
| `npm run db:up` / `db:down` | start / stop the Postgres container                |
| `npm run db:migrate`        | create + apply a migration                         |
| `npm run db:studio`         | Prisma Studio                                      |
| `npm run db:generate`       | regenerate the Prisma client                       |

---

## Conventions

Read these before adding code — they are what keep 20 modules maintainable:

- **API modules** — `apps/api/src/modules/README.md`
- **Web features** — `apps/web/src/features/README.md`
- **UI primitives** — `apps/web/src/components/ui/README.md`
- **Layout shells** — `apps/web/src/components/layout/README.md`

Two rules worth repeating here:

1. **Money and material quantities use `Decimal`, never `Float`.** This system
   computes costs, consumption, and variance; floating point will drift.
2. **Mobile-first.** Every screen starts at 375px. The shop-floor operator view
   is a separate shell with large touch targets, not a responsive squeeze of the
   office layout.

---

## Adding a module

1. Model it in `apps/api/prisma/schema.prisma`, then `npm run db:migrate`.
2. Put the request/response contract in `packages/shared`.
3. Build the API module under `apps/api/src/modules/<module>/` and register its
   router in `apps/api/src/routes/index.ts`.
4. Build the web feature under `apps/web/src/features/<feature>/` and register
   its routes in `apps/web/src/app/router.tsx`.

---

## Notes

- **Prisma 7 requires a driver adapter.** The pool is owned by `pg` and
  configured in `apps/api/src/lib/prisma.ts`, not via the connection string.
- **The generated Prisma client is git-ignored** (`apps/api/src/generated/`) and
  rebuilt by the `postinstall` hook, so a fresh clone works after `npm install`.
- **`npm audit` reports a high-severity advisory** in `deepmerge-ts`, reached
  only through the Prisma **CLI** (`@prisma/config`). It is a dev-time
  dependency, excluded from the runtime image by `npm ci --omit=dev`. The
  suggested `audit fix --force` downgrades to Prisma 6, so it is deliberately
  not applied.
- **Docker images** are provided for both apps (`apps/api/Dockerfile`,
  `apps/web/Dockerfile` + `nginx.conf`) as multi-stage, non-root builds.
