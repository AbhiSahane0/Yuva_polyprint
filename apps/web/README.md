# Web — Yuva Polyprint ERP

React 19 + Vite 8 + Tailwind v4 + TanStack Query. The office-facing client.

- [Running it](#running-it)
- [Layout](#layout)
- [Screens](#screens)
- [How data flows](#how-data-flows)
- [Calculations in the browser](#calculations-in-the-browser)
- [UI components](#ui-components)
- [Conventions](#conventions)

---

## Running it

```bash
npm run dev -w @yuva/web
```

http://localhost:5173. The dev server proxies `/api` to `localhost:4000`, so
the browser stays on one origin — no CORS in development, and the production
path (`/api` on the same host) is exercised locally too.

Only `VITE_`-prefixed variables reach the browser, and **they are inlined into
the bundle**, readable by any visitor. Never put a secret in `apps/web/.env`.

---

## Layout

```
src/
├── main.tsx               React root
├── App.tsx                providers + router
├── app/
│   ├── providers.tsx      QueryClientProvider, BrowserRouter, Toaster
│   ├── query-client.ts    TanStack Query defaults and retry policy
│   └── router.tsx         route map; pages are lazy-loaded
├── components/
│   ├── ui/                Button, Field, Input, Select, Combobox, Modal,
│   │                      Badge, EmptyState, Toaster, ReadOnlyValue,
│   │                      Spinner, LoadingState
│   └── layout/AppShell    sidebar on desktop, slide-over drawer on mobile
├── features/
│   ├── customers/         customer list, edit modal, job specification editor
│   ├── quotations/        quotation list, form, PDF preview
│   └── rates/             daily material rates
├── hooks/useDebounce.ts
├── lib/
│   ├── api-client.ts      Axios instance, interceptors, ApiClientError
│   ├── toast.ts           tiny Zustand store
│   └── utils.ts           cn() — Tailwind-aware class merging
└── styles/index.css       Tailwind v4 @theme — the design tokens
```

**`app/` versus `features/`.** `app/` is application wiring that exists once —
providers, router, query client. `features/` is business functionality, one
folder per module. Wiring holds no business logic.

**`components/ui/` versus `features/*/components/`.** If it doesn't know what an
order is, it belongs in `ui/`. If it renders one, it belongs to the feature.
Promote to `ui/` only when a second feature genuinely needs it.

Features never import from each other. Anything two of them need moves to
`components/`, `hooks/` or `lib/`.

---

## Screens

### Customers — `/customers`

The list of every customer, with search across company, contact, mobile,
alternate phone, email, city, district, address and pincode. Search is
**debounced 300ms**, and the previous page stays on screen while the next
loads, so the table never flashes empty as you type.

Filters: **All**, **Needs review**, **From brand**.

Clicking a row expands it to show that customer's jobs, fetched only when
opened. Each job shows a one-line spec summary —
`PET 12µ · Poly 85µ · 99.8 GSM · 160 × 550 mm`.

**Status badges** carry two independent meanings:

| Badge                    | Source                    | Meaning                                                                                                       |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Confirmed / Needs review | `is_verified`             | Whether the record is complete and checked                                                                    |
| From brand               | `source = BRAND_INFERRED` | The customer was **created from a brand name** in job titles, because the spreadsheet never named the company |

### Customer editor (modal)

Company and address details, plus the **full job specification** — all 45
columns, grouped so it stays usable:

Basics · Film structure · Design & cylinders · Coating weights (GSM) ·
Machine & tooling · Pouch dimensions · Other details (collapsed)

Each job is a collapsible card; collapsed it shows name, code and form, so a
customer with 20 jobs is still a short list.

**Three fields are read-only** and shown as dashed boxes with their source
captioned — Job code ("Set by the system"), Composite total ("Ink + PET + Met
PET + Poly + Adhesive") and Pouches per kg ("From design size and composite
GSM"). The two calculated ones update live as you type. The server recomputes
on save regardless; the live figure is feedback, not the source of truth.

`NA` never appears in the UI. The imported data is full of it, so the table
shows a muted dash and edit boxes open blank. Clearing a box saves it back as
`NA`, keeping the database consistent with the import.

Removing a job from the list **unlinks it, it does not delete it** — the job
returns to the "needs a customer" worklist.

### Quotations — `/quotations`

List with search by number, customer or job name, and Draft / Sent / Won / Lost
filters. Each row previews, downloads, edits or deletes.

### Quotation form — `/quotations/new`, `/quotations/:id/edit`

Pick a saved customer and the address block fills in; job rows can copy
dimensions from that customer's saved specs.

Per line you enter size, quantity and rate; **micron, pouches per kg, total
pouches, cylinder size and cylinder cost are calculated and shown read-only**.
Choosing a **Film** adds a cost strip:

> Material cost **Rs. 213.45/kg** (77.5 GSM) · Margin **27.7%**

Margin under 10% turns red. Document totals update live at the bottom.

### Quotation preview

Shows the **actual generated PDF**, from the same endpoint as the download — so
the preview and the file are the same bytes and cannot disagree.

The PDF is **fetched by the component**, and only then handed to `<object>` as a
blob. Pointing `<object>` straight at the URL looks simpler but cannot report
progress: Chrome instantiates its PDF viewer and fires `load` immediately, while
the document is still in flight, so anything tied to that event fires against an
empty viewer. Fetching it makes the wait observable — a spinner and "Generating
the PDF…" while Chromium renders it on the server — and gives a real failure
message instead of a permanently blank frame.

It uses `<object>` rather than `<iframe>`: a browser with no PDF viewer shows an
empty grey box in an iframe but falls back to real content in an object. An
**Open in tab** button is always present, because a browser can load the viewer
and still fail to paint, in which case the embed looks blank while the object
counts as loaded and the fallback never fires.

### Rates — `/rates`

Today's raw material prices, grouped by Films / Ink / Adhesive / Solvents.

Each row shows the previous rate, the current one, an input for the new rate,
and the change. **The change previews before you save** — typing 225 over 210
shows `+7.14%` in red immediately. Only materials you actually changed are sent;
the Save button counts them.

A blank field means "no change today", not zero. The date picker lets you record
a rate you forgot yesterday, and each material has a history showing every
recorded rate and who keyed it in.

Saving invalidates the quotation queries too, since their costing depends on
these rates.

#### Today's rates are already filled in

The screen never starts empty. Each material's last known rate is carried
forward a day at a time, so opening `/rates` on any morning shows yesterday's
numbers already sitting under today's date, ready to edit.

Day to day that means: **open the screen, change only what actually moved, save.**
Nothing needs touching on a day when no price changed — the rate for that day is
already recorded.

Two consequences worth knowing:

- **The change column reads `0.00%` most days.** A carried-forward day holds the
  same number as the day before, and the comparison is against the literal
  previous day. It lights up only when someone genuinely edits a rate — which
  makes a real change easy to spot.
- **A material's history lists every day**, including the carried ones, so the
  price reads as a continuous series. Carried days show `Carried forward` in
  place of a person's name, so it is clear nobody keyed that number in.

Editing a carried-forward rate **replaces** that day's row rather than adding a
second one, so a day never appears twice.

This is entirely server-side — no screen code implements it. The API brings
rates up to date when `GET /materials` is read. See
[Carry-forward](../api/README.md#carry-forward) for why it works that way rather
than on a midnight schedule.

---

## How data flows

**Server state lives in TanStack Query. Client state lives in Zustand.**
Zustand holds only genuine UI state — currently just toasts. Anything that came
from the API is a query, never copied into local state.

Each feature owns a **query-key factory** so invalidation cannot drift:

```ts
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params) => [...customerKeys.lists(), params] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
};
```

Mutations invalidate `lists()` and write the fresh record into `detail(id)`,
so an expanded row is never left showing stale data after a save.

**Errors.** Every failure from `api-client.ts` becomes an `ApiClientError` with
a `code`, an HTTP `status`, and `fields` keyed by input name. Forms map those
straight onto the matching inputs, so a server-side validation error appears
beside the field that caused it, exactly like a client-side one.

Queries **never retry a 4xx** — the server has already rejected the request on
its merits, so retrying only delays the error.

Auth is injected rather than imported: `configureAuth()` takes a token getter
and an unauthorized handler, so `api-client.ts` has no dependency on any auth
store that does not exist yet.

---

## Calculations in the browser

The browser recomputes the same figures the server does, using **the same code**
— `@yuva/shared` is imported by both. Nothing is duplicated or reimplemented.

| Where                 | What is previewed                                                                |
| --------------------- | -------------------------------------------------------------------------------- |
| Customer job editor   | Composite GSM, pouches per kg                                                    |
| Quotation form line   | Micron, pouches/kg, total pouches, cylinder size and cost, material cost, margin |
| Quotation form totals | Material and cylinder subtotals, GST, grand total, advance                       |
| Rates screen          | The change % a typed rate would produce                                          |

**The server always recalculates on save and its value wins.** The browser
figure exists so the effect of a change is visible before committing to it —
it is feedback, not the source of truth. Formulas and worked examples are
documented in [the API README](../api/README.md#calculations).

---

## UI components

| Component             | Notes                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`              | primary / secondary / ghost / danger, with a loading state                                                                                                        |
| `Field`               | Label, hint and error in one consistent block                                                                                                                     |
| `Input`, `Textarea`   | 44px tall, 15px text                                                                                                                                              |
| `Select`              | Native select with a **drawn chevron** — `appearance: none` removes the browser's arrow, and without one of ours the control is indistinguishable from a text box |
| `Combobox`            | Suggestions you can pick **or type past**. Replaces `<datalist>`, whose arrow and popup the browser draws and cannot be styled                                    |
| `Modal`               | Escape closes, background scroll locks, focus moves inside and Tab is trapped, backdrop click closes                                                              |
| `ReadOnlyValue`       | Dashed box for system-owned values, captioned with where the value comes from — a greyed box with no explanation reads like a bug                                 |
| `Toaster`             | Bottom-right on desktop, bottom-centre on mobile                                                                                                                  |
| `Spinner`             | The spinning indicator on its own, for inline use. Same `Loader2` the `Button` draws, so a busy button and a busy panel look like one system                      |
| `LoadingState`        | Fills a page or panel while its data loads. Deliberately the same shape as `EmptyState`, because the two swap places in the same slot — otherwise lists jump      |
| `EmptyState`, `Badge` |                                                                                                                                                                   |

Controls are deliberately roomy. This system replaces a spreadsheet; cramped
inputs are the fastest way to make it feel worse than what it replaces.

**Nothing waits silently.** Every wait shows a spinner and says what it is
waiting for — "Loading quotations…" rather than a bare spinner, because on a
slow connection that is the difference between waiting and wondering whether the
click registered. Whole pages and panels use `LoadingState`; smaller waits put a
`Spinner` beside their own label.

Two that are easy to miss:

- **The search box's magnifier becomes the spinner** while a debounced search is
  in flight. The right-hand slot already holds the clear button, and swapping the
  decorative icon costs no layout shift.
- **The quotation preview fetches its PDF itself** rather than pointing
  `<object>` at the URL. Chrome instantiates its PDF viewer and fires `load`
  immediately, while the bytes are still in flight — so a spinner tied to that
  event disappears at once and leaves the viewer's empty dark rectangle on
  screen, which is the very thing it was there to prevent.

The animation slows rather than stops under `prefers-reduced-motion`: a spinner
frozen mid-rotation reads as a broken image.

---

## Conventions

**Mobile-first.** Every screen starts at 375px. Tables become **cards** below
`md` rather than scrolling sideways — a squeezed table is unusable on a phone.
Inputs are 16px so iOS never zoom-jumps on focus, and the layout respects safe
areas.

**Design tokens, not hex values.** Tailwind v4 is configured in CSS via `@theme`
in `styles/index.css` — there is no `tailwind.config.js`. The palette came from
the approved wireframe, so `bg-brand-600` and `text-ink-500` are the vocabulary.

**Routes are lazy-loaded** in `app/router.tsx`, so a screen's code is only
fetched when someone opens it.

**Adding a feature**

1. Put the request/response contract in `packages/shared`.
2. Create `features/<feature>/api/` with a query-key factory and hooks.
3. Build pages under `features/<feature>/pages/`, components alongside.
4. Register the route in `app/router.tsx` and the nav item in `AppShell`.
