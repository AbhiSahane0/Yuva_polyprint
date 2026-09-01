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

### Sign-in log — `/monitor` (administrators only)

Who has been using the system, and when. Read-only — there is nothing to click
except **Refresh**, and it refetches by itself whenever the tab is focused again.

Three sections:

- **Accounts** — every account with the last time it was used, and a badge on
  anyone signed in right now.
- **Signed in now** — one row per live session, so a person signed in on both a
  desk machine and a phone appears twice. That is the point: two rows means two
  browsers, not two people.
- **Sign-in history** — every successful sign-in, grouped under a date heading.
  A flat list of several hundred timestamps is unreadable, and the question the
  office actually asks is "who was in on Tuesday".

Each history row shows the browser and the address it came from. The browser
description is a guess from a handful of well-known tokens and shows nothing at
all rather than something wrong when it does not recognise one.

**Times are India Standard Time**, formatted from a fixed +05:30 offset rather
than the browser's locale, and the page says so at the top. A laptop that
travelled, or one with its clock region set wrongly, would otherwise quietly
answer a different question from the machine next to it. India has never
observed daylight saving, so the fixed offset is exact for every date.

Rows without an address or browser are the ones recovered from existing sessions
when the log was first switched on — see [the API README](../api/README.md) for
what that backfill did and did not know.

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

**One row per quotation number, showing its current version.** A revision keeps
the number, so listing every version would put two rows reading "121" side by
side with different totals — the confusion versioning exists to prevent. Earlier
versions are reached through the dropdown in the preview.

### Quotation form — `/quotations/new`, `/quotations/:id/edit`

Four steps, not one long scroll:

```
1 Customer   2 Details   3 Jobs   4 Review
```

The steps are genuinely sequential — a job cannot be priced before the customer
is known, and nothing can be reviewed before there are jobs — so **Next**
validates only the step you are on and nothing else. Completed steps are
clickable to go back; nothing is submitted until the last one, so leaving and
returning costs nothing.

The old single page put customer, jobs, terms and totals on one scroll. It
worked, but never said how much was left or what still needed doing.

**There is no Terms step.** The terms were the same six lines on every quotation
this works has ever sent, and a seven-row textarea asking to confirm them was a
step the office had to walk past on the way to the totals. They are printed from
the company's standard set, and the date is simply today — the office's today,
taken from the local calendar rather than from UTC, because a night shift keying
a quotation at one in the morning would otherwise date it yesterday. An older
quotation that carries edited terms keeps them when it is edited.

#### 1. Who it is for

**Existing company** or **New company**, chosen as two separate paths rather
than one field that behaves differently depending on what is typed into it —
which of the two you are doing is a decision the office makes before they start.

- **Existing** makes the company name a **searchable text box**. With dozens of
  companies, typing three letters beats scrolling a list, and it stays a text
  field so an unusual name can still be typed. Choosing one fills in the address,
  mobile, email and GST number on the next step.
- **New** gives plain boxes, and the company is **added to your customer list
  when the quotation saves** — so the next enquiry finds it under Existing
  instead of being retyped. A name that already exists is reused, not duplicated.

Switching between the two **clears the link**. Leaving a half-filled form behind
is how a new company inherits the previous one's GST number.

#### 3. What it is

One dropdown beside the job's name and size:

> Standup · Standup zipper · Zipper · Spout pouch · Centre seal ·
> Three side seal · Other · Roll

**The hint under it says how that style is priced** — "Priced per pouch" on
standup and standup zipper, "Priced per kg" on the rest. That choice silently
drives the whole rest of the form, and it used to be discoverable only two steps
later. Choosing Other reveals a box to say what it is; choosing Roll clears the
pouch style rather than raising an error.

> A grid of eight drawn pouches sat here before. It read as decoration rather
> than a control, and it pushed the fields that matter below the fold on every
> single job.

#### The structure, ply by ply

Each ply gets its own row: **choose a film, and that is the whole row**. Its
gauge, density and GSM are shown beside it. **2 layer / 3 layer** adds or
removes rows rather than swapping the form, so moving from two plies to three
keeps everything already typed and only asks for the new one. The outermost and
the sealant are labelled, because those are the two the office actually thinks
about.

> This replaces a single **Film** dropdown that set only the sealant, with the
> printed PET and the metallised ply assumed. The client could not read what he
> was quoting off that control.

**There is no thickness box.** Every film in the rates master is named with its
gauge — `PET 12µm`, `PE 60µm`, `PVC / PETG 45µm` — because a 12µ PET and a 19µ
PET are bought, stocked and priced as two different materials. The film _is_ the
thickness, so choosing it sets the micron and the two cannot disagree. Typing
them separately is how quotation #123 came to carry a "PET 19µm" ply recorded at
60 microns.

The consequence worth knowing: **a gauge the works wants to quote has to exist
in the rates master.** A 70µ polythene needs `PE 70µm` adding under Rates, which
is where a new film belongs anyway — it has its own price. The one film named
without a gauge, `PP Woven`, is specified by GSM rather than thickness, and it
alone still shows a thickness box; guessing at it would silently under-weigh the
laminate and report a confident, wrong cost per kilogram.

Only two and three plies are offered, which is what the works produces. The
engine and the schema handle four, so a foil laminate can be quoted the day it
is genuinely needed — it is simply not on screen, because an option nobody uses
is one more thing to read past on every job.

**A ply left unchosen makes the line uncostable, not free** — the strip says
"Not costed — every ply needs a film" rather than showing an average of whatever
is left.

#### Repeat or new design

A customer with jobs on record gets a **Saved job** dropdown on each line, with
**— New design —** at the top. Choosing a saved job fills in the name, the size,
the structure and the cylinder count, so a repeat order is picked rather than
retyped.

**The materials are deliberately left blank.** The jobs table records
thicknesses but never recorded which film was used, and guessing one would put a
rate behind a margin nobody chose. The prefilled gauge is shown on the row as
`12µ · Film not chosen`, so a figure already driving pouches-per-kg is not
hidden behind the empty dropdown; naming the film replaces it with that film's
own gauge.

Switching back to **— New design —** clears the design: name, size, structure,
repeats and cylinder count all return to their defaults. Leaving the previous
job's details behind is how a new design gets saved under an existing job's
name, which is far harder to notice than an empty box. **The quantities are
kept** — what to charge is a decision about this order, not part of the design
being described.

Note that 18 of the 414 imported jobs carry no size or thickness at all. Picking
one of those fills in only its name — that is missing data from the original
spreadsheet, not a failed prefill.

#### Quantities

One to three per line, each with its own quantity and rate, and its result
alongside:

> **Rs. 1,45,000** · 25,000 pouches · **31.2% margin**

Margin under 15% turns amber. Which pair you type is decided by the
construction, not chosen here — standup and standup zipper ask for a pouch count
and a rate per pouch, everything else for kilograms — and the other unit is
worked back and shown beside it, because the film is ordered by weight either
way.

Every job on one quotation must be priced at the same number of quantities. They
are columns on one document, and a job with three where another has two would
leave a hole no total could describe.

#### Cylinders

**The section appears only for a new design.** Pick a saved job and it goes
away entirely, replaced by a line saying so:

> Repeat of a saved design — **no cylinder charge**. Cylinders for ADF Plain 1kg.
> are already in the works.

Choose **— New design —** and it comes back, with repeat width and height, the
number of cylinders, and transport.

**It follows the design, not the customer.** A customer of ten years ordering a
new pouch still needs a set engraved, which is exactly what the printed terms
say — so the trigger is which job the line is for, not who is ordering it.
Keying it to the customer would have made those cylinders quietly
unchargeable.

**The cylinder total shows its sum.** Transport is added to it, so the hint
under the field reads `4 × Rs. 9,085 + Rs. 100 transport`. Without that, anyone
checking the figure as cylinders × cost-per-cylinder lands short by exactly the
transport and concludes it is wrong. The PDF carries the same note under the
totals whenever transport was charged.

#### 4. Review

What the customer will see: every job at every quantity, the cylinders on their
own row, and the total including GST.

**Notes** live here, at the foot of the review. They lost their step along with
the terms but not their purpose — a line about a sample or a delivery week
belongs on the document, and this is the last screen before it goes out. Left
empty, nothing is printed.

The cylinder row is **identical in every column** — they do not scale with the
order. That is the whole reason for quoting more than one quantity, and it only
reads as a comparison side by side.

Then **Save as draft**, which keeps it editable, or **Save and send**, which
opens the printed quotation so it can be checked before it goes out.

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

#### Versions

**New version** creates a revision: the same quotation number, the next version,
as a draft. The version it came from stays exactly as the customer received it.

A **Version** dropdown appears above the document once there is more than one —
one option is furniture. Switching reloads the PDF for that version without
disturbing the page underneath.

Earlier versions are **read-only**. Edit, Send and New version only appear on
the current one, for two reasons: an earlier version is a record of what went
out, and re-sending it would put a superseded price back in front of the
customer. It also could not have worked — the list looks the row up among the
ones on screen, and superseded versions are deliberately not there.

Nothing is repriced when a revision is created. It copies plies, quantities,
tiers and totals verbatim, because pressing the button should not silently move
a figure the customer has already been quoted; it reprices on the first save.

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
