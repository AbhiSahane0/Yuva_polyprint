# API modules

> Endpoint and calculation documentation lives in [`apps/api/README.md`](../../README.md).

One folder per business module. Built so far:

| Module       | Covers                                                           |
| ------------ | ---------------------------------------------------------------- |
| `auth`       | Sign in and out, the current session, changing your own password |
| `users`      | Administrators managing who can sign in and what they can open   |
| `customers`  | Customers and their job specifications                           |
| `quotations` | Quotations, their costing, and the generated PDF                 |
| `materials`  | The rate catalogue and daily rates                               |
| `inventory`  | Stock as a ledger — batches, movements, and what is running out  |
| `purchase`   | Suppliers and orders; receiving is where buying becomes stock    |
| `cylinders`  | The design register — engraved sets, where they are, what state  |
| `artwork`    | Design files in R2 — signed uploads, revisions, signed reads     |
| `gstin`      | Verifying a customer's GST registration                          |
| `monitor`    | Sign-in history, for administrators                              |
| `settings`   | Editable costing defaults                                        |

Access is applied in [`routes/index.ts`](../routes/index.ts), not inside these
folders — the one page listing the whole API surface is where a missing guard is
visible.

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
