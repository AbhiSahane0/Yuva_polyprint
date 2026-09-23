# API modules

> Endpoint and calculation documentation lives in [`apps/api/README.md`](../../README.md).

One folder per business module. Built so far:

| Module       | Covers                                                           |
| ------------ | ---------------------------------------------------------------- |
| `auth`       | Sign in and out, the current session, changing your own password |
| `users`      | Administrators managing who can sign in and what they can open   |
| `customers`  | Customers and their job specifications                           |
| `jobs`       | One design at a time — created and edited from two screens       |
| `job-sheets` | What a run actually consumed, and what it cost a kilogram        |
| `quotations` | Quotations, their costing, and the generated PDF                 |
| `orders`     | What the customer committed to — the link between the two above  |
| `production` | Job cards — what the floor did, stage by stage                   |
| `materials`  | The rate catalogue and daily rates                               |
| `inventory`  | Stock as a ledger — batches, movements, and what is running out  |
| `purchase`   | Suppliers and orders; receiving is where buying becomes stock    |
| `cylinders`  | The design register — engraved sets, where they are, what state  |
| `artwork`    | Design files in R2 — signed uploads, revisions, signed reads     |
| `costing`    | Machines and wages — the master data every quoted rate rests on  |
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
5. **Cross-module access goes through the other module's service**, never
   directly into its tables — that boundary is what keeps this maintainable at
   20 modules. It applies to writes as much as reads, and the writes are where
   it earns its keep: `purchase` receives stock through `inventory`, so a
   delivery lands in the ledger by the same path as everything else;
   `job-sheets` takes a run's consumption off stock through `inventory`, so a
   sheet and a manual issue leave the same kind of movement behind; and
   `cylinders` erases a design's files through `artwork`, so there is only one
   piece of code that knows how to remove an object from R2 — and therefore
   only one that can forget to.
6. **Register the router** in `src/routes/index.ts`.

Contracts the web client also needs (request/response shapes) belong in
`packages/shared`, not here.
