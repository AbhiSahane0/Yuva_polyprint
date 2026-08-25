# Web features

> Screen-by-screen documentation lives in [`apps/web/README.md`](../../README.md).

One folder per business feature, mirroring the API modules. Nothing is
scaffolded here yet — features are added as each is confirmed in scope.

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

1. **Features never import from each other.** Anything two features need is
   promoted to `src/components`, `src/hooks`, or `src/lib`.
2. **Server state lives in TanStack Query**, not in Zustand. Zustand is for
   genuine client state only (open panels, filters, shop-floor session).
3. **One query-key factory per feature** in `api/`, so invalidation is reliable.
4. **Pages are lazy-loaded** in `src/app/router.tsx` to keep the shop-floor
   bundle small.
5. **Mobile-first.** Every screen starts at 375px and scales up; tables get a
   card layout on small screens rather than horizontal scroll.
