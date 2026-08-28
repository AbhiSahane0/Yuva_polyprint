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
│   ├── auth/              login, session store, route guards
│   ├── users/             user management (admins only)
│   ├── customers/         customer list, edit modal, job specification editor
│   ├── quotations/        quotation list, form, PDF preview
│   └── rates/             daily material rates
├── hooks/useDebounce.ts
├── lib/
│   ├── api-client.ts      Axios instance, interceptors, ApiClientError
│   ├── download.ts        saveBlob / openBlobUrl for fetched files
│   ├── toast.ts           tiny Zustand store
│   └── utils.ts           cn() — Tailwind-aware class merging
└── styles/index.css       Tailwind v4 @theme — the design tokens
```

Brand assets in `public/` — `logo.svg` and `favicon.svg` — are **generated**, by
`scripts/generate-logo.mjs`. Edit the script, not the SVGs: the long shadow is a
few hundred offset copies of each letter, which is not something to maintain by
hand. Geometry and colour were measured off the printed letterhead rather than
eyeballed, and the result sits within 1.4% of the original on every letter.

The favicon is deliberately **one tile, not the whole mark**. Rendered at 16px
the four letters collapse into an unreadable smear; a single Y in the brand
purple stays legible and still reads as the same logo.

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

### Sign in — `/login`

Username and password, outside the app shell — no sidebar to a stranger.

The session token is kept in `localStorage`, which is the trade-off that comes
with sending it as a header instead of a cookie: it survives a refresh and works
no matter which host the API is on, but JavaScript on the page can read it.
Acceptable for an internal tool, and it stops being necessary the day the app
and API share a domain.

On boot, a stored token is exchanged for the user via `GET /auth/me` before
anything renders. Until that answers we know a token exists but not whether it
is still valid, so the app shows "Signing you in…" rather than guessing —
guessing "signed in" flashes the dashboard before bouncing to login, and
guessing "signed out" bounces a perfectly good session on every refresh.

A 401 from any request signs the user out, so a session the server has already
rejected cannot linger in the browser.

### Users — `/users` (administrators only)

Add someone, set what they can open, reset a password, deactivate them.

Access is a tick per section. **Administrator** is a separate tick that grants
everything and greys the rest out, because ticking boxes that do not apply is
just a way to record something untrue.

Creating a user asks for a password; changing one later is a **separate action**
on the row. Folding a password box into the same form as "rename this person" is
how passwords get reset by accident. The reset field shows the password in plain
text on purpose — the admin has to read it out to the person.

**Deactivate rather than delete.** A rate records who entered it, and deleting
the person makes that record ambiguous. Deactivating keeps the history, blocks
sign-in, and drops their sessions on the spot. You cannot deactivate or delete
your own account, and the API refuses to let the last administrator be demoted.

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

**GST number** sits with the contact details and is carried onto every
quotation raised for that customer.

`NA` never appears in the UI. The imported data is full of it, so the table
shows a muted dash and edit boxes open blank. Clearing a box saves it back as
`NA`, keeping the database consistent with the import.

Removing a job from the list **unlinks it, it does not delete it** — the job
returns to the "needs a customer" worklist.

### Quotations — `/quotations`

The list reads as a **work queue, not a diary**: Draft first, then Sent, then
Won and Lost, with the newest at the top of each group. Drafts need finishing
and sent quotations need chasing, so whatever still needs doing sits at the top.
Search by number, customer or job name, and the same four filters narrow it.

Each row previews, records the outcome, emails, downloads, edits or deletes.
The outcome tick is hidden on drafts — the status a quotation moves through is
Draft → Sent → Won or Lost, and the last step needs the customer to have seen it
first.

### Quotation form — `/quotations/new`, `/quotations/:id/edit`

#### Who it is for

**Existing company** or **New company** is chosen first, as two separate paths
rather than one field that behaves differently depending on what is typed into
it — which of the two you are doing is a decision the office makes before they
start.

- **Existing** makes the customer name a **searchable text box**. With dozens of
  companies, typing three letters beats scrolling a list, and it stays a text
  field so an unusual name can still be typed. Choosing one fills in the
  address, mobile, email and GST number.
- **New** gives plain boxes, and the company is **added to your customer list
  when the quotation saves** — so the next enquiry finds it under Existing
  instead of being retyped. A name that already exists is reused, not
  duplicated.

Switching between the two **clears the block**. Leaving a half-filled form
behind is how a new company inherits the previous one's GST number.

**GST number** is recorded here and printed on the quotation, because the
customer's accounts team needs it to claim input credit.

#### Each job, in two parts

A job card is split, because the office fills it in as two jobs:

| Printing & pouching                                                           | Cylinder                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Type (roll or pouch), pouch style, layers, size, micron, quantity, rate, film | Repeat width and height, number of cylinders, transport cost |

They are quoted and paid for separately — cylinders are one-time and 100%
advance — which one long row of boxes hid.

**Type** is Roll or Pouch. A pouch also asks its style: Standup, Standup zipper,
Zipper, Spout, Centre seal, Three side seal, or Other. The style field only
appears for a pouch rather than sitting greyed out on a roll, and choosing
Other reveals a box to say what it is — the option is worthless otherwise.
Switching a line to Roll clears the style rather than raising an error, so
changing your mind is not something you then have to tidy up.

#### Standup pouches are quoted per piece

The quantity and rate boxes change with the pouch style. **Standup** and
**Standup zipper** are sold by the piece, so those lines ask for a pouch count
and a rate per pouch, and show the weight worked back beside them — the film is
still ordered by weight. Every other style, and every roll, asks for kilograms
as before.

The two pairs **swap** rather than sitting side by side, because only one of
them is ever the one being quoted on. Which applies is decided by the style, not
chosen separately, so the form cannot show a basis the server will not use.

#### What is calculated

Per line you enter size, quantity and rate; **micron, pouches per kg, total
pouches, cylinder size and cylinder cost are calculated and shown read-only**.
Choosing a **Film** adds a cost strip:

> Material cost **Rs. 213.45/kg** (77.5 GSM) · Margin **27.7%**

Margin under 10% turns red. Document totals update live at the bottom.

A 3-layer job is costed as PET + **MET PET** + poly, each on its own rate, so
the margin shown accounts for the metallised ply being dearer than plain PET.
Set that rate on the Rates screen; without it the strip reports no cost at all
rather than a flattering one.

Underneath, each ply is listed with the rate it was costed against:

> PET 16.8 GSM · Rs. 210.00 · MET PET 16.8 GSM · Rs. 258.00 · Poly 42.3 GSM · Rs. 185.00

Rates are fetched from the Rates screen automatically, as of the quotation's
date. A margin is only worth trusting if the working behind it can be seen, and
a component with **no rate that day says so** in red rather than going blank —
so the office knows what to go and enter.

**The cylinder total shows its sum.** Transport is added to it, so the hint
under the field reads `4 × Rs. 9,085 + Rs. 100 transport`. Without that, anyone
checking the figure as cylinders × cost-per-cylinder lands short by exactly the
transport and concludes it is wrong. The PDF carries the same note under the
totals whenever transport was charged.

### Record the outcome — won or lost

The tick on a row asks what the customer said. It appears **only once a
quotation has been sent**: there is no answer to record on a draft nobody has
seen, and winning one would create a customer off the back of an unsent
document.

**Accepted** does more than change a badge, so the dialog says what it is about
to do before it does it — the company is added to your customers if they are not
there already, and every job on the quotation is added to their record. Jobs
they already hold are left alone. The toast afterwards reports what actually
happened rather than a generic "saved":

> Quotation #122 won · Winmark Snacks LLP added to customers · 2 jobs added

That means the customer list and job records are genuinely different afterwards,
so both caches are refreshed.

**Rejected** asks why, and will not save without it. A line is enough — price,
lead time, went to a competitor. "We lost it" tells nobody anything a year
later, and the reason is the whole value of recording the outcome at all.

Winning after a loss clears the old reason, so a quotation never carries a
stale explanation.

### Send a quotation

Emails the quotation to the customer with the PDF attached. Reached from the
envelope on a row in the list, from its card on mobile, or from **Send** in the
preview once you have looked the document over.

Sending from the preview **closes it first** rather than opening one dialog on
top of another: `Modal` installs its own Escape handler and focus trap, so two
at once would fight over both. The Send button is not disabled while the
preview is still rendering, because sending builds its own PDF on the server
and never waits on the copy being drawn on screen.

Recipients are **chips, not a comma-separated box**: a mistyped address can be
removed without re-typing the rest, and what will actually be sent is visible at
a glance. Enter, comma or Tab commits one; Backspace on an empty box takes the
last one back; pasting several addresses at once splits them.

**The customer's saved address is filled in automatically** when the quotation
has one — and the hint says so, rather than leaving a mystery address in the
box. Where there is none, it says that too, so an empty field does not look
broken. `NA` from the spreadsheet import is treated as no address, not as one.

The dialog also lists what has already been sent, with recipients and who sent
it, because the common question before sending is whether someone already did.

Sending takes fifteen seconds or more — the server renders the PDF first — so
the button says "Sending…" and a line underneath explains the wait.

**A Draft becomes Sent** once the email goes out, and the list updates on its
own. A quotation already Won or Lost keeps its status: forwarding a copy should
not drag it backwards. If the send fails, nothing changes — the reason appears
in the dialog and the quotation stays exactly as it was.

### Quotation preview

Shows the **actual generated PDF**, from the same endpoint as the download — so
the preview and the file are the same bytes and cannot disagree.

The PDF is **fetched by the component**, and only then handed to `<object>` as a
blob. Three reasons, each of which alone would be enough:

- The endpoint needs a session, and the token travels in a header. `<object
data="…">` is a navigation and cannot carry one.
- The element cannot report progress. Chrome instantiates its PDF viewer and
  fires `load` immediately, while the document is still in flight, so a spinner
  tied to that event vanishes against an empty viewer.
- **Download** and **Open in tab** reuse the same blob. Rendering takes fifteen
  seconds or more, and pointing each button at the endpoint would rebuild the
  identical document from scratch. Both are disabled until it arrives, then
  instant.

Failures show the reason — a 403 and a timeout need different responses — rather
than a permanently blank frame.

The download button on each list row works the same way, showing a spinner in
place of its icon while the server renders.

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

**Every request goes through `apiClient`, including files.** Use `requestBlob()`
for a PDF or any other download — never an `<a href>` or `<object data>` to an
API path.

Two separate bugs came from breaking that rule, and both are worth remembering.
A hand-written `/api/…` hard codes the assumption that the API is same-origin,
true of the Vite dev proxy and false the moment `VITE_API_BASE_URL` points
elsewhere — that 404'd the quotation PDF in production while every other call
worked. Then sign-in landed, and the same links answered 401: the session token
travels in a header, and **a browser navigation cannot carry one**. Only script
can.

So an authenticated file is fetched and handed to the page as a blob. The axios
instance attaches the token, one place knows how requests are authenticated, and
neither failure can recur.

**Access is decided twice, on purpose.** The sidebar hides sections a user
cannot open and route guards refuse them, but that is presentation — it stops
the app looking broken. The API enforces the same rules independently, because a
guard in the browser is no obstacle to anyone willing to open the network tab.
Both read the same `APP_MODULES` list from `@yuva/shared`.

Where someone lands after signing in is **the first section they can actually
open**, not a fixed `/customers` — otherwise a user with only Rates would be
dropped onto a page telling them they have no access. A remembered destination
from before sign-in is honoured only if the newly signed-in user may visit it,
since that path belonged to whoever was here last.

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
| `Logo`                | The client's YUVA mark. Sized by height; served from `public/logo.svg`                                                                                            |
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
