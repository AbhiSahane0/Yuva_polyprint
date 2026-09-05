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

**A new company becomes a customer when the quotation saves** — with its
address, city and district kept apart rather than joined into one line, and with
every design on the quotation recorded as a job against it. Saving twice does
not create a second copy of either.

#### 3. What it is

Two questions, not one. **Type** is Pouch or Roll; **Pouch type** is the style,
and only appears for a pouch.

> Standup · Standup zipper · Zipper · Spout pouch · Centre seal ·
> Three side seal · Other

**The style decides how the line is priced.** Picking one sets the basis to the
trade's convention for it, and the switch in the Quantities panel changes it —
that switch is where the basis is stated, not under the style. Choosing Other
reveals a box to say what it is.

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

Each ply gets its own row: **choose a film, and that is the whole row.** Beside
it sits that film's rate — `Rs. 210.00 / kg` — and nothing else. **2 layer /
3 layer** adds or removes rows rather than swapping the form, so moving from two
plies to three keeps everything already typed and only asks for the new one.

> The row used to state the gauge, the density and the resulting GSM. All three
> are inputs to the cost rather than facts anyone needs while choosing a film,
> and three figures per ply read as noise on a screen with six of them. The rate
> is what the question at that dropdown actually is, and it is the reason a ply
> gets swapped. A film with **no rate on record** says so in amber, because that
> is where an uncostable line begins.

> This replaces a single **Film** dropdown that set only the sealant, with the
> printed PET and the metallised ply assumed. The client could not read what he
> was quoting off that control.

**The gauge is typed, and the film fills it in.** Every film in the rates master
is named with its gauge — `PET 12µm`, `PE 60µm`, `PVC / PETG 45µm` — because a
12µ PET and a 19µ PET are bought, stocked and priced as two different materials.
Choosing the film puts its gauge in the **Micron** box, so the two agree without
anyone typing twice.

The box stays editable, because **the works quotes gauges the rates master does
not stock.** A 20µ PET is a real enquiry; a dropdown of stocked films cannot
offer a number nobody has priced, and for a while that meant such a job could
not be quoted without a developer adding the film first.

#### A gauge off the price list has to be priced

Type a gauge the chosen film is not stocked at and the row asks for a rate:

```
Layer 1   [ PET 12µm ▾ ]   Micron [ 20 ]   Rate for this gauge [ Rs. / kg ]
                                            PET 12µm is priced at 12µ — Rs. 210.00/kg
```

Neither the 12µ nor the 19µ rate is right for a 20µ PET, so the alternative to
asking is costing the ply at whichever price happens to be on file — **a
confident, wrong margin that nothing on screen contradicts.** The caption names
the gauge the film _is_ priced at, so it is obvious that a 20 was typed where
the list holds a 12, rather than reading as an unpriced film.

Until it is given, **the line does not cost itself.** The margin reads as a dash
and the material cost is blank, exactly as for a film with no rate on record.
Asking for the rate is only half the job: while the ply still fell back to the
stocked gauge's price, a 20µ PET reported an 87.7% margin with an empty rate box
beside it, and nothing on the screen said the figure was invented.

**That rate is used for this quotation and stored on it. It does not reach the
Rates master.** A figure keyed in the middle of quoting is a decision about one
document; letting it edit the price list would make every quotation a chance to
change what every other quotation costs. Adding `PET 20µm` properly is a job for
the Rates screen, where it gets a rate history like every other material.

Swapping the film clears any rate typed for the previous one — 245 was the price
of a 20µ PET and must not survive onto a `Foil 7µm` ply.

Reopening a saved quotation puts the rate back in the box. Nothing records that
an override happened and nothing needs to: the ply keeps the film's name, and a
name stating a gauge different from the one quoted **is** the override. That
rule lives in `@yuva/shared` because the server reads it too — it carries the
rate through when repricing from storage, and if the two disagreed a quotation
would display one rate and be repriced at another.

The one film named without a gauge, `PP Woven`, is specified by GSM rather than
thickness. Its rate applies at whatever micron is typed, so it is never asked
about.

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

One to three per line, each with its own quantity and rate, and its result
alongside:

> **Rs. 1,45,000** · 51.52 kg · 25,000 pouches · **31.2% margin**

Margin under 15% turns amber.

**Both units are reported, not just the one that was not typed.** The office
quotes in whichever the customer buys; the works runs on the other. A per-pouch
order still has to be laminated and slit by weight, and a per-kilo one still has
to come off the machine as a countable number of pieces.

**The margin is material only.** It is the selling rate against the material
cost of a kilogram — films, ink and adhesive — and **cylinders, printing,
lamination, slitting and wastage are not in it**:

```
margin % = (selling per kg − material per kg) ÷ selling per kg
```

Hovering it spells out the two figures that made it, and says what it leaves
out. That lives on hover because it is a question asked once and a line of noise
afterwards. Note that a per-pouch line converts first — 1,000 pouches at Rs. 10
is Rs. 10,000 for 6.16 kg, so the selling rate is Rs. 1,623/kg — which is why a
small light pouch sold per piece always shows a spectacular figure.

**Kilogram or Pouches is chosen here**, on the switch in the panel header:

```
QUANTITIES              Sold by [ Kilogram | Pouches ]     Add a quantity
```

Only the chosen pair is asked for — kg and rate per kg, or pouches and rate per
pouch — but **both are kept**, so a customer who asks for the price the other way
round is answered without re-typing the first one.

> The boxes and the total disagreed for a while. Switching the unit swaps which
> two fields the row is bound to, and React reused the same input — same
> element, same position, new name — while react-hook-form's `register` never
> writes back into an input it already holds. So the boxes went on showing the
> kilograms that were typed while the form read and wrote the pouch fields
> underneath: **100 and Rs. 400 on screen, Rs. 0 as the total beside them.** A
> quotation could be sent on a figure nobody entered. The boxes are keyed on the
> field name now, so switching remounts them and fills them from what is stored.

The style seeds it: standup and standup zipper start on Pouches, everything else
on Kilogram, which is what the trade does. Changing the style resets the switch
to that style's convention, so anyone who never touches it gets the conventional
answer. A **roll has no switch** — there are no pouches on a reel to count.

> This used to be decided entirely by the style, with no way to override it. A
> customer who orders standup pouches by the kilogram could not be quoted the
> way they actually buy.

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

**The repeats are suggested from the size**, and stay editable. The cylinder's
circumference is the film's height times the repeat around, so the repeat is
what decides whether a job lands on a cylinder the works owns — left at 1, a
250mm pouch was asking for a 250mm cylinder, which is below anything in the
racks, and the cylinder cost that followed was wrong by whatever the real one
would have been.

The rule is read off the works' own records, not invented. Of the 418 imported
jobs, 347 record a cylinder, and on **84% of those the recorded circumference is
an exact multiple of the design height** — which is the same relationship the
engine uses. Those circumferences run 310–740mm and cluster around 480, so the
suggestion is the multiple landing closest to 490, and the lanes across are as
many as fit the 800mm face.

Checked back against the same jobs, that reproduces the repeat the works
actually chose on **85%**. The remaining 15% are designs where two repeats both
fit the machine and the works took the other one — which cylinder was free that
week, not arithmetic. **That is the whole reason the figure is suggested rather
than calculated and locked**; a locked one would make those jobs unquotable
without a developer.

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

| Where                 | What is previewed                                          |
| --------------------- | ---------------------------------------------------------- |
| Customer job editor   | Composite GSM, pouches per kg                              |
| Quotation form line   | Total pouches and weight, cylinder size and cost, margin   |
| Quotation form totals | Material and cylinder subtotals, GST, grand total, advance |
| Rates screen          | The change % a typed rate would produce                    |

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
