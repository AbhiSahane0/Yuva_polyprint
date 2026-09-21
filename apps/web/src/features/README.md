# Web features

> Screen-by-screen documentation lives in [`apps/web/README.md`](../../README.md).

One folder per business feature, mirroring the API modules. Built so far:

| Feature      | Screens it owns                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `auth`       | Sign-in, the session store, route guards                                                            |
| `users`      | User management (admins only)                                                                       |
| `customers`  | Customer list, edit modal, job specification editor                                                 |
| `quotations` | Quotation list, wizard, PDF preview, sending                                                        |
| `job-sheets` | The production job sheet — what a run actually cost                                                 |
| `costing`    | Machines, wages and every overhead a rate is built from — see [its own README](./costing/README.md) |
| `rates`      | Daily material rates                                                                                |
| `inventory`  | Stock, batches, the movement ledger                                                                 |
| `purchase`   | Suppliers, orders, receiving into stock                                                             |
| `cylinders`  | The design register and cylinder history                                                            |
| `artwork`    | Design files — no screen of its own; see rule 1                                                     |
| `gstin`      | GST field and lookup — no screen of its own                                                         |
| `monitor`    | Sign-in log (admins only)                                                                           |

Two of these own no route. `artwork` supplies the design files panel and
`gstin` supplies a form field, and both are folders rather than components in
`src/` because each carries its own API hooks, its own dialogs and its own
rules — `src/components` is for things with no business logic in them.

## Layout

```
features/<feature>/
  api/          TanStack Query hooks + the request functions they call
  components/   Components used only by this feature
  pages/        Route-level components
  hooks/        Feature-local hooks
  schemas.ts    Form schemas (zod), shared with the API via @yuva/shared
  types.ts      Feature-local types
```

## Rules

1. **A feature may import another feature's public surface, and nothing else.**
   Its `api/` hooks, or a component it exists to hand to other screens. Never
   its pages, its internal components or its local state — those are its own
   business and are free to change.

   This rule used to read "features never import from each other", which was
   not true of the code and had not been for a long time. What is actually
   load-bearing is the direction and the depth, so that is what it says now.
   The whole list, which should stay short enough to read:

   | From         | Imports              | Why                                   |
   | ------------ | -------------------- | ------------------------------------- |
   | `quotations` | `customers/api`      | The wizard picks a customer           |
   | `quotations` | `rates/api`          | Costing needs today's rates           |
   | `quotations` | `gstin/components`   | The GST field                         |
   | `customers`  | `gstin/components`   | The same field, the same rules        |
   | `inventory`  | `rates/api`          | Valuing stock                         |
   | `purchase`   | `inventory/api`      | Receiving creates stock               |
   | `job-sheets` | `inventory/api`      | Posting a sheet moves stock           |
   | `purchase`   | `rates/api`          | Pricing an order line                 |
   | `cylinders`  | `artwork/components` | The design files panel                |
   | anything     | `auth/auth-store`    | Who is signed in, and what they reach |

   `auth` is infrastructure rather than a peer — every screen needs to know who
   is looking at it — so it is not counted against this rule.

   Promote to `src/components`, `src/hooks` or `src/lib` when something stops
   being one feature's business. `GstinField` did not: it owns the lookup, the
   checksum and the error text, and living in `src/` would only hide that.

2. **Server state lives in TanStack Query**, not in Zustand. Zustand is for
   genuine client state only — currently the toast queue and the session store
   in `features/auth`, which holds the signed-in user and the token the API
   client reads on every request.
3. **One query-key factory per feature** in `api/`, so invalidation is reliable.
   **Invalidate through `settle()` from `src/lib/query.ts` and return it from
   `onSuccess`** — never a bare `invalidateQueries`. Awaiting it is what keeps a
   mutation from settling while the screen still shows the old value, which is
   the flash that follows every save otherwise. The rule and the measurement are
   in [`apps/web/README.md`](../../README.md#a-mutation-is-not-finished-until-the-screen-shows-what-it-did).
4. **Pages are lazy-loaded** in `src/app/router.tsx` to keep the shop-floor
   bundle small.
5. **Mobile-first.** Every screen starts at 375px and scales up; tables get a
   card layout on small screens rather than horizontal scroll.
