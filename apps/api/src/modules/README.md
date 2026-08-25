# API modules

> Endpoint and calculation documentation lives in [`apps/api/README.md`](../../README.md).

One folder per business module. Nothing is scaffolded here yet — modules are
added as each is confirmed in scope.

## Layout

```
modules/<module>/
  <module>.routes.ts      HTTP surface: paths, middleware, validation
  <module>.controller.ts  Reads the request, calls the service, sends the response
  <module>.service.ts     Business rules and transactions — the only layer with logic
  <module>.repository.ts  Prisma access (optional; use when queries get non-trivial)
  <module>.schema.ts      Zod schemas for body/query/params
  <module>.types.ts       Module-local types
  <module>.test.ts        Tests colocated with the code
```

## Rules

1. **Controllers stay thin.** No business logic, no Prisma calls.
2. **Services never touch `req`/`res`.** They take plain arguments and return
   plain data, which keeps them testable and reusable from jobs/scripts.
3. **Validate at the edge** with `validate({ body, query, params })` so services
   can trust their inputs.
4. **Throw `ApiError`** for expected failures; the error handler formats them.
5. **Cross-module reads go through the other module's service**, never directly
   into its tables — that boundary is what keeps this maintainable at 20 modules.
6. **Register the router** in `src/routes/index.ts`.

Contracts the web client also needs (request/response shapes) belong in
`packages/shared`, not here.
