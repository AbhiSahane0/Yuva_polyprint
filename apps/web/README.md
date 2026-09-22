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
│   ├── ui/                Button, Field, Input, NumberInput, Select,
│   │                      Combobox, Modal, Badge, EmptyState, Toaster,
│   │                      ReadOnlyValue, Spinner, LoadingState
│   └── layout/AppShell    sidebar on desktop, slide-over drawer on mobile
├── features/
│   ├── auth/              login, session store, route guards
│   ├── users/             user management (admins only)
│   ├── customers/         customer list, edit modal, job specification editor
│   ├── quotations/        quotation list, form, PDF preview
│   ├── inventory/         stock, batches, the movement ledger
│   ├── purchase/          suppliers, orders, receiving into stock
│   ├── cylinders/         the design register and cylinder history
│   ├── artwork/           design files: upload to R2, versions, previews
│   ├── costing/           machines, wages, and the rate a job is costed at
│   ├── gstin/             GSTIN field and lookup, shared by two screens
│   ├── monitor/           sign-in log (admins only)
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

#### Company and brand

Two names, because customers genuinely have two. **Company** is who they are
registered as and what belongs on an invoice; **Brand** is what they sell under
and what the office actually calls them — a proprietorship registers as a person
and trades as a brand.

The table shows **Brand** where Contact used to be. A contact person was
recorded for almost none of the imported customers; it is still stored and still
editable on the form, it simply no longer earns a column.

Searching matches on **both names**, so typing a brand finds the company
registered behind it. That is the point — an enquiry arrives naming the brand.

Brand starts empty on every customer; the office fills them in as they go. The
quotation wizard shows it under the company once one is chosen, so you can
confirm you picked the firm behind the brand you were asked about.

#### GST number

Sits with the contact details, is carried onto every quotation raised for that
customer, and is checked in two quite different ways.

**The format check is free and runs as you type.** A GSTIN carries its own check
digit, so a typed one can be verified offline with no network and no cost:

```
27  AIGPH5992Q  1  Z  D
─┬  ─────┬────  ┬  ┬  ┬
 │       │      │  │  └── check digit, Luhn mod 36 over the first 14
 │       │      │  └───── 'Z', reserved
 │       │      └──────── registrations this PAN holds in this state
 │       └─────────────── the holder's PAN
 └─────────────────────── state code
```

Measured exhaustively, this catches **100% of single-character typos** and
**100% of adjacent transpositions** — which is essentially the whole realistic
error space for a number copied off a letterhead. It also names the likeliest
cause rather than saying "invalid": reading a GSTIN off paper confuses 0/O and
1/I constantly, and where each is legal is not obvious.

A **blank** GST number is not an error. Registration is not compulsory below the
turnover threshold, so plenty of genuine small customers have none.

**The registry lookup costs money and happens only on Verify.** Never on blur,
never on mount, never on a retry. It answers what arithmetic cannot — was this
number ever issued, to whom, and is it still live — and returns the legal name,
trade name, registered address, constitution, taxpayer type and status.

**Use these details** fills in the company name, address, city and district
from what came back, so a new customer is one paste rather than six fields. It
never blanks a field you have already filled in — the registry leaves plenty of
these empty, and an empty answer is not a correction.

> **It fills in the trade name, not the legal one.** A proprietorship registers
> under its proprietor, so Yuva's own GSTIN returns `ANAND KISAN HASE` as the
> legal name and `YUVA POLYPRINT AND PACKAGING INDUSTRIES` as the trade name.
> Putting the first into a customer list would leave a row nobody recognises.
> The panel shows it as **Registered as** when the two differ, because that is
> the name a GST invoice has to carry — which Invoicing will need and the
> customer list does not.

**E-way bill blocked** appears beside the status when it applies. It is separate
from being Cancelled: a registration can be Active and still blocked for
non-filing, which stops an e-way bill being raised — a delivery problem rather
than a billing one.

Every answer is **cached permanently by GSTIN**, so a credit is spent once per
customer and never again. The panel says whether you are looking at a fresh
check or an old one, because the status is the one field that goes stale.

> Anything other than **Active** is the whole point of having looked. Quoting a
> cancelled registration is survivable; invoicing one costs the customer their
> input tax credit. The re-check belongs in Invoicing, not here.

The same field appears on the quotation wizard's Details step, because a new
company is created from there too.

`NA` never appears in the UI. The imported data is full of it, so the table
shows a muted dash and edit boxes open blank. Clearing a box saves it back as
`NA`, keeping the database consistent with the import.

Removing a job from the list **unlinks it, it does not delete it** — the job
returns to the "needs a customer" worklist.

### Orders — `/orders`, `/orders/new`, `/orders/:id`

**What the customer actually asked for.** A quotation is an offer and a job
sheet is a post-mortem; this is the commitment in between — a quantity, a rate
agreed, the day it is wanted and where it has got to. Before it, winning a
quotation was a dead end.

**Ordered by what is open and soonest due, not by number.** A list ordered by
number puts the oldest order at the bottom on the day it goes late, which is the
one morning anybody needs to see it.

Two figures head the screen — **Open** and **Past due** — because those are the
two questions asked of it every morning. Past due earns its colour only when
there is some; a red zero is a red herring.

**How late, in words.** A date on its own makes somebody do the arithmetic every
time they read the row, and the answer they want is "is this a problem". So a
due date reads `05-09-2026 · 3d late` or `· in 4d` or `· today`. Only on an open
order: a completed one was due whenever it was due, and telling the office it is
40 days late is both true and useless.

**Reading is open to anyone signed in** — what is due and when is the floor's
question as much as the office's — and the module guard sits on the routes that
raise or change one, not on the section. A screen hidden from the people who
need to read it is the wrong shape of protection.

#### One order shows what may happen to it, and nothing else

The status actions sit in **one row on a desktop** — they had wrapped onto two
lines, which read as two groups when they are one — and behind a **single menu
button below `sm`**. Stacked full-width on a phone they pushed the order's own
figures, the quantity and the rate and the amount, off the first screen; the
page is read far more often than it is acted on.

The status buttons are only the places it may actually go. Offering every status
and refusing four of them on save teaches the office to expect errors; offering
one or two teaches them the rule. A completed order has no buttons at all and
its fields lock — an end that a dropdown can undo is not an end.

**Delete only exists while nobody has started it.** Once it has been in
production there is a run behind it, and a deleted order is a run nothing
explains. The dialog says so and points at cancelling instead, which keeps the
record — and asks why, for the same reason a lost quotation does.

Three fields stay editable after the fact, because they are the three that
genuinely change: the **due date**, the customer's **PO number**, and **notes**.
The quantity and rate are what was agreed and are not an edit — changing them is
a correction, and it belongs where the correction was decided.

#### New order — for the phone

Most orders arrive by winning a quotation, which carries everything across on
one click. This is the other way in: repeat business taken without pricing it
again, which is a real part of how the works runs and would otherwise have no
record at all.

Deliberately short — a customer, a job, a quantity and a rate. Everything a
quotation would have decided belongs to the quotation, and asking for it again
here would make this the slower path to the same place. The **amount** updates
as you type, through the same `orderAmount` the server stores it with, so the
figure on the screen and the figure on the record cannot differ.

### Quotations — `/quotations`

By default the list reads as a **work queue, not a diary**: Draft first, then
Sent, then Won and Lost, with the newest at the top of each group. Drafts need
finishing and sent quotations need chasing, so whatever still needs doing sits
at the top. Search by number, customer or job name, and the same four filters
narrow it.

**Number, Customer, Date and Status sort.** Click a header to order by it, click
again to reverse, and a third time to come back to the work queue. That third
click is the one that matters: the queue is what the list is for, and without it
the default order is unreachable once anything has been sorted.

Each of those headers carries a faint double arrow whether or not it is the
active column, which darkens into a single arrow pointing the way it is
currently ordered. An arrow that only appears on hover is invisible to anyone
who has not already hovered, so the feature would only ever be found by
accident.

Text columns open ascending and the rest descending, because that is what each
is wanted for — names are looked up alphabetically, numbers and dates are asked
about newest-first.

**The sort happens in the database.** The list is paginated, so re-ordering in
the browser would only shuffle the twenty-five rows on screen and quietly lie
about which quotation is the oldest. Every sort carries the quotation number
behind it as a tie-break; without one, two quotations sharing a date — which is
most of them, the office writes several a day — have no defined order, and
Postgres is free to return them differently on each page. That reads as rows
jumping about while paging.

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

#### The date decides what it costs

The quotation carries a date, on the Customer step, defaulting to today. It is
not only what gets printed: **the rates and the overheads in force on that day
are what price the job**, so an older one entered now is costed as it would have
been then rather than at today's film prices.

The server always did this. The screen did not — it read today's rates whatever
the quotation said — so opening a quotation written for an older day showed a
rate the server would never have stored. Both now read the same day.

Two consequences worth knowing:

- **A film with no rate recorded before that date is free.** Rates carry forward
  from the last entry on or before the day asked for, and if there isn't one
  there is no price at all. It costs nothing, silently. This is real: rebuilding
  the client's 2022 quotations came out about Rs 20 a kilogram light on every one
  of them, because the blended adhesive had only ever been priced in 2026.
- **Settings answer the same question**, so an overhead that has since moved does
  not rewrite a quotation made before it moved.

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

Switching between the two **empties every box on the step** — name, brand,
address, mobile, email and GSTIN. Switching is a statement that this quotation
is for somebody else, and leaving a half-filled form behind is how a chosen
customer's address ends up saved onto a firm it belongs to no part of. Only the
name used to be cleared, and only in one direction.

**Brand** sits beside the company on both paths. For an existing customer it
arrives from their record; for a new company it is typed, and set when the
record is created. Searching matches company name **and** brand, so an enquiry
naming a brand finds the firm behind it.

**Referred by** sits beside the date. Business arrives through people and the
works wants that on the record — but it is **recorded and nothing else**: not
printed on the quotation, not emailed, not searched, not totalled. The hint
under the box says so, because a field somebody assumes is printed is one they
find out about by sending a document.

It belongs to the **quotation** rather than to the customer, which is why it
survives switching between an existing company and a new one, and why it is not
in `clearCustomerFields`. Two enquiries from one company can come through
different people, and a per-customer view can be derived from these later; the
reverse cannot. A revision carries it across with the rest of the customer
block, a revision being the same enquiry repriced.

What it is eventually **for** — commissions, a referrer master, totals — is the
works' decision once they have a year of it, and building that shape now would
be guessing at it.

**A new company becomes a customer when the quotation saves** — with its
address, city and district kept apart rather than joined into one line, and with
every design on the quotation recorded as a job against it. Saving twice does
not create a second copy of either.

#### 3. What it is

Two questions, not one. **Type** is Pouch or Roll; **Pouch type** is the style,
and only appears for a pouch.

> Standup · Standup zipper · Zipper · **D punch** · Spout pouch · Centre seal ·
> Three side seal · Other

**The style no longer decides the UNIT a line is priced in.** Every line this
form writes is priced per kilogram, and the pouch figures are worked out from it
— see [Quantities](#quantities). Choosing Other reveals a box to say what it is.

**But the style decides three costs**, because the works costs from two
documents and its pouch workbook keeps a sheet per style:

|                         | what the style changes                                       |
| ----------------------- | ------------------------------------------------------------ |
| **Making**              | 0.25 a pouch; a **D punch** 0.60, or 0.80 over 450 mm wide   |
| **Zipper**              | Standup zipper and Zipper add width × Rs 3.60 a metre        |
| **Wastage and ink GSM** | those four styles use 7% and 1.2; everything else 8% and 1.8 |

The first four styles are the pouch workbook's; centre seal, three side seal and
spout are costed on the Estimation sheet. That line matters more than it looks:
all seven of the client's verified 2022 quotations are **centre seal**, so a
rule reading "any pouch" would have moved every one of them.

**A roll is not a pouch.** Choosing it clears the style and any gazette, hides
both controls, and forces kilograms. Film on a reel has not been converted into
anything, so it yields **no pouches at all** — the quantity row reports the
weight and drops the count entirely, and the printed document shows a dash,
because `0.00` reads as a count of something rather than as an absence.

> These were one dropdown for a while, which read tidily and hid the thing that
> matters most. Before that it was a grid of eight drawn pouches, which read as
> decoration and pushed the fields that matter below the fold.

#### Gazette pouches

A gazette gussets at the sides and the base so the pouch stands. Off by default,
because most jobs are flat bags; ticking it reveals **bottom**, **left** and
**right** depths.

Those depths are film the flat sheet has to carry:

```
film width  = width  + left + right
film height = height + bottom
```

**Everything works from the film, not the pouch** — the weight, because that
film is what is bought, and the cylinder, because that film is what is printed.
A 350 × 250 pouch with 4 / 4 / 10 is cut from **358 × 260**, which is both
heavier per piece and a wider engraving.

The **Film size** box is where that is stated: a 350 × 250 pouch with 4 / 4 / 10
reads `358 × 260`, and the cylinder width beside it reads 438 — the film plus
the 80mm margin. The cylinders once carried captions spelling that sum out, and
they have been removed along with the rest of the workings; Film size is what
explains a cylinder wider than the pouch.

Unticking zeroes the depths, so a stored line cannot carry a 10mm bottom gusset
that was never charged for.

#### The structure, ply by ply

Each ply gets its own row: **choose a film, a gauge, and the rate for this
job.** Beside them sits what the price list says — `List Rs. 210.00 / kg` — and
nothing else. **2 layer / 3 layer** adds or removes rows rather than swapping
the form, so moving from two plies to three keeps everything already typed and
only asks for the new one.

> The row used to state the gauge, the density and the resulting GSM. All three
> are inputs to the cost rather than facts anyone needs while choosing a film,
> and three figures per ply read as noise on a screen with six of them. The rate
> is what the question at that dropdown actually is, and it is the reason a ply
> gets swapped. A film with **no rate on record** says so in amber, because that
> is where an uncostable line begins.

> This replaces a single **Film** dropdown that set only the sealant, with the
> printed PET and the metallised ply assumed. The client could not read what he
> was quoting off that control.

**The gauge is typed, and the film fills it in.** Films in the rates master are
named with a gauge — `PET 12µm`, `PE 60µm`, `PVC / PETG 45µm` — so choosing one
puts that figure in the **Micron** box as a starting point, and the two agree
without anyone typing twice.

The box stays editable, and typing over it changes nothing but the weight.
**A film has one rate, and it applies at every gauge.** The works pays near
enough the same for a kilogram of PET whether the reel is 12 micron or 15, so it
keeps one PET rate rather than one per thickness — and the same for MET PET, PE
and the rest. A kilogram of PET is a kilogram of PET. What the gauge decides is
how many metres that kilogram covers, which is the GSM and is already carried
everywhere the cost needs it.

#### The rate agreed for this job

Every chosen film carries a rate box, and **it arrives with the film's own rate
already in it.**

```
Layer 1   [ PET ▾ ]       Micron [ 12 ]   Rate for this job [ 185 ]
                                           List Rs. 185.00 / kg

Layer 2   [ MET PET ▾ ]   Micron [ 50 ]   Rate for this job [ 170 ]
                                           List Rs. 180.00/kg — this job is
                                           Rs. 10.00 below
```

It used to be a greyed hint instead — the rate shown through the box rather than
in it, with blank meaning "follow the list". A hint reads as an empty field, and
an empty field beside the word **rate** is the one thing on that row that looks
like it still needs doing. The office kept asking why the figure was not filled
in, which is the right question: the figure was known, and the screen was being
coy about it.

It is a box at all because **a film's price is agreed job to job**. The works'
own quotations carry PET at 185, 175 and 190 — every one at 12µ, every one
written on 23 March 2022.

**The column beside it stops repeating the rate and reports the distance
instead.** Once the box is filled and editable, nothing else on the screen would
catch a digit dropped in it: 190 where 210 was meant is a perfectly plausible
number. So the column names the **list** rate, quietly while the two agree, and
says how far apart they are when they do not.

What is typed is used for this quotation and stored on it — `rate_override` on
the ply. Plies saved before that column existed are read through the old
inference from the gauge, so nothing already on file moves. A box left empty
still falls back to the film's rate, which is what every quotation saved before
the box was filled in does.

#### A gauge off the price list is not a problem to be solved

It used to be. Typing a gauge the chosen film's row does not name turned the box
into the only price there was, renamed it **Rate for this gauge**, and refused
to cost the ply until somebody filled it:

```
Layer 2   [ MET PET ▾ ]   Micron [ 50 ]   Rate for this gauge [ Rs. / kg ]
                                           MET PET 12µm is priced at 12µ — Rs. 180.00/kg
```

That was built on reading the master as holding `PET 12µm` and `PET 19µm` as two
materials at two prices, so a third gauge matched neither and had to be asked
about. **The works does not price that way.** One rate covers the film at every
thickness — which means the screen above was demanding a figure nobody had a
reason to give, on a 50 micron sealant, which is not an exotic request but half
of everything they laminate. Until it was given the line did not cost itself:
the material cost was blank and the margin read as a dash.

Now the film's rate applies and the ply costs. Nothing is asked, nothing is
invented, and the box still sits there filled in for the job that was genuinely
agreed at something else.

**That rate is used for this quotation and stored on it. It does not reach the
Rates master.** A figure keyed in the middle of quoting is a decision about one
document; letting it edit the price list would make every quotation a chance to
change what every other quotation costs. Adding `PET 20µm` properly is a job for
the Rates screen, where it gets a rate history like every other material.

**Swapping the film replaces the rate with the new film's own** — 245 was the
price of a PET and must not survive onto a `Foil 7µm` ply.

**Correcting the gauge leaves the rate alone**, because the gauge no longer
decides the price and there is nothing for it to invalidate. The one exception
is a gauge that moves the ply onto a different row of the same family, where the
box follows that row only if it still holds the previous one's figure untouched:
that one was put there by the form and means no more than "the list", where
anything else in the box was typed by somebody and is theirs.

Reopening a saved quotation puts the stored rate back in the box. For plies
saved before that column existed it is deduced — the ply keeps the film's name,
and a name stating a gauge different from the one quoted **was** the override.
That rule lives in `@yuva/shared` because the server reads it too: it carries
the rate through when repricing from storage, and if the two disagreed a
quotation would display one rate and be repriced at another.

The one film named without a gauge, `PP Woven`, is specified by GSM rather than
thickness — which, now that gauge and price have nothing to do with each other,
makes it no different from any other row.

Only two and three plies are offered, which is what the works produces. The
engine and the schema handle four, so a foil laminate can be quoted the day it
is genuinely needed — it is simply not on screen, because an option nobody uses
is one more thing to read past on every job.

**A ply left unchosen makes the line uncostable, not free.** The margin falls to
a dash rather than averaging whatever is left, and hovering it says why: "No
margin without a costed structure — every ply needs a film with a rate."

#### Repeat or new design

A customer with jobs on record gets a **Saved job** dropdown on each line, with
**— New design —** at the top. Choosing a saved job fills in the name, the size,
the structure and the cylinder count, so a repeat order is picked rather than
retyped.

**The materials are deliberately left blank.** The jobs table records
thicknesses but never recorded which film was used, and guessing one would put a
rate behind a margin nobody chose. The thicknesses are still there and still
driving pouches-per-kg; what is missing is the rate, and the line says so by
refusing to show a margin until every ply names a film.

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

One to three per line, and every figure on one is typed in **whichever unit you
were given**:

```
QUANTITIES                                                     Add a quantity

  Quantity 1                     Rate 1 (i)
  [  500  ] = [  21,565  ]       [  281.24  ] = [  6.5208  ]    21.1% gross · 7.1% net
      kg          pouches            per kg        per pouch
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Rs. 1,40,621  in all  ·  21,565 pouches at 23.19 g each                 │
 └──────────────────────────────────────────────────────────────────────────┘
```

**Two pairs, not two modes.** There used to be a `Sold by [Kilogram | Pouches]`
switch, and it decided which pair of fields the row was bound to — so whichever
unit was picked, the other was off screen. Quoting per piece hid the weight the
film is bought in; quoting per kilo hid the count the customer asks for.

Each pair is two readings of one number, joined by the equals sign that says so.
**Type into whichever half the conversation gave you:**

| The customer says                     | Type it here          |
| ------------------------------------- | --------------------- |
| "five hundred kilos"                  | Quantity, **kg**      |
| "we need a lakh pouches"              | Quantity, **pouches** |
| "what's your rate a kilo?"            | Rate, **per kg**      |
| "make it six-fifty and we'll take it" | Rate, **per pouch**   |

The **kilograms and the rate per kilogram are what the form holds** — the film
is bought by weight and every line of the costing is worked out from it. The
pouch halves convert at the laminate's own weight per pouch and write back, so
there is one source of truth and the two cannot drift. A rate each is kept to
four decimals, because a pouch is often under ten rupees and two would round a
half-paisa negotiation away.

**The pouch halves are disabled, not hidden, until the laminate has a weight.**
They need every ply to have a film with a density before they can convert
anything. Hiding them would make the row change shape as films are chosen;
disabling leaves the layout still and says what it is waiting for.

**A roll has neither pouch box and no pouch figures.** Film on a reel has not
been converted into anything, so there is nothing to count — the strip still
carries the total, because money belongs in one place either way.

**The strip is what is not a box:** what the order comes to, and the count with
the weight that produced it. Everything the office types is above it.

> The switch carried a real defect as well as hiding half the answer. React
> reused the same input across it — same element, same position, new name —
> while react-hook-form's `register` never writes back into an input it already
> holds. So the boxes went on showing the kilograms that were typed while the
> form read and wrote the pouch fields underneath: **100 and Rs. 400 on screen,
> Rs. 0 as the total beside them.** A quotation could be sent on a figure nobody
> entered. With both units on screen at once that class of bug cannot happen.
>
> Each derived box holds what is being typed into it locally while it has focus,
> and drops it on blur. Without that it is rewritten from its partner on every
> keystroke — "6.5" briefly becomes "6.5000000001" through the round trip, and
> the intermediate states of a long number fight the cursor.

**Gross and net margins** sit beside the rate, because they are a judgement
about it. Gross is the selling rate against the material cost of a kilogram —
films, ink and adhesive only. Net is against what the job actually costs to
make, including wages, power, transport, packing and the press setup, and is
**absent rather than zero** while the line cannot be costed. Hovering either
spells out the two figures that made it. Net under 5% is red, under 12% amber.

**The customer's document carries both too.** A pouch job prints the rate per
kilogram with the rate each underneath it in smaller type — it is the same price
read the other way round, not a second charge, and printing it saves the
customer doing the sum against the pouches-per-kilogram column and getting a
different answer. A roll gets no such line.

Every job on one quotation must be priced at the same number of quantities. They
are columns on one document, and a job with three where another has two would
leave a hole no total could describe.

#### Colours

Which inks the job prints. A new line starts with the four process colours, and
each is a **toggle** — click to take it off, click to put it back:

```
COLOURS                                          Priced colour by colour
[● Cyan] [● Magenta] [● Yellow] [● Black]  [+ Special colour]

4 colours — so 4 cylinders and 4 stations.
```

**Toggles, not deletions.** Taking a colour off and putting it back is the same
gesture, which is what somebody correcting a mistake expects; a delete with no
way back would send them to the job list to start again. A colour that is off
goes grey rather than disappearing, so the line still says what it does not
print.

**A special colour is anonymous, and there may be several.** Which one it is —
the brand's red, a metallic, a white base coat — is settled at artwork, weeks
after the price was given. So the office adds one chip per special station
rather than naming anything, and every special is priced at **the dearest ink on
the rates list**: quote the cheapest and the works loses the difference on every
job where it guessed low, on a document already sent. Where the works stocks
real specials, the dearest of those is used instead of a process ink standing in
for one.

**The strip says what it costs**, because otherwise adding a colour is a change
with an invisible consequence three fields away:

> **5 colours** — so 5 cylinders and 5 stations. A special is priced at
> **Rs. 235.00/kg**, the dearest ink on the rates list, because which colour it
> is gets settled at artwork.

That count is real money. A cylinder is around Rs 9,000, and the sixth and
seventh stations add Rs 5.50 and Rs 7.50 a kilogram.

**Typing a bigger cylinder count fills the process colours first.** The works
fills a press in one order — the four colours it always carries, then whatever
the artwork turns out to need — so typing 7 means CMYK and three specials, not
seven specials.

That reading is not obvious from the code that used to do it, which only ever
appended specials. From a line already showing CMYK it came out right; from a
line showing anything else it came out wrong, and silently. A line with no
process colours read **"7 colours — so 7 cylinders and 7 stations"** with all
seven chips saying _Special colour_ and CMYK sitting unselected beside them, and
every one of those stations priced at the dearest ink on the list — because that
is what an unnamed colour costs. The count was right, the cylinders were right,
only the ink was wrong, and nothing on the screen said so.

There are two ways to arrive at a line with no process colours, and the second
is the one that bites:

- the office takes them off, chip by chip; or
- the count is typed **before the rates list has arrived** to price them from.
  The seeding that would put CMYK there then sees a non-empty strip and never
  runs, so the line stays that way for good.

**The cost of the fix: a deliberately deleted process colour comes back if the
count is then raised.** That is the right trade. Typing a number is a coarse
instruction about stations; taking a chip off is a precise one about ink. So the
precise action stays on the chip, and the coarse one restores the works' normal
order. Shrinking is unchanged — specials go first, newest first, then process
colours off the end.

**The colours price the ink, and only the ink.** A line that names its colours
is costed the Costing sheet's way — each colour on its own laydown, solids and
rate. A line that names none is costed at the works' blended ink rate over the
flat ink GSM, which is the only thing it can be priced at. The method follows
the data rather than a setting, and that is also what keeps every quotation
written before colours existed reading exactly as it did: none of them has a
colour list, so none of them moves.

> A colour the works cannot price is left out of the palette rather than offered
> at zero. A colour costing nothing is worse than a colour missing, because the
> rate still looks plausible.

#### Cylinders

**The section appears only for a new design.** Pick a saved job and it goes
away entirely, replaced by a line saying so:

> Repeat of a saved design — **no cylinder charge**. Cylinders for ADF Plain 1kg.
> are already in the works.

Choose **— New design —** and it comes back, with repeat width and height, the
number of cylinders, and transport.

**The cylinder count follows the colours** — one each — and stays editable. The
works' own sheets count seven stations on a job that prices four inks, because a
station is occupied whether or not its ink is costed, so the figure has to stay
theirs to set. Type in it and the hint changes to _"Yours — no longer following
the colours"_, with a **Follow the colours again** link to hand it back.

**The repeats are suggested from the size**, and stay editable. The cylinder's
circumference is the film's height times the repeat around, so the repeat is
what decides whether a job lands on a cylinder the works owns — left at 1, a
250mm pouch was asking for a 250mm cylinder, which is below anything in the
racks, and the cylinder cost that followed was wrong by whatever the real one
would have been.

The rule is read off the works' own records, not invented. Of the 418 imported
jobs, 347 record a cylinder, and on **84% of those the recorded circumference is
an exact multiple of the design height** — which is the same relationship the
engine uses. Those circumferences cluster around 480, so the suggestion is the
multiple landing closest to 490, and the lanes across are as many as fit the
800mm face.

Checked back against the same jobs, that reproduces the repeat the works
actually chose on **85%**. The remaining 15% are designs where two repeats both
fit the machine and the works took the other one — which cylinder was free that
week, not arithmetic. **That is the whole reason the figure is suggested rather
than calculated and locked**; a locked one would make those jobs unquotable
without a developer.

#### When the cylinder cannot be engraved

Both sizes are worked out rather than typed, so a cylinder outside what the
engraver can cut is something the office would otherwise hear about after the
quotation went out. Each figure carries the limit under it, in red:

> **430** mm is outside the 450–1060 mm the works can have engraved. Change the
> lanes across.
>
> **920** mm is outside the 400–600 mm the works can have engraved. Change the
> repeats around.

|                                 | Can be engraved   |
| ------------------------------- | ----------------- |
| Cylinder width (the face)       | **450 – 1060 mm** |
| Cylinder circumference (around) | **400 – 600 mm**  |

**It warns; it does not block.** An enquiry is allowed to describe something the
works cannot make — that is half of what an enquiry is for — and the office
answers it by changing the lanes or the repeat, which are the two boxes directly
above. A blocked form with no figure on it leaves nobody with anything to tell
the customer.

**The message names the box that fixes it**, because the number it sits under
cannot be edited: lanes for the face, repeats for the circumference.

> **400–600 is narrower than the works' own history, and deliberately so.** A
> design over 300mm tall is already past 600 at two repeats and still short of
> 400 at one, so everything from **301 to 399mm falls between the cylinders** —
> 43 of the 395 imported jobs that record a height sit there, with three more
> above. Those are a record of what was cut over years, not of what can be cut
> now. The suggestion still answers such a height with the repeat closest to the
> preferred size, and the warning says the result cannot be engraved, which is
> the honest pair of statements.

**`450–1060` is not the face the lane suggestion uses.** That is 800mm — what
the works actually runs, and what reproduces its own lane counts on 82% of the
imported jobs. 1060 is what the engraver can cut. Merging the two would put more
lanes across every web, which changes the running metres, the machine minutes
and therefore the rate on every job.

The panel says which it is showing — "Repeats suggested from the size" until
someone edits one, after which it offers to put the suggestion back. A box that
fills itself in is otherwise indistinguishable from one somebody already typed,
and the office needs to know whose figure it is before trusting it. Once taken
over it stays taken over: suggesting again after a decision would quietly undo
it the next time the size was touched.

A repeat order is left alone. Its cylinders exist, and their size is a fact
about what was engraved rather than something to work out again from the size on
screen.

**It follows the design, not the customer.** A customer of ten years ordering a
new pouch still needs a set engraved, which is exactly what the printed terms
say — so the trigger is which job the line is for, not who is ordering it.
Keying it to the customer would have made those cylinders quietly
unchargeable.

**Transport is inside the cylinder total.** Anyone checking that figure as
cylinders × cost-per-cylinder lands short by exactly the transport, so the PDF
spells the sum out under the totals whenever transport was charged. The wizard
no longer does — the field captions were removed with the rest of the workings,
and the printed document is where that arithmetic is actually queried.

#### What the card no longer shows

Every job used to end in a dashed strip:

```
Structure 26µ    485.63 pouches/kg    37.9 GSM        Material Rs. 268.08/kg
```

It has been removed. All four are **workings rather than answers** — nobody
reads them while quoting, because the price and the margin are what is being
watched, and those sit on the quantity row where the price is chosen.

Two things about it were worth keeping and were kept elsewhere:

- **"Not costed — every ply needs a film"** is now the dash where the margin
  would be, which says the same thing on hover.
- **Material cost per kilogram** is one of the two figures the margin's own
  explanation quotes.

> A blank line used to open reading `Structure 64µ` before a single film had
> been chosen. That is 12 + 50 placeholder gauges plus the 2µ of adhesive the
> laminate carries — the defaults a new line starts with. Once the film began
> setting the micron those placeholders stopped being visible, and the 64 had
> nothing on screen to explain it.

#### Saved as you go

For an **existing** customer, leaving the **Jobs** step records each line's
design against them — and only when something changed.

It diffs against a baseline of what the server holds, seeded from the designs
they already have. **Touch nothing and nothing is called.** The baseline only
advances once a write lands, so a failure is retried rather than swallowed, and
stepping back and forward again costs nothing.

Saving a design writes its **job id onto the line**. From then on the quotation
points at a real job, and winning it will not create a second copy.

> **Customer details are not written back.** Correcting an address here applies
> to this quotation only.
>
> They were, briefly, and it erased them: correcting a customer's district and
> pressing Next stored their address, city, mobile and brand as `NA`. Seen four
> times against a real record. The form's own boxes held the right values
> throughout, so something between the form state and the request reported them
> as empty — and an empty string is stored as `NA`. Three attempts at a fix,
> including one that should have made the damage impossible whatever the cause,
> did not stop it, so the write-back is off until the cause is understood.
> `persistCustomerDetails` is kept, not deleted, and re-enabling is one line.
>
> Corrections to a customer are made on the **Customers** screen, which has
> always worked.

> **Saving a new design does not make it a repeat.** It has an id now, but its
> cylinders still have to be cut, so it stays charged. Only picking a job from
> the **Saved job** dropdown means the cylinders already exist.

A **half-typed line is not saved** — no name, no size, no job. The quotation
still carries every field, and winning it creates whatever is missing.

A failed save never costs you your place: the step advances with a warning,
everything typed stays in the form, and the final Save writes the lot.

This applies to existing customers only. A new company has no record to attach
to until the quotation saves and creates one.

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

Then **Save as draft**, which keeps it editable, or **Save and send**.

**Neither of them sends anything.** Both save, and both open the printed
quotation; Save and send is the one that puts a **Send** button on it. Pressing
that asks who it goes to, and the send happens there.

The order matters: the document is looked at before the question of who gets it
is asked. Sending from a wizard step means committing to a page nobody has seen
in the form it will arrive in.

> Save and send used to set the status to **Sent** as it saved, before any email
> existed. Every quotation then said it had been sent whether or not one ever
> left — and the list is ordered by that status, so the queue of what still
> needs chasing filled up with documents nobody had received. The status is now
> advanced by the send itself, once the provider accepts the message.

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

#### WhatsApp numbers

The dialog also asks for mobile numbers, prefilled from the customer the same
way. **WhatsApp delivery is not live yet** — the numbers are recorded against
the send so that nothing the office decided is lost, and the hint says exactly
that rather than implying a message went out.

Numbers are stored in E.164 — `+919545390337` — however they were typed. The
office types `9545390337`, and a paste can arrive as `+91 95453 90337` or
`09545390337`; a history recording those as three different recipients would
make "did we send this to him" unanswerable. Chips show the readable form while
the state stays E.164, so screen and storage cannot drift apart.

**A landline is refused, not dropped.** Indian mobiles are ten digits beginning
6–9, and nothing else can receive a WhatsApp message. One imported customer row
holds a pair of landlines in a single cell — `222394, 222044` — and accepting
either would store a number that can never be delivered to, with nothing to
suggest doubt until a message silently failed months later.

**Email is still required.** WhatsApp is an addition, not a replacement: the PDF
is the deliverable and email is what carries it, so a send with no address would
mean pressing Send and nothing leaving the building.

The history line shows the numbers with **(pending)** beside them while
`whatsappSentAt` is null. Numbers with no timestamp are what was intended, not
what was delivered, and the two must not read alike.

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

### Job sheets — `/job-sheets`, `/job-sheets/:id`

What a run actually consumed, and what it cost a kilogram. The formulas and the
reasoning are in
[the API README](../api/README.md#job-sheets--what-a-run-actually-cost); this is
what the screen does with them.

The list leads with the cost a kilogram, because that is the one figure anybody
comes here for — it is what the office prices repeat work from, and the reason
the sheet is filled in at all. Wastage over the allowance shows red, which is
how a 26% run announces itself without anybody opening it.

#### The sheet is laid out like the paper one

Twenty-one rows in the works' own order, always there, a row the job does not
use sitting at zero. The columns are the ones on the paper: issued, returned,
the mix drum, the rate, consumed, amount. Someone standing at a machine with a
drum in front of them is reading down a printed form they have used for years,
and a form whose shape changes with the job is one they have to read before they
can fill it in.

The **mix out / mix back** boxes appear on an ink's own row, because each colour
is mixed separately. For the solvents they sit at the top of the section, on the
pooled drum, and the row shows an em dash — the figure is not theirs to type.

#### Everything is live

The whole sheet re-costs on every keystroke, through the very same
`costJobSheet` the server runs. Type a corrected consumption and the line
amount, the material total, transport (which follows the kilograms), the margin
and the cost a kilogram all move together.

This was wrong at first and it showed the moment anybody used it: the money only
recomputed on save, so a corrected 30 kg on a line rated Rs 240 sat beside an
amount of Rs 8,890 left over from the last save. A screen whose whole job is
"type it in and see what it cost" has to answer while you are typing.

#### The consumed column

It holds the computed figure as its **placeholder**, which is what makes typing
over it an override. Do that and the box turns amber and says "was 37.040"
underneath, so a correction is visible on the page rather than lost behind the
number that replaced it.

The placeholder is darkened from the browser's default grey. At that grey it
read as an empty box, and this is the column the office checks.

#### Amber "no catalogue rate"

A line with no material behind it. It still costs at whatever rate is typed, but
it has no link to stock, so **posting would skip it**. `seed:job-sheet-materials`
adds the ten the works was missing; until a line resolves, the flag says so
rather than the screen pretending.

#### Two buttons that mean different things

**Cost this sheet** settles it: the cost a kilogram is now the works' answer. It
refuses a sheet with no final output weight, because that is the figure
everything is divided by.

**Take off stock** is the irreversible one, and it asks first. It issues every
line with a catalogue material from the oldest batch, against this job, in one
transaction — then closes the sheet to editing and says so in a green strip.
Correcting it afterwards is a stock adjustment, not an edit.

### Inventory — `/inventory`

What the works holds, what it is worth, and what is running out.

Four figures across the top: materials in stock, **need reordering**, **no level
set**, and stock value. The middle two are why anybody opens this screen twice,
and they are counted separately on purpose — a material nobody has set a level
for is not known to be fine, it is simply not being watched. "Need reordering"
is clickable and filters the list to it; nothing else is, because a figure that
looks clickable and does nothing is worse than one that plainly does not.

**Every active material appears, including ones with no stock at all.** A
material missing from the screen because it happens to be empty is exactly the
one somebody needs to order.

Filter by category — Films, Ink, Adhesive, Solvents, Consumables — and search by
name. Totals are over everything the filters matched rather than over a page: an
inventory value that changes when you click a category filter is not a total
anybody can use.

#### One material — `/inventory/:id`

Stock, the batches it is spread over, and every movement against it.

**Batch level, not roll level.** How much PET is there, what is it worth, and is
it running out are the questions the office asks, and all three are answered per
batch. Individual roll numbers become worth keying in when there is a production
module to consume them; until then they would be typing with no reader.

Batches are listed **oldest first**, which is the order they should be used in,
and an emptied batch stays on the list greyed out — it is what its movements
refer to, and removing it would take the history with it.

#### The four things you can do

|                       | Asks for                                   | Notes                                  |
| --------------------- | ------------------------------------------ | -------------------------------------- |
| **Receive**           | Material, batch, quantity, unit, rate paid | The only action that opens a batch     |
| **Issue** / **Waste** | Batch, quantity, which job                 | Two kinds, counted separately          |
| **Count**             | What was counted                           | Not the difference — see below         |
| **Transfer**          | Where it is going                          | Changes where stock is, never how much |

**Issue and Waste are separate kinds** because they answer different questions:
one is what a job consumed, the other is what the works lost. Folding them
together overstates consumption and hides the losses.

**A count asks what was on the shelf, not the correction.** The office counts
and types the figure; the server works out the difference and its sign. Asking
for the difference means doing that subtraction by hand — which is exactly the
arithmetic a cycle count exists to check. A count that agrees with the books is
still recorded, because it is evidence the shelf was checked, and it shows in
the history as "no change" rather than as a zero.

**An issue larger than the batch holds is refused**, and the message says what
is actually on hand — the usual cause is issuing from the wrong batch. Negative
stock is always wrong, and allowing it hides whichever earlier movement was
mistaken.

#### Receiving something new, in whatever unit it came in

The material is a **combobox, not a dropdown.** Type a name that is not on the
rates list and the delivery creates it — a film the works has not bought before
is an ordinary event, and the alternative is the office unable to book in a
delivery until somebody with the rates module adds it, which leaves the stock
wrong until then. Only then does it ask for a category and the unit it will be
stocked in.

It lands in the rates catalogue **with no price**, showing on the Rates screen
as needing one. The rate on the delivery goes on the batch, not on the
catalogue: what one supplier charged on one day is not the works' rate for the
material.

**The quantity carries the unit on the delivery note.** Film is bought by the
tonne and stocked by the kilogram, so the dialog takes 2 TON and says _"goes
into stock as 2000 KG"_ while you type — a tonne entered as a kilogram is a
thousand-fold error, and it is only obvious next to the figure it produces. The
rate follows: the label reads **Rate paid per ton**, and Rs. 205,000 a tonne is
stored as Rs. 205 a kilogram. Either way the delivery is worth the same money.

The batch keeps what the note said — `2 ton` under the 2,000.00 — so it can
still be checked against the paperwork it arrived with. Ordinary deliveries, in
the unit the material is stocked in, record nothing extra.

**Only conversions within one family are offered.** Grams, kilograms and tonnes;
millilitres, litres and kilolitres. A film cannot be received in litres whatever
the supplier's note says, and the server refuses rather than guesses.

> Litres to kilograms is a property of the substance, not arithmetic, and none
> of the four inks has a density recorded. Ink is priced at Rs. 640 and costed
> in quotations as GSM x rate — which only works if that figure is per kilogram.
> **Whether it actually is has not been confirmed**, and until it is, ink is
> received in the unit it is priced in. If the Rs. 640 turns out to be per
> litre, quotations are costing ink wrongly today, and that is worth looking at
> on its own.

#### Stock movement history

Every change, newest first, with the material's running balance beside it. A
transfer shows the two locations instead of a quantity, because zero in a
quantity column reads as "nothing moved" when the truth is "stock moved, the
amount did not".

**Nothing edits or deletes a movement.** The balance stored on every later row
would be wrong, and a stock ledger that can be rewritten answers nothing — a
mistake is corrected by an adjustment, which leaves both the error and the
correction on the record.

#### Value at cost, not at today's rate

Stock is valued at **what was paid** for each batch, falling back to the
material's current rate only where a batch never recorded one. Today's rate
answers what it would cost to _replace_ the stock, which is a different question
— and valuing at it makes the inventory figure jump every morning when the rates
are keyed in, which reads as stock appearing and disappearing overnight.

#### The reorder level

Set on the material's own page rather than under Rates: it is a stock decision,
and this is where somebody looking at a nearly-empty shelf actually is.

Blank and zero are different. Blank means nobody is watching; **zero means
"shout only when we have run out"**, which is a choice somebody made. Stock is
low **at** the level, not one kilogram below it — at the reorder level is when
to reorder.

#### Deleting a material from here, stock and all

Each row has a **Delete**, and it always asks. This is the screen that can
discard stock, because it is the screen that shows how much there is — the
dialog names the figure before the button is pressed:

> **250 KG** is on the books across 1 batch. Deleting the material takes those
> batches and every movement against them with it — the ledger will no longer
> show that this was ever received or issued.

A material holding nothing says so instead, so the same dialog reads honestly
either way.

**A quotation or a purchase order still refuses it**, naming which. A batch is
the works' own note of what it holds and a material received by mistake has to
be removable; a quotation is a document that left the building, and it has to
stay able to say what it was priced on. That line is where the two part company.

The button needs the **rates** module, not inventory, and is not rendered
without it. Deleting a material is a change to the price list: somebody who may
record a movement should not thereby be able to remove the material the movement
was against.

#### "Not stocked" is not "out of stock"

Every material in the rates catalogue appears here, so a works that has never
received anything would otherwise open the screen to **"17 need reordering"** —
an alarm that means nothing, and one the office learns to ignore within a week.

A material only reads as **out of stock** once it has a history: something was
received against it, or somebody set a reorder level, which is itself a
statement that the works intends to hold it. Everything else reads as **not
stocked** and is counted in neither figure. Running out is an event; never
having stocked something is not.

### Purchase & Suppliers — `/purchase`

What is on order, who it is with, and what has arrived.

Four figures across the top. **Delayed** is clickable and filters to it. The
fourth is **On order**, not spend: money committed to orders not yet delivered.
Calling that spend makes a cash position look worse than it is, so the month's
actual spend — what has been accepted into stock — sits on hover instead.

Orders are listed **open first**: Postgres orders an enum by declaration, and
the statuses are declared Ordered, In transit, Part received, Received,
Cancelled, which is exactly what-still-needs-chasing first.

**Delayed is a separate badge, not a status.** An order can be part received
_and_ late, and folding them into one label would hide whichever the office
needed to see. It is computed against today and never stored — a stored flag
needs a nightly job to maintain and is wrong every hour in between. An order
with no expected date is never late: nothing was promised, and inventing a
deadline the supplier never gave puts orders on the chase list that nobody
undertook to chase.

**Suppliers do not store what they supply or what they last charged.** Both are
read off the orders placed with them. A stored list is one somebody has to keep
up to date, and it is the copy that would be wrong.

#### Deleting a supplier

Each supplier row has a **Delete**, and it asks first. It is for a name typed
wrong, or a supplier added and never used — nothing is lost with them, because
what they supply and what they last charged were never stored in the first
place.

**Anyone with an order against them is refused**, by count: "Sharma Films is on
3 purchase orders. Retire them instead — an order has to stay able to say who it
was placed with." The dialog says so before the button is pressed when it can
see the count, so the refusal is rarely a surprise. Retiring is the switch on
their card: they leave the form, and the old orders keep their name.

A cancelled order counts the same as a live one. It is still a record of an
order placed.

#### One order — `/purchase/:id`

Its lines, and every delivery against them.

An order carries **several lines**, because one order to one supplier usually
covers more than one material and a part-delivery of one should not block the
others. Each line has its own unit — film is ordered by the tonne — and that is
the unit deliveries against it are entered in, so the order reads the way the
supplier invoices it.

**Status is chosen only while nothing has arrived.** Ordered, In transit and
Cancelled are decisions; Part received and Received are facts about deliveries
and are set by recording one. Once stock exists against an order the dropdown
disappears — relabelling it would make the order disagree with the ledger
without undoing anything.

#### Receiving: where buying becomes holding

A delivery records two quantities:

|              |                                                 |
| ------------ | ----------------------------------------------- |
| **Accepted** | Opens a stock batch and appears in Inventory    |
| **Rejected** | Recorded against the order, and goes no further |

**Faulty material is not inventory.** Counting what was sent back would
overstate what the works can actually print with, so a rejection is recorded on
the order — with a reason, which is what gets taken up with the supplier — and
never reaches the ledger.

The accepted quantity goes into stock **through the same path a manual receipt
takes.** One way stock comes into existence, one ledger recording it, one place
that converts units. A second implementation living in the purchase module would
drift from the first within a month. Both are written in one transaction, so a
receipt naming a batch that was never created cannot happen.

The units convert on the way: **1.8 TON accepted against an order at Rs. 205,000
a tonne becomes 1,800 KG in stock at Rs. 205 a kilogram**, in a batch referenced
`PO-4471`, which still records that the delivery note said 1.8 ton. The join is
visible from both ends — the order names the batch, the batch names the order.

**More than was ordered is refused.** A supplier sending 4,000 against an order
for 400 has made a mistake somebody needs to ring them about, and finding out
from the stock figure a week later costs far more than an extra line today.

#### Closing a line short

A supplier who sends 380 of 400 and will not send the rest leaves a line that is
neither open nor complete. **Close** it with a reason and the order can complete.
Without that it sits on the pending list forever — and a pending list with
permanent residents stops being read.

### Design & Cylinders — `/cylinders`

Every design and the engraved set it prints from — where each cylinder is, and
what state it is in.

**A design is a job.** The 420 jobs already on record are the design register:
customer, product, colours and the expected cylinder count all live there, and
the quotation wizard already treats a saved job as the design it charges
cylinders for. This screen adds the thing that was missing — the individual
cylinders, each identifiable — so "where is the cyan one for Krishna Dairy" has
an answer. That question is what stops a set being re-engraved because nobody
could find the old one.

A design appears once it has **something on it**: a cylinder set, or a file.
Not all 420 jobs — 382 record a cylinder _count_, and a count is not a set, so
listing them all would bury the rows somebody can act on. Those live under
**Designs without a set**, a collapsible list at the foot of the screen; open
one to attach its artwork before the cylinders are cut, which is the real order
of work. **Register a set** offers the same jobs as its worklist, largest first
— the biggest sets cost most to lose.

The **Files** column counts what is attached, current and replaced.

**Register a set** finds its design by typing rather than by scrolling fifty
rows of a dropdown. It searches the name, the customer and the job code, and
each suggestion carries the customer and code on a second line — two designs on
this works' books share a name _and_ a code, and that line is the only thing
that tells them apart. Editing the box after choosing drops the choice, so it
can never read one design while the form holds another.

Numbers collapse to a range where they run on: `CYL-3301 – 3304`, which is how
the office says it aloud. And a set registered short of what the job expects
says so — **"4 of 8 registered"** in amber — because two cylinders unaccounted
for is precisely what this register exists to surface.

The totals across the top count **every** cylinder, not the rows on screen. A
filter that moved the damaged figure would make it useless as an alarm.

#### One design — `/cylinders/:id`

Its cylinders, and their history. Clicking a cylinder narrows the history to
that one; the heading says which you are looking at.

**Status follows the events.** It is never typed. A cylinder marked "in store"
by hand while it is on a machine is exactly the one nobody can find — so
recording what happened is the only way the status moves, the same way stock
quantity only moves through the ledger.

| Event                        | Leaves it                                    |
| ---------------------------- | -------------------------------------------- |
| Engraved, Returned, Reworked | In store                                     |
| Allocated                    | Allocated                                    |
| In use                       | In use                                       |
| Damaged                      | Damaged                                      |
| Retired                      | Retired                                      |
| **Transferred**              | **unchanged** — it moved shelves, not stages |

**A set moves together**, so recording takes a selection and defaults to the
whole set. Four separate dialogs for one job starting means the fourth is the
one somebody forgets, which is how a cylinder goes missing from the books.

**The design's own status is the worst of its cylinders.** Five good ones and a
damaged one cannot print, and reporting that as "in store" would be a lie of
omission — the damaged one would be discovered at the machine.

Damaged and Retired both require a note. Those are the two events somebody will
be asked about months later, and a rejection nobody explained teaches nothing.

A retired cylinder refuses everything but re-engraving: it has been scrapped or
gone back to the customer, and it is not there to be mounted.

#### Deleting a design

**Delete** in the header removes the design, its cylinders, their history and
its files. It leads with what would actually go, counted from the database:

> **Deleted with it** — Cylinders 8 · Cylinder history 16 · Design files 1
> **Kept** — Ashoka, untouched · No quotations use this design

**The customer is stated, not left to be inferred**, because that is the thing
the office actually worries about. Quotations are stated too: one that used the
design keeps its own copy of the name, the geometry and every rate, so the
document still reads exactly as it was sent.

It takes two presses, and the second warns that nothing comes back. **Material
issued against the design refuses it outright** — a quotation holds its own
copy, but a stock movement holds only the link, so deleting would leave the
ledger unable to say what that material was issued for.

The button only appears for someone who has **both** Design & Cylinders and
Customers. The screen is the cylinder register's, but the record being destroyed
is a job.

#### Design files

Above the cylinders, because the artwork is what a design **is** — the cylinders
are how it gets printed, and somebody opening a design is usually here to look
at the file.

Drag artwork onto the panel or use **Add file**. PDF, JPG, PNG, TIFF, AI, EPS,
CDR and ZIP, up to 50 MB. Images get a thumbnail; everything else gets its
format on a tile, because a broken image icon is worse than no image.

**The file goes straight from the browser to Cloudflare** — it never passes
through the API — so there is a real progress bar: 30 MB on the works'
connection is a minute in which nothing else on screen changes.

**Replace, don't overwrite.** A revision keeps its predecessor: the cylinder on
the shelf was engraved from one particular version, and a store that overwrites
cannot say which. The new file becomes v2 and **Show replaced** brings the old
one back into view. Nothing is superseded unless you replace it explicitly —
a design legitimately carries a front and a back panel.

**The trash button offers two different things**, because they are two different
decisions and the office should see both before choosing.

**Remove it from this design** is filing: the file leaves the screen and stays
in the bucket, and **Put back** returns it. If something replaced it meanwhile
it comes back as history, because a design cannot have two current files
claiming to be the same artwork.

**Delete the file for good** erases it from storage. It takes two presses, and
the second one warns you how many cylinders this design has — if they were
engraved from that file, nothing will be able to show what they were cut from.
That is a warning rather than a refusal: nothing records which file a cylinder
was cut from, so the works owner is the one who can answer it.

Either way **the record stays**. A deleted file keeps its card under _Show
replaced_, reading _"File erased by Sudeep Hase on 06-09-2026"_, with nothing to
open. The design should be able to say what was there and who removed it; a file
that simply vanishes leaves the office asking a question the system cannot
answer.

Every **Open** and **Save** fetches a fresh link that expires in five minutes.
A URL that ends up in a chat message stops working, rather than standing as a
permanent public link to a customer's unreleased packaging.

Reading is open to anyone signed in — the floor works to the file the job
prints. The buttons that change anything need the cylinders module.

**A pouch weighs what its film weighs.** Each ply at its own density, plus the
ink and the adhesive it carries — which is the column the client's own sheet
totals to reach 125 GSM, and there is a whole density table in that workbook for
the purpose. It used to stand a flat **1.1** in for the density instead: PET
over white-opaque poly averages 0.985, so a pouch came out 9.1% heavy and 500 kg
was quoted as 8,730 pouches where the sheet says 9,524 — Rs 15.09 a pouch on a
document the sheet prices at Rs 13.83. PET over MET PET averages 1.400 and went
the other way by 27%. A ply with no density on record still falls back to the
old proxy, because a wrong weight beats a weightless one.

#### What it costs to make

Each quantity on a job is **costed**, and the rate arrives in the box already
filled in. There is no panel for it any more — there was one, a card at the foot
of the job showing the colours and the works' figures, and it is gone: what it
displayed was either settings that live on the Costing screen or a colour picker
that, under the works' own method, moved nothing at all.

It prices **each quantity separately**, because setting a press takes the same
hour whether it runs 500 kg or 5,000 — which is the whole reason a quotation
carries tiers, and the reason a bigger order genuinely costs less a kilogram.

The figures come from the works' own workbook, reproduced rather than improved
— every cell of "3. Anupriya.xlsx" ties out, down to Rs 263.40 a kilogram, and
seven more of their 2022 quotations reproduce exactly per kilogram and per
pouch. See [`docs/old-quotation-check.md`](../../docs/old-quotation-check.md). The
five places a fresh implementation would differ are **settings** on the Costing
screen, each defaulting to what the sheet does: how ink is costed, how adhesive
is costed, what the margin is taken on, what the EMI is spread over, and how
much load a machine draws while it is being set. Move any of them and the rate
moves off the client's spreadsheet, deliberately.

**Colours are taken, not chosen.** The process colours the catalogue holds, then
any spot colours, up to the job's colour count. There was a picker for this and
it was removed, because under `FLAT_GSM` — the Estimation method, and the
default — ink is a flat GSM at one blended rate and the choice never reached the
arithmetic: the same 500 kg job came to Rs 233.76/kg on CMYK, on CMYK + Gold and
on CMYK + White alike. Under `PER_COLOUR` the list does decide the answer
(Rs 236.89, 241.49, 246.59 for those three), and it is the catalogue's order
that supplies it.

What the flat method **does** charge for is cylinders, from the sixth station
on, and that comes from the job's own colour count.

**Under a kilogram it declines to answer.** A press is set for an hour whichever
quantity follows it, so twenty pouches carry a whole job's setup and price at
thousands of rupees a kilogram — arithmetically right, and not a number anybody
should be shown beside a heading that rounds to "0 kg".

**ⓘ beside each rate shows the working** — the laminate ply by ply, the ink wet
and dry, the adhesive batch, every machine's minutes, and the chain from
material cost to the rate. A rate nobody can explain is a rate nobody can defend
across a table, and the office is asked "why is it 251?" by customers holding
three other quotations.

**Pouch making is charged per pouch, and the style decides what it costs.**
A standup pays the making rate; a **Standup zipper** or **Zipper** pays making
plus the zipper across its mouth, charged by the metre of finished width; a
**D punch** is made at its own flat rate. The ⓘ breakdown shows the parts and then
what they come to on a kilogram — `Pouch making — Rs. 0.72 × 181.2 pouches`.

That is the works' own pouch workbook, and it is per pouch because per kilogram
cannot describe it: across the workbook's nine costed jobs the same charge reads
between Rs 11 and Rs 64 a kilogram, purely because a small pouch packs 130 to a
kilo and a big one 14.

**Two of the works' figures depend on the style**, because the works costs from
two documents:

|                  | covers                                    | wastage | ink GSM |
| ---------------- | ----------------------------------------- | ------: | ------: |
| Estimation sheet | centre seal, three side seal, spout, roll |      8% |     1.8 |
| Pouch workbook   | standup, standup zipper, zipper, D punch  |      7% |     1.2 |

Both move real money. A percentage point of wastage is roughly Rs 2 a kilogram,
since film is about four-fifths of a rate; the ink figure decides what a pouch
**weighs**, so it moves the count per kilogram and therefore the price each.

**Four figures are set on the quotation, not the works.** Margin %, transport
per kg, pouch making per kg and wastage %. They exist because the client varies
them job to job — across seven of their own quotations, margins of 5%, 9% and
10%, transport at Rs 5 and Rs 10, and nothing charged for making a pouch on two
of them, with **five of the seven written on the same day**.

Pouch making's box is in **rupees per kilogram** even though the works' figure
is per pouch: it replaces the whole charge rather than any part of it, which is
what the office means by overriding it, and it is the unit every quotation
written before this already carries.

#### They are folded away, because almost no job needs them

They used to sit at the **top** of the Jobs step as four empty boxes, above the
job the office had actually come to price. But varying one is the rare job. So
the section is a line of what this quotation is priced at, and a checkbox — and
it sits **below the jobs**, just above **Add another job**:

```
  ... the last job card ...

THIS QUOTATION'S COSTING
Margin 9% · Transport Rs. 6.80/kg · Wastage 7% · Pouch making Rs. 122.55/kg

[ ] Edit this quotation's costing

  [ + Add another job ]
```

The position is the same argument as the fold. The office came to this step to
price a job, and the works' own figures are already right for it; a row of boxes
first is something to walk past, where the same row last is something to reach
for. The checkbox stays at the bottom of its own section when the boxes open, so
it does not move under the cursor that just ticked it.

The summary line always reports the works' own figures, which is not a
simplification: the section is open whenever any of the four is set, so a closed
one has nothing else to report.

Ticking it opens the boxes **already filled in with the works' own figures**. A
blank box with the number greyed behind it reads as a field that still needs
doing, and this is the second place where the figure was known and the screen
was being coy about it — the film rate on the ply below was the first.

**Untouched means the works' figure, not a copy of it.** Anything still equal to
the master when the quotation is saved is sent blank (`strippedCosting`), so
opening the section, reading the figures and closing it again leaves no trace.
Without that, a quotation whose costing was so much as glanced at would be
frozen against a Costing screen it never meant to leave. Unticking clears all
four, which is how an override is taken back.

A quotation that already overrides something **opens showing it**, because
hiding a number the document is actually priced at would be worse than the four
empty boxes this replaces.

**Two of the four are not read off the Costing screen — they are worked out for
this document**, because the works holds no single figure for either.

Pouch making is charged **per pouch**, and the same charge reads between Rs 11
and Rs 64 a kilogram across the works' own nine costed pouches depending on
nothing but the size. So the box is filled from the style and size actually
typed — `perPouch × pouchesPerKg`, which is precisely what the rate carries. A
150 × 200 standup on PET + PE comes out at Rs 122.55 a kilogram; take it to
300 mm tall and it is Rs 81.70, because a heavier pouch is fewer to the kilo.

Wastage is decided by the **style**, job by job, so it can be offered only where
every job on the document falls the same side of that line.

Either can fail to land on one figure — before a job has a size, on a document
whose jobs disagree, on one that makes no pouches at all — and then the box
stays empty and names what decides it instead: "by style", "by job kind".

**An open box goes on following the works' figure until somebody types in it.**
Both of those are derived from the jobs, so they move while the section is open
and the office edits the job below it. Without that, a figure filled in before a
pouch was resized would sit there looking like the works' own, no longer be
equal to it, and so survive the strip on save as a deliberate override nobody
made. It follows only a box still holding exactly what was last written into it
— a typed figure is theirs and is left alone.

A blank box means "follow the works' figure", which is not the same as zero:
`z.coerce.number()` turns an empty string into 0, and on a margin box that would
quote a job at cost and look like somebody meant it. Zero typed deliberately
survives the strip, which is exactly what the two quotations sold as reels say
about pouch making.

**The rate follows the costing.** Change the film, the colours or the quantity
and the price changes with them — no notice to read, no button to press. A rate
worked out for a 60µ poly sitting on a 110µ one is not a decision anybody made;
it is a number nobody updated, and the margin beside it goes on measuring
against a price that no longer describes the job.

Typing still holds: the write happens only when the **computed** figure moves,
so a rate keyed in by hand stays until something that changes the cost is
touched. That is also what stops it looping, since writing the rate re-renders
the job.

**Nothing on screen says when the costing cannot be trusted.** The hook still
works it out — an unpriced solvent, no machines on record, a film gauge with no
density — and the panel used to print it. With the panel gone there is no
reader: an unpriced Toluene does not stop the arithmetic, it quietly understates
it, and the rate lands in the box looking exactly as confident as a good one.
`useRateCosting` returns `unusable` for whoever wants to surface it next.

**The working downloads as a spreadsheet**, laid out like the works' own
Estimation sheet — their headings, their row order, their spelling — with the
formulas **live**, so a different wage or film rate can be tried in the copy
and the total moves. Verified by evaluating the generated file: the chain
recalculates to Rs 263.40 a kilogram and Rs 13.83 a pouch, which are the
workbook's own figures.

Each quantity row reports two margins —
`37.3% gross · 8.0% net`. Gross subtracts materials; net subtracts everything,
including the press setup. They are computed once and shared, so the rate in
the box and the margin beside it cannot disagree about the same job.

The pair exists because one figure was the flattering one, and most flattering
exactly where it did most harm: materials cost the same per kilogram at any
volume, so a short run at a higher rate showed the fattest margin on the
screen while actually earning least. On a real quotation, 1,000 pouches read
**71.9% gross** against 8,999 pouches' 37.3% — and net put both at **8%**.
Someone reading the old row would have taken the small order believing it the
best one there.

Net is **absent, not zero**, when the line cannot be costed yet — a job that
earns nothing and a job nobody has costed are different claims.

**The rate arrives in the box.** There was a card offering it and a button to
accept it; both are gone, because the office read them as something magical
happening off to one side and it is not magic — it is what the job costs plus
the works' margin. On a line sold by the piece it converts using the quotation's
own pieces-per-kilogram, so the figure shown is the figure the document carries.

A rate typed by hand still holds. The costed figure is written only when the
**computed** number moves, so what the works knows and this does not — what the
customer paid last year, who else is quoting — survives until something that
genuinely changes the cost is touched.

#### Corrections go back to the customer

Correcting an address, a mobile or a brand on a quotation updates the customer
record as you press Next, so the next quotation starts from the right details
rather than the same wrong ones.

This was disabled for a long time because it **erased customer records** —
correct a district, press Next, and the address, city, mobile and brand were
all stored as `NA`. The cause was not in this screen: `updateCustomerSchema`
was `createCustomerSchema.partial()`, and Zod's `.partial()` leaves `.default()`
in place, so the server filled in every field the form had deliberately left
out. See [the API README](../api/README.md#a-patch-sends-what-it-sends).

Two rules keep it safe either way, and both are tested: a field is written only
if it differs from **what the form was filled in with** — not merely from the
record, since an old quotation's snapshot legitimately differs — and **a blank
never overwrites a stored value**. Clearing a field is done on the Customers
screen, where the whole record is in front of you.

#### A saved quotation keeps what it says, and only what it says

Contact details are snapshotted onto the quotation. Opening a saved one shows
**the document first, and the customer's record for the gaps** — the same rule
the send dialog uses.

Both halves were wrong at different times. The prefill used to run whenever the
customer record resolved, which on an edit is a moment after the quotation
itself, so the record's values overwrote the document's: a mobile and an email
typed onto quotation 131 and saved correctly were gone the next time it was
opened. Making the snapshot win outright then broke the opposite case —
quotation 130 has every contact field blank while its customer carries a
mobile, an email and an address, so it opened to six empty boxes and the office
retyped what was already on record and concluded the write-back was broken.

**A value typed onto a quotation is a decision; a blank is not.** Filling a gap
also records what ended up on screen, so pressing Next straight afterwards
sends nothing — the fill is not mistaken for an edit.

#### When Save does nothing

It used to. `handleSubmit` swallows a failed validation silently, which is right
for a form on one page and wrong for a wizard — the field it objects to may be
two steps back and entirely off screen. On this works' own data it happened the
first time it was tried: a customer record carrying a mobile number the form
will not accept blocks the save from the Details step, and the office clicks
Save and watches nothing happen.

Save now names the field and takes you to it — _"Enter Valid Mobile Number —
taken back to Details"_.

#### Asking before something cannot be clicked back

Anything that reaches the server on one click and cannot be undone by pressing
the same button again asks first — **Retire** on a machine or a wage, and
**Deactivate** on a user. Deleting a customer, a design, an artwork file or a
quotation already did.

The dialog says what it costs rather than "Are you sure?": retiring a press
takes its power and its people out of the costing, so **every rate worked out
afterwards drops** — the job reads cheaper to make than it is, at once and
without a word. Quotations already saved keep the figures they were saved with.

Two details that are easy to lose in a refactor, and are tested:

- **The button says what it does** — "Retire", "Deactivate" — never "OK".
- **Cancel comes first in the DOM**, so the focus trap lands on the safe control
  and Enter on a dialog nobody read does nothing.

**Only the destructive direction asks.** Restore is the inverse and goes straight
through, because a dialog in front of a safe action is how the office learns to
click through the dangerous one.

**Show retired is always fetched, never gated on itself.** The button appears
when something retired exists — and the page used to ask the server for active
rows only until the button was pressed, so nothing retired was ever in the
answer to prove anything retired existed. The button could not render, and a
retired machine or wage was beyond reach: the row was still there, and no screen
could offer to bring it back. The page now always asks for them and filters for
display. (The rate costing asks separately, active rows only — a retired machine
must not be costed just because this screen can see it.) The artwork panel's
**Show replaced** had the same shape once: a toggle derived from the very list it
would reveal.

**Retiring does not free the name, and adding it back revives the row.** A
retired machine, wage or material keeps its row, because quotations costed
against it have to be able to say what they were priced on — so the name stays
taken. Typing it again used to fail with "there is already a machine with that
name" against a machine nobody could see, since retired rows are hidden unless
**Show retired** is on. Now it brings the row back with whatever figures were
just typed, keeping its id so nothing pointing at it is orphaned. A name held by
a row that is still live clashes as it always did — that one is a real mistake.

### Costing — `/costing`

What the works costs to run: the machines, the wages, and the overheads every
quoted rate is built from. A machine speed or a wage that is three years stale
here makes every quotation raised afterwards wrong by the same amount, and
nobody would see it — which is why it is a screen and not a constant.

Machines show their **running cost per hour** (load × tariff) and wages show
their **cost per minute**, because that is what the costing actually uses. A
monthly salary is not a figure anyone can check a rate against.

**Load while setting** is the share of a machine's connected load it draws
while being threaded and cleaned. The client's sheet charges nothing for it,
which cannot be right — the press is switched on — and charging the full load
adds two thirds to the printing electricity, which is not right either. Nothing
in the app can know, so the works sets it; 100% is the default.

Retire rather than delete, as rates do: quotations were costed against it.

#### The switch that decides whether a big order is cheaper

**The works' own time is charged** picks between billing an operator for the
minutes of the machine they stand at, and billing the whole crew and the bank
for the days the job occupies the works. Only the second makes 2,000 kg cheaper
a kilogram than 1,000 — by the minute, nothing on a job is fixed, and the rate
falls by twenty paise where the works says it should fall by about ten rupees.

Four figures go with it:

| Field                 | What it is                                                                              |
| --------------------- | --------------------------------------------------------------------------------------- |
| A day of the works    | The whole crew and the bank. Not electricity, which is charged per machine              |
| Make-ready, days      | The same whatever the order — this is what makes a big order cheaper                    |
| Machine minutes a day | Printing, lamination and slitting run at once, so a day absorbs several machines' worth |
| Kilograms a day       | Only for a line with no costed structure to find metres in                              |

The reasoning, the fit against the works' fourteen job sheets, and what the
change is worth at each quantity are in
[the API README](../api/README.md#why-a-bigger-order-has-to-come-out-cheaper).

**Changing any of these dates the change**, so quotations already written keep
the figures they were written on — including the model switch itself.

#### Two laminators

The works runs two, and a job runs on one of them. Sort order decides which,
until a quotation names one: put the machine the works normally uses first, or
retire the other. Laminator 2 starts as a copy of Laminator 1 because its real
speed and rate are not recorded anywhere yet — so the two price identically
until somebody says how they differ.

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

#### The cylinder mounting margin

A cylinder is wider than the film it carries, and the works pays for the whole
face: `film width × lanes + mounting`. That mounting was a literal `+ 80` in the
geometry — on a 700 mm job at seven stations, **Rs 8,400 of an Rs 81,900
cylinder charge**, about 4% of the quotation, with nothing on any screen to show
it or change it.

It is **Cylinder mounting, mm** on the Costing screen now. Unlike everything
else there, the client's workbook does not reach cylinders at all, so there is
no sheet to reconcile it against — it is what their engraver charges for. The 80
stays the default, read off their own jobs: `width × lanes + 80` is at or under
the press's 800 mm face on 95% of them.

It also feeds the suggested number of lanes, so a wider margin proposes fewer of
them and the cylinder it suggests still fits the press.

#### Deleting a material, and when it is refused

Each row has a **Delete**, and it asks first — the dialog says the price history
goes with it, because `material_rates` cascades.

**A material on a quotation or a purchase order never goes.** The server
refuses and names what is using it:

> PET 12µm is on 18 quotation lines. Take it off the price list instead —
> deleting it would leave those unable to say what they were priced on.

A purchase line the database would refuse anyway, but with a foreign-key error
nobody can act on. The quotation ply is the interesting one: it is `SetNull`, so
the database would **allow** it. The ply snapshots the name, micron, density and
rate, so the document would still read — and the link to what it was priced on
would be gone, silently. So it is refused on purpose.

**Stock is refused from this screen too**, and says where to go instead:

> Green PET 12µm is on the inventory — 250 KG across 1 stock batch. Delete it
> from Inventory, where what goes with it is shown before you confirm.

That is not squeamishness about stock — [Inventory](#inventory--inventory) will
delete it, batches and all. It is that this screen is the price list and does
not show what is held, and nobody should discard a ledger from a screen that
never told them there was one.

That leaves delete here for what it is good for: a name typed wrong, a film
added and thought better of. Anything the works actually quoted is taken **off
the price list** instead, on the figures dialog beside it — the row stays, so
the record can still answer for itself.

#### Add a material, and edit what its price is multiplied by

**Add a material** on the header, and a slider button on each row for the
figures. A price on its own is not enough to cost anything: a film's **density**
turns its microns into a weight, an ink's **solids %** says how much of the tin
has to be bought for what stays on the film, and its **laydown g/m²** says how
much stays. All three were seeded once and then reachable nowhere, so a film the
works started buying could not be added at all — W/O Poly, which is on every
page of the client's own workbook, was simply missing from the list.

Each kind is asked only what it can answer: density for a film, solids for an
ink or adhesive, laydown and process/special for an ink. A density box on an ink
is a question nobody can answer.

A material's **kind is settled when it is created**. Moving a priced film into
Ink would strip the density it is costed on, and every quotation using it would
quietly start weighing its pouches off a stand-in instead.

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

### A mutation is not finished until the screen shows what it did

**Every mutation invalidates through `settle()` in `lib/query.ts`, and returns
it from `onSuccess`.** That is the rule; there are no bare `invalidateQueries`
calls left in the features.

`invalidateQueries` marks the cache stale and _starts_ a refetch — it does not
wait for one. Without the wait, the mutation settles immediately, so the modal
closes, the toast fires and the draft clears while the list still holds the
previous values. A round trip later the refetch lands and the screen snaps to
the new figure.

On the Rates screen it is worse than a flash, because saving also clears the
drafts: the box you typed **200** into falls back to the cached **185**, sits
there, and then becomes 200. Nothing is wrong with the data at any point, which
is exactly why it reads as a bug — the screen is telling you two different
things about the same moment.

React Query awaits a promise returned from `onSuccess` before a mutation is
settled, so returning `settle(...)` keeps the button spinning until the queries
behind the screen have actually refetched. Measured on the Rates screen with the
old behaviour restored: the toast appeared **22 ms before** the figure changed.
With `settle`, both land in the same frame.

```ts
onSuccess: () => settle(queryClient, materialKeys.all, ['quotations']),
```

Three things about it are deliberate:

- **It takes every key at once** rather than being called twice, so two reads of
  the same save run in parallel instead of doubling how long the button spins.
- **A failed refetch never fails the save.** The write happened; this is only
  the reading back of it. Telling somebody their rate did not save when it did
  — and having them type it again — is the worse of the two outcomes.
- **It is not an optimistic update.** Writing the expected value into the cache
  before the server answers is faster still and shows a figure nobody has
  confirmed: the server rounds, recomputes, applies a dated setting, or refuses.
  On screens whose whole job is to say what something costs, a number that
  appears and is then quietly corrected is worse than one that takes an extra
  moment.

Where the server's response **is** the record — a customer, a quotation, a job
sheet — it still goes straight into `detail(id)` with `setQueryData` first, and
only the derived list is waited on. That needs no round trip to confirm: it is
the server's own answer.

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

| Where                 | What is previewed                                           |
| --------------------- | ----------------------------------------------------------- |
| Customer job editor   | Composite GSM, pouches per kg                               |
| Quotation form line   | Total pouches and weight, cylinder size and cost, margin    |
| Quotation form totals | Material and cylinder subtotals, GST, grand total, advance  |
| Receive material      | What a delivery converts to in the stocked unit             |
| Rates screen          | The change % a typed rate would produce                     |
| Job sheet             | The whole sheet — every line, every overhead, the cost a kg |

**The server always recalculates on save and its value wins.** The browser
figure exists so the effect of a change is visible before committing to it —
it is feedback, not the source of truth. The job sheet is the one place where
the preview covers the whole document rather than a line of it, and it agrees
with the server to the paisa for the same reason as everything else here: it is
not a second implementation. Formulas and worked examples are
documented in [the API README](../api/README.md#calculations).

---

## UI components

| Component             | Notes                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`              | primary / secondary / ghost / danger, with a loading state                                                                                                        |
| `Field`               | Label, hint and error in one consistent block                                                                                                                     |
| `Input`, `Textarea`   | 44px tall; 15px text on a mouse, 16px on touch so iOS does not zoom on focus                                                                                      |
| `NumberInput`         | Digits only, and a lone `0` is replaced rather than prefixed — see below                                                                                          |
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

### Numbers are typed into `NumberInput`, never a plain box

Two problems the office hits daily, and neither is solved by `type="number"`.

**A stray letter must not erase the figure.** `type="number"` reports an empty
string for anything it cannot parse, so `12abc` arrives as `""` and what was
typed is gone. It also brings spinner arrows that nudge a quantity when the page
is scrolled with the cursor over the box. So the type stays `text` with a
numeric keypad, and a keystroke that would not make a number is **refused rather
than stripped** — nothing happening reads as "that key does not belong here",
where a character vanishing as it is typed reads as a broken keyboard.

**A default of `0` must not become a prefix.** A field showing `0` is one
somebody types into, and typing 210 leaves `0210` — a different number that
looks like a fault. The contents are selected on focus, so the first keystroke
replaces a lone zero. A real figure is selected too, which is what everybody
expects of a form field they have tabbed into.

Rows of fields are **top-aligned, not bottom-aligned.** With `items-end` a hint
under one field makes that column taller and floats its input above the rest of
the row — which is exactly what happened to Rate on the purchase order form.
Every label in these rows is one line, so aligning the tops aligns the inputs; a
trailing icon button gets a label-height spacer so it lands level with them.

## Conventions

**Mobile-first.** Every screen starts at 375px, and the layout respects safe
areas. **A table either becomes cards below `md`, or sits in an
`overflow-x-auto` wrapper** — the customer, cylinder and inventory lists take
the first, everything else the second. What a table must never do is sit inside
a card that clips for its rounded corners with no scroller between them: the
columns past the fold are then not merely off screen, they are **unreachable**.

That is exactly what the Rates screen did at 375px, and it took the whole
actions column with it — figures, rate history and delete, gone, with nothing to
say they were there. Its header row did not wrap either, so Save lost its last
two letters off the right edge.

Swept afterwards: every route reports **0 page overflow and 0 unreachable
content** at 375px. The only thing still poking past the edge anywhere is the
TanStack devtools button, which production does not render.

**Everything you can click says so under the cursor.** A `<button>` has cursor
`default` unless something says otherwise, and the UI kit's `Button` sets
`cursor-pointer` itself — so the ones that read wrong were the raw `<button>`
elements written inline: the wizard's step-back link, the Existing/New company
toggle, the icon buttons on a job sheet. Eleven of them, across two screens.

There is now a base rule in `styles/index.css` covering every button, select,
summary, `role="button"` and checkbox label, rather than a class on each —
**the class is the thing that gets forgotten.** It is in the base layer, so any
utility still wins: `disabled:cursor-not-allowed` keeps working, and a component
that genuinely wants a different cursor says so and is obeyed.

> Both sweeps read React's own `onClick` props off the DOM rather than trusting
> the markup, because a `<div>` with a handler is as clickable as a button and
> does not look like one in a grep.

Controls are **15px on a mouse and 16px on a touch device**, because iOS zooms
the page when focusing anything under 16px and the shop floor is on tablets.
That rule lives outside `@layer` in `styles/index.css`, deliberately: it was in
the base layer for months and did nothing, because Tailwind's utilities layer
beats base whatever the specificity — so the `text-[15px]` on every control won
and inputs measured 15px on the tablet too. It is scoped to `pointer: coarse`
rather than to a width, since it is touch that zooms and a narrow desktop window
should keep the size the design was drawn at.

**Design tokens, not hex values.** Tailwind v4 is configured in CSS via `@theme`
in `styles/index.css` — there is no `tailwind.config.js`. The palette came from
the approved wireframe, so `bg-brand-600` and `text-ink-500` are the vocabulary.

**The ramps are complete, 50 to 900, and that is load-bearing.** Tailwind v4
generates a utility only where a `--color-*` token exists, and generates
**nothing** where one does not — no warning at build, no error in the console,
no fallback in the browser. The element simply keeps the colour it would have
had.

The palette used to carry `50/500/600` for the status colours and
`50/100/500/600/700` for the brand, while the app reached for twelve shades
outside that — **forty-six dead classes**. `text-danger-700` alone was in
fourteen files, so the error line on every modal in the app inherited body grey
and did not read as an error at all. The amber pills lost `bg-warning-100` and
the GSTIN badge `text-success-800` the same way.

Nobody did anything wrong: 700 is an ordinary shade to reach for, and the
failure is invisible in the editor, in the diff and on screen. So the palette
now carries every shade rather than the handful in use, and
[`styles/theme-tokens.test.ts`](./src/styles/theme-tokens.test.ts) fails the
build if a class ever names one that is not defined — naming the token and the
files that wanted it, because "3 missing tokens" sends somebody hunting.

**Routes are lazy-loaded** in `app/router.tsx`, so a screen's code is only
fetched when someone opens it.

**Adding a feature**

1. Put the request/response contract in `packages/shared`.
2. Add the module key to `APP_MODULES` in `packages/shared/src/constants/modules.ts`
   — the same list feeds the user editor's tick boxes, `RequireModule` and the
   nav, so a feature added anywhere else is unreachable and invisible.
3. Create `features/<feature>/api/` with a query-key factory and hooks.
4. Build pages under `features/<feature>/pages/`, components alongside.
5. Register the route in `app/router.tsx` and the nav item in `AppShell`.

A mutation that changes something **another feature reads** invalidates that
feature's keys too. Receiving a purchase delivery creates stock, so
`useReceivePurchaseLine` clears `inventoryKeys.all` as well as its own — an
inventory screen open in another tab would otherwise go on showing the figure
from before the lorry arrived, and stock is the one thing this app must not show
stale.
