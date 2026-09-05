# API — Yuva Polyprint ERP

Express 5 + Prisma 7 + PostgreSQL 17. Serves the web client and renders
quotation PDFs.

- [Running it](#running-it)
- [Layout](#layout)
- [Request and response shape](#request-and-response-shape)
- [Authentication and access](#authentication-and-access)
- [Endpoints](#endpoints)
- [Calculations](#calculations) ← the part worth reading
  - [The vocabulary](#the-vocabulary)
  - [The laminate, ply by ply](#the-laminate-ply-by-ply)
  - [Quantity tiers](#quantity-tiers)
  - [Versions](#versions)
  - [Reading a printed quotation](#reading-a-printed-quotation)
  - [What is frozen, and what moves](#what-is-frozen-and-what-moves)
- [Data model](#data-model)
- [Sending quotations by email](#sending-quotations-by-email)
- [Winning and losing](#winning-and-losing)
- [CORS](#cors)
- [Scripts](#scripts)

---

## Running it

```bash
npm run db:up
```

```bash
npm run db:migrate -w @yuva/api
```

```bash
npm run seed:materials -w @yuva/api
```

```bash
npm run dev -w @yuva/api
```

Listens on `http://localhost:4000`. Environment is validated by Zod at boot —
a missing or malformed variable exits immediately with a readable report rather
than failing later with something confusing. See `.env.example`.

There is **no authentication yet**. Login will be a plain username + password
form with a server-side session; the routes are open until that exists.

---

## Layout

```
src/
├── server.ts              boot, listen, graceful shutdown
├── app.ts                 Express app factory (no port binding, so tests can use it)
├── config/env.ts          Zod-validated environment, parsed once
├── lib/
│   ├── prisma.ts          PrismaClient singleton + pg driver adapter
│   └── logger.ts          pino, with credential redaction
├── middleware/
│   ├── validate.ts        Zod validation for body / query / params
│   ├── error-handler.ts   404 fallback + the single place errors are formatted
│   ├── rate-limit.ts      baseline limiter + a stricter one for future login
│   └── request-logger.ts  correlation id, one structured line per request
├── routes/index.ts        the /api surface map
├── utils/                 ApiError, response envelopes, asyncHandler
└── modules/
    ├── customers/         customers and their job specifications
    ├── quotations/        quotations, costing, PDF rendering
    ├── materials/         material catalogue and daily rates
    └── settings/          editable rates and costing defaults
```

**Layering:** `routes → controller → service → Prisma`. Controllers read the
request and send the response; they hold no business logic. Services take plain
arguments and return plain data, so they can be called from scripts and jobs as
easily as from a route.

---

## Request and response shape

Every success is wrapped:

```json
{ "success": true, "data": {} }
```

Every failure is wrapped:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": [{ "field": "mobile", "message": "Enter a 10-digit mobile number" }],
    "requestId": "34ad81bd-12b6-4837-961f-c86b77f7bfe4"
  }
}
```

`code` is a stable machine-readable value — `VALIDATION_ERROR`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`. **The client branches on the code,
never on the message**, so error wording can change without breaking anything.

`fields` appears only on validation failures and is keyed so the form can put
each message beside the input that caused it. `requestId` matches the
`x-request-id` header and the server log line, so a user's screenshot can be
traced to the exact request.

Lists are paginated:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 68,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Authentication and access

Username and password. No JWT, no OTP, no social sign-in.

### How a session works

Signing in returns an **opaque token** — 32 random bytes, meaning nothing on its
own. It is a key into the `sessions` table, not a container of claims, and that
is the point: deleting the row signs that session out **immediately**. A JWT
stays valid until it expires no matter what the server later decides.

The client sends it back as `Authorization: Bearer <token>`.

Only the token's **SHA-256 is stored**, never the token itself, so a database
dump cannot be replayed as a live session. Sessions last 7 days, and expired
rows are swept on each login — the one moment the table is already being
written.

Passwords use **scrypt** from Node's own crypto, salted per user. Not bcrypt:
scrypt is memory-hard, and being built in means the Alpine image needs no native
module and no compiler. The stored format is self-describing —
`scrypt$N$r$p$salt$hash` — so the cost can be raised later without invalidating
existing passwords.

### Two tiers, and no more

|                        | Reaches                                          |
| ---------------------- | ------------------------------------------------ |
| **Admin** (`is_admin`) | Everything, including user management            |
| **Everyone else**      | Only the modules listed in their `modules` array |

Module keys come from `APP_MODULES` in `@yuva/shared` — one list shared by the
tick boxes, the sidebar and the guards below, so the three cannot drift.

An admin's `modules` is always stored empty. They reach everything through the
flag, and keeping a list as well would be a second source of truth able to
disagree with the first.

### Where access is enforced

In [`routes/index.ts`](./src/routes/index.ts) — on the one page that lists the
whole API surface, rather than inside each module. A module registered without a
guard is visible in that diff; a guard forgotten three files away is not.

```
/auth        public (login), then authenticated
/customers   authenticate + requireModule('customers')
/quotations  authenticate + requireModule('quotations')
/materials   authenticate — reading rates is open to any signed-in user,
             because quotation costing depends on it. Writing a rate needs
             requireModule('rates'), applied on the write endpoints themselves.
/users       authenticate + requireAdmin
```

**The sidebar hiding a section is not access control.** It is a courtesy so the
app does not look broken. Anyone can type a URL or call the endpoint with curl,
so the server is what actually says no — and it returns 403 whether or not the
client bothered to hide the link.

### Things the API refuses

- Demoting or deactivating the **last active administrator**, so the system
  cannot be locked away from everyone.
- Deactivating or deleting **your own account**.
- Any hint about _why_ a login failed. Unknown user, wrong password and
  deactivated account all return the same message — saying which would tell
  someone guessing which half of the pair to keep working on. An unknown
  username is still verified against a dummy hash so it takes the same time as a
  real one.

Deactivating a user **drops their sessions immediately** rather than waiting for
expiry, and so does resetting their password — a password reset is usually a
response to a problem, and leaving the old sessions alive would defeat it.

### Creating the first administrator

```bash
ADMIN_USERNAME=anand ADMIN_PASSWORD='choose-a-real-one' ADMIN_NAME='Anand Hase' \
  npm run seed:admin -w @yuva/api
```

Credentials come from the environment rather than arguments, keeping the
password out of shell history and out of `ps`. The script refuses to run if an
active administrator already exists, so it cannot quietly mint a second one on a
live system. Everyone else is added from the Users screen.

### Endpoints

| Method | Path                    | Notes                                                                                                                                   |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Public. Rate limited to 10 attempts per 15 minutes per IP; successful logins are not counted, so normal work cannot lock the office out |
| POST   | `/auth/logout`          | Deletes this session                                                                                                                    |
| GET    | `/auth/me`              | Turns a stored token back into a session on boot                                                                                        |
| POST   | `/auth/change-password` | Your own password; signs out your other devices                                                                                         |
| GET    | `/users`                | Admin                                                                                                                                   |
| POST   | `/users`                | Admin — create                                                                                                                          |
| PATCH  | `/users/:id`            | Admin — name, admin flag, modules, active                                                                                               |
| POST   | `/users/:id/password`   | Admin — reset, drops that user's sessions                                                                                               |
| DELETE | `/users/:id`            | Admin — prefer deactivating                                                                                                             |

---

## Endpoints

All under `/api`. Health probes sit outside it, so they are never rate-limited.

### Health

| Method | Path            | Notes                                          |
| ------ | --------------- | ---------------------------------------------- |
| GET    | `/health`       | Liveness. Is the process up?                   |
| GET    | `/health/ready` | Readiness. Runs `SELECT 1` against PostgreSQL. |

### Customers

| Method | Path             | Notes                                               |
| ------ | ---------------- | --------------------------------------------------- |
| GET    | `/customers`     | Search, filter, paginate. See query below.          |
| GET    | `/customers/:id` | One customer **with all their jobs and full specs** |
| POST   | `/customers`     | Create. Optionally with nested jobs.                |
| PATCH  | `/customers/:id` | Update. Optionally with nested jobs.                |
| DELETE | `/customers/:id` | Delete; returns how many jobs were released.        |

Query: `page`, `pageSize`, `q`, `source` (`SHEET` / `BRAND_INFERRED`),
`isVerified`. `q` searches company, contact, mobile, alternate phone, email,
city, district, address and pincode. The list is always alphabetical by company.

**Nested jobs.** When `jobs` is present it is treated as the _complete_ set for
that customer: rows with an `id` are updated, rows without one are created, and
jobs no longer listed are **unlinked, never deleted** — they return to the
"needs a customer" worklist. Omit `jobs` entirely to leave them untouched.

**Deleting a customer** keeps their jobs (the foreign key is `ON DELETE SET
NULL`) but flags each one `needsCustomer`, so nothing silently disappears from
every view.

### Quotations

| Method | Path                       | Notes                                                                                                                 |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/quotations`              | Search by number, customer or job name; filter by status. Ordered Draft → Sent → Won → Lost, newest first within each |
| GET    | `/quotations/next-number`  | The number the next quotation will get                                                                                |
| GET    | `/quotations/:id`          | Full document with all lines                                                                                          |
| GET    | `/quotations/:id/pdf`      | The PDF. `?inline=1` displays, otherwise downloads                                                                    |
| POST   | `/quotations`              | Create; prices and costs every line                                                                                   |
| PATCH  | `/quotations/:id`          | Update; **re-prices the whole document**                                                                              |
| POST   | `/quotations/:id/send`     | Email it to the customer with the PDF attached                                                                        |
| GET    | `/quotations/:id/emails`   | Every recorded send, newest first                                                                                     |
| POST   | `/quotations/:id/outcome`  | Record won or lost — see [Winning and losing](#winning-and-losing)                                                    |
| POST   | `/quotations/:id/versions` | Revise it: same number, next version, as a draft                                                                      |
| GET    | `/quotations/:id/versions` | Every version of that number, newest first                                                                            |
| DELETE | `/quotations/:id`          | Delete; lines cascade                                                                                                 |

**The list shows only the current version of each number.** A revision keeps the
number, so without that filter repricing would grow a second row reading "121"
with different totals — the confusion versioning exists to prevent. Earlier
versions stay reachable through `GET /quotations/:id/versions`.

**A new company is created with the quotation.** `POST /quotations` with
`saveAsCustomer: true` and no `customerId` adds the company to the customer
master in the _same transaction_ as the quotation — a customer created for a
quotation that then failed to save would be a ghost record nobody asked for. A
company whose name already exists is reused rather than duplicated, since
`companyName` is unique and the office typing an existing name means that firm,
not a second one.

**Lines are replaced wholesale** on update. Positions shift and lines get
removed, so reconciling by id would be more fragile than rewriting the set.

**Every figure is computed server-side.** `POST`/`PATCH` ignore any totals sent
by the client — the numbers on a quotation are the whole point of the document.

The two mail routes have their own section:
[Sending quotations by email](#sending-quotations-by-email).

### Materials and rates

| Method | Path                     | Notes                                                                                                                                           |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/materials`             | With the rate in force, the previous one, and the change %. **Also materialises any missing daily rates** — see [Carry-forward](#carry-forward) |
| POST   | `/materials`             | Add a material                                                                                                                                  |
| PATCH  | `/materials/:id`         | Rename, re-price-group, set density, retire                                                                                                     |
| GET    | `/materials/:id/history` | Every recorded rate, newest first                                                                                                               |
| PUT    | `/materials/rates`       | Save a day's rates in one request                                                                                                               |

Query on `GET /materials`: `onDate` (yyyy-mm-dd, defaults to today),
`includeInactive`.

`GET /materials` is the one read in the API that writes: it brings every
material's rates up to today before answering. The write is idempotent and
never changes an existing row, so the endpoint is still safe to call repeatedly
and safe to retry. `onDate` does not affect it — rates are always carried
forward to today, never to the date being viewed, so opening last month's rates
cannot backdate anything.

Rates are saved as a **batch, not per field** — the office keys the morning's
rates in together, and a partial save would leave the day half-recorded.

### Settings

| Method | Path        | Notes                                 |
| ------ | ----------- | ------------------------------------- |
| GET    | `/settings` | All settings, with defaults filled in |
| PATCH  | `/settings` | Update any subset                     |

Stored as key/value rows so a new setting never needs a migration. Anything
missing falls back to a documented default, so a fresh database works with no
seeding step.

| Setting                   | Default         | Meaning                                      |
| ------------------------- | --------------- | -------------------------------------------- |
| `quotationStartNumber`    | 119             | Continues the client's existing paper series |
| `cylinderRate`            | 2.5             | Multiplier in the cylinder cost formula      |
| `gstPercent`              | 18              | Applied to material and cylinder totals      |
| `materialAdvancePercent`  | 70              | Advance taken on the material total          |
| `cylinderAdvancePercent`  | 100             | Advance taken on the cylinder total          |
| `inkGsm`                  | 1.8             | Ink laid down per m², for costing            |
| `adhesiveGsm`             | 2.5             | Adhesive laid down per m², for costing       |
| `defaultPetMaterial`      | `PET 12µm`      | Which material's rate prices the PET layer   |
| `defaultInkMaterial`      | `Ink — Black`   | Which rate prices the ink                    |
| `defaultAdhesiveMaterial` | `Adhesive — PU` | Which rate prices the adhesive               |

---

## Calculations

All arithmetic lives in `packages/shared`, so the form, the API and the PDF
produce identical numbers from identical inputs. It is locked to the client's
real quotation #118 by tests (`packages/shared/src/lib/quotation-math.test.ts`).

### The vocabulary

Every figure on a quotation traces back to these. Worth reading once.

| Term               | What it is                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Micron (µ)**     | Thickness of a film ply. One thousandth of a millimetre.                                                                                                                                              |
| **Density**        | Weight of a film per unit volume, g/cm³. What turns a thickness into a weight.                                                                                                                        |
| **GSM**            | Grams per square metre — `microns × density`. The unit everything is costed in, because film is bought by weight.                                                                                     |
| **Composite GSM**  | All the plies added together: the weight of one square metre of the finished laminate.                                                                                                                |
| **PET**            | The printed outer ply. 12µ in every structure this works produces.                                                                                                                                    |
| **MET PET**        | Metallised PET — the same 12µ film with a thin aluminium coating. A barrier against moisture, oxygen and light, and what makes a pouch silver inside. Usually the middle ply of a three-ply laminate. |
| **Poly**           | The inner sealing ply. Its grade is chosen per job; picking the film sets its thickness, density and rate together, because the film's name states its gauge.                                         |
| **Adhesive**       | Bonds the plies. Adds 2µ and its own GSM.                                                                                                                                                             |
| **Yield factor**   | A wastage allowance applied when working out pouches per kilogram.                                                                                                                                    |
| **Pouches per kg** | How many pouches a kilogram of finished film yields. Falls as the film gets thicker.                                                                                                                  |
| **Repeat**         | How many times the design wraps around the cylinder. Sets the engraved area, and so the cylinder's cost.                                                                                              |

### The laminate, ply by ply

A quotation line states its own structure. Each ply carries a material and a
thickness, and the engine turns that into weight through the material's density:

```
GSM = microns × density        (12µ PET at 1.4 g/cm³ = 16.8 GSM)
```

Two or three plies is what this works produces; the schema allows four, so a
foil laminate can be quoted the day it is first asked for rather than after a
release.

> **This used to be a single choice.** "2 layer" or "3 layer" selected a fixed
> structure — one PET at 12µ, a metallised PET on a 3-layer job, and whichever
> film the office picked for the sealant. Correct for today's jobs, but the
> client could not read what he was quoting off that control, and a 19-micron
> PET or a foil ply needed a developer. Quotations saved before the change keep
> their stored figures; the migration reconstructed their plies from the
> structure that was assumed.

**The thickness is the film's, not a separate figure.** Every film in the rates
master is named with its gauge — `PET 12µm`, `PE 60µm` — because a 12µ PET and a
19µ PET are two different materials at two different prices. The web form reads
the micron off the chosen film's name (`micronFromFilmName` in `@yuva/shared`)
rather than asking for it a second time, so the two cannot disagree; quotation
#123 carries a "PET 19µm" ply recorded at 60 microns from when they could.

The API is unchanged by this: `micron` is still per-ply on the request and still
what is stored and costed. Deriving it is a decision the form makes, so an
import or a correction can still state a gauge the catalogue does not name — and
so a film named without one (`PP Woven`, specified by GSM) stays quotable.

The layer **count** still moves two things on its own:

```
micron = every ply + 2µ adhesive          (flat, not per bond)
yield factor: 2 plies 1.1, 3 or more 1.2
```

The adhesive is a single 2µ whatever the ply count. A three-ply laminate is
glued twice and ought to carry twice as much, but the client's spreadsheet adds
one either way and every imported job matches it — changing it would move
pouches-per-kg on every 3-layer line ever quoted.

The same 420 × 260 pouch with a 45µ sealant, 250 kg ordered at ₹300/kg:

|                | PET + Poly     | PET + MET PET + Poly |
| -------------- | -------------- | -------------------- |
| Micron         | 59             | 71                   |
| Yield factor   | 1.1            | 1.2                  |
| Pouches per kg | 141.10         | **107.48**           |
| 250 kg yields  | 35,275 pouches | **26,870 pouches**   |
| Composite      | 63.4 GSM       | 80.2 GSM             |
| Cost per kg    | ₹215.32        | **₹224.26**          |
| Margin at ₹300 | 28.23%         | **25.25%**           |

**Thicker film means fewer pouches per kilogram.** The same 250 kg yields about
24% fewer three-ply pouches. Quoting per kilogram at an unchanged rate therefore
earns the same money for materially fewer pouches, which is why the customer's
cost per piece rises even when the rate per kg has not moved.

The cost per kilogram rises too, because MET PET is dearer than the plain PET
beside it. At the same selling rate the margin drops about three points.

**A ply the office left unchosen makes the line uncostable, not free.** So does
a material with no density recorded — it cannot be turned into a weight. Either
way the line reports no cost and no margin rather than an average of whatever
happened to be left, which is what it used to do: dropping the sealant out of a
two-ply structure discarded three quarters of the pouch's weight and reported a
confident, much higher figure.

### Quantity tiers

A line can be priced at up to three quantities, and the document carries totals
for each. Every line on one quotation must be priced at the same number of
quantities — they are columns on one document, and a line with three where
another has two would leave a hole no total could describe.

The arithmetic splits in two, which is the point:

```
geometry   thickness, pouches per kg, the cylinders   — the same at every quantity
money      order quantity, rate, amount, margin       — one set per quantity
```

**The cylinders cost the same in every column.** They do not scale with the
order, so they are costed once and spread across whichever quantity is being
looked at — which is exactly why the price per pouch falls as the quantity
rises. That is a real effect the customer can check, not a discount typed in by
hand.

### Versions

The office reprices rather than renumbers. The customer already has "QUO-124" on
their desk, and a second document with a different number reads as a second
offer rather than a corrected one — so a revision keeps the number and takes the
next version.

```
QUO-124 v1   sent, superseded      isLatest false
QUO-124 v2   draft, current        isLatest true
```

A revision is an **exact copy**: plies, quantities, tiers, totals, the rates it
was costed against and the date it carries. Nothing is repriced on the way in,
because pressing "new version" should not silently move a figure the customer
has already been quoted. It reprices on the first save, which is the point at
which the office has decided what they are changing.

It starts as a **draft**, and does not inherit the answer recorded against the
version it came from — carrying either across would misreport what was agreed.

Deleting is careful about both of those. Deleting the current version promotes
the highest survivor, or the number would vanish from the list while its history
sat there unreachable; and because revisions hang off the first version through
a cascading key, deletion re-parents the survivors first, so removing an old v1
cannot destroy the live v3.

### Quotation line

Given: **roll or pouch** (and for a pouch, its style), the plies with their
materials and thicknesses, width and height in mm, one to three quantities with
their rates, repeat width and height, cylinder count, optional transport cost,
and whether this design's cylinders are being charged for.

Roll or pouch is recorded, not calculated — it changes what the customer
receives, not what the line costs. A roll carries no pouch style; the schema
clears it rather than rejecting the combination, so switching a line from pouch
to roll is not an error the user then has to tidy up.

**1. Total micron** — every ply, plus one 2µ adhesive:

```
PET 12 + Poly 45              micron = 59
PET 12 + MET PET 12 + Poly 60 micron = 86
```

**2. Yield factor** — more plies waste more:

```
2 plies: 1.1     3 or more: 1.2
```

**Gazette pouches and rolls change what "width × height" means.**

A gazette gussets at the sides and the base so the pouch stands, and that depth
is film the flat sheet has to carry. The pouch the customer holds is
`widthMm × heightMm`; the film it is cut from is

```
film width  = width  + left gazette + right gazette
film height = height + bottom gazette
```

Everything below works from the film, not the pouch — the weight, because that
film is what is bought, and the cylinder, because that film is what is printed.
A 250 × 205 pouch with 30/30/40 is cut from 310 × 245, which is both heavier and
a wider engraving.

**A roll yields no pouches at all.** Film on a reel has not been converted into
anything, so pouches-per-kg is not small or approximate — it is a quantity that
does not exist. The engine returns 0 and the form and the PDF both print a dash;
`0.00` would read as a count.

**3. Pouches per kg** — how many pouches a kilogram of film yields:

```
pouches/kg = 1000 ÷ ( ((width × height ÷ 100) × micron × factor) ÷ 10000 )
```

**4. Total pouches** — note the rounding order:

```
totalPouches = round( round(pouches/kg, 2) × quantityKg )
```

Pouches per kg is rounded to **2 decimals before** multiplying. This is not
cosmetic: the 1 Kg Paneer Bag line reads **24,930** on the client's document,
and multiplying the unrounded 99.716 gives 24,929. The spreadsheet rounds
first, so we do too.

**Those two decimals are printed too.** Pouches per kg is a multiplier the
customer checks against the total, so showing it as a whole number stops it
reconciling: 29.67 prints as 30, and 30 × 100 kg suggests 3,000 pouches where
the line correctly reads 2,967.

**5. Printing total** — and this depends on the pouch style:

```
PER_POUCH   totalAmount = quantityPouches × ratePerPouch
PER_KG      totalAmount = quantityKg      × ratePerKg
```

**The basis is chosen on the line**, and stored on it as `pricingBasis`. A line
that does not state one takes the convention for its style — standup and
standup-zipper by the piece, because the converting work dominates their cost
and the trade writes those orders in pieces; everything else by weight. That is
`pricingBasisFor()` in `@yuva/shared`, and it is the schema's default, not its
rule.

> It used to be the rule: derived from the style and never chosen, with the
> server re-deriving it rather than trusting the client. That refused a real
> order — a customer who buys standup pouches by the kilogram — so the office
> now decides, and the choice travels with the line.

**A roll is still forced to `PER_KG`**, in the schema's transform, whatever the
request asks for. There are no pouches on a reel to count. Note that the reprice
path in `updateQuotation` carries the stored basis forward explicitly: a PATCH
that does not resend the lines must not flip them back to their style's
convention.

**Both units are stored on every line.** On a per-pouch line the weight is
worked back from pouches-per-kg, because the film is ordered against it; on a
per-kg line the rate one pouch works out at is derived. That way lines on a
mixed quotation can be compared, and nothing downstream has to recompute.

```
per pouch:  quantityKg = quantityPouches ÷ pouchesPerKg
            ratePerKg  = totalAmount ÷ quantityKg
per kg:     ratePerPouch = totalAmount ÷ totalPouches
```

Worked example — 50,000 standup pouches, 420 × 260 mm, 3 layer, 45µ poly, at
₹4.20 each:

```
pouches/kg = 107.48
totalAmount = 50,000 × 4.20        = ₹2,10,000
quantityKg  = 50,000 ÷ 107.48      = 465.203 kg
ratePerKg   = 2,10,000 ÷ 465.203   = ₹451.42
```

On the printed quotation a per-pouch line shows its pouch count under Order Qty
and reads `4.20 /pc` in the rate cell. The Order Qty **total** is only summed
when every line shares a basis — adding kilograms to pouches would print a
number the customer could check and find wrong, so a mixed document shows a dash
there. The money totals are unaffected; those are always rupees.

**6. Cylinder** — the +80 is the mounting allowance:

```
cylinderWidth         = width × repeatWidth + 80
cylinderCircumference = height × repeatHeight
costPerCylinder       = (cylinderWidth × cylinderCircumference ÷ 100) × cylinderRate
totalCylinderCost     = costPerCylinder × cylinderCount + transportCost
```

Both repeats are **suggested** by `suggestRepeatWidth` and `suggestRepeatHeight`,
and both stay editable. The rules come out of the works' own records rather than
being chosen:

| From the 347 imported jobs that record a cylinder                |            |
| ---------------------------------------------------------------- | ---------- |
| Recorded circumference is an exact multiple of the design height | 84%        |
| Range of those circumferences                                    | 310–740mm  |
| Where they cluster                                               | around 480 |
| `width × ups + 80` at or under 800mm                             | 95%        |

So the height repeat is the whole number putting the circumference inside
310–740 and closest to 490, and the width repeat is as many lanes as an 800mm
face will take. Replayed against the same jobs, that reproduces the repeat the
works actually chose on **85%**; the rest are designs where two repeats both fit
and the works took the other — which cylinder was free, not arithmetic, and the
reason these are suggestions.

**Transport is part of this total.** It is the one term that is not derived from
the cylinder's size, so checking the figure as cylinders × cost-per-cylinder
comes up short by exactly the transport and looks like an error. A line with
4 cylinders at ₹9,085 and ₹100 transport totals **₹36,440**, not ₹36,340. The
form spells the sum out beneath the field, and the PDF says so under the totals
whenever any transport was charged.

**Cylinders are charged per design, not per customer.** A line for a design
whose cylinders are already in the works sets `chargeCylinders: false`, and the
total becomes zero — transport included, because there is nothing to deliver.
The cost per cylinder is still reported, so the office can see what a new set
would cost if one were damaged.

The form derives the flag rather than asking for it: a line prefilled from one of
the customer's saved jobs is a repeat and sets it false, and choosing "new
design" sets it true. The API takes whichever value it is sent, so a client that
knows better can say so.

The rule is deliberately not "existing customer, no cylinders". A customer of
ten years ordering a new pouch still needs a set engraved, and the printed terms
have always said exactly that: _"each job/design requires a separate cylinder"_,
and _"cylinder charges are one-time and reusable for repeat orders (same
design)"_. Keying it to the customer would quote ₹0 for cylinders that must
actually be cut.

Worked example, 5 Kg Paneer Bag, 670 × 460 mm, 60µ poly, 2 layer, 250 kg at
₹295, repeat 1 × 1, 4 cylinders, no transport:

```
micron            = 12 + 60 + 2 = 74
pouches/kg        = 1000 ÷ (((670×460÷100) × 74 × 1.1) ÷ 10000) = 39.86
totalPouches      = 39.86 × 250                                 = 9,965
totalAmount       = 250 × 295                                   = ₹73,750
cylinderWidth     = 670 × 1 + 80                                = 750
circumference     = 460 × 1                                     = 460
costPerCylinder   = (750 × 460 ÷ 100) × 2.5                     = ₹8,625
totalCylinderCost = 8,625 × 4                                   = ₹34,500
```

### Quotation totals

```
materialSubtotal = Σ line totalAmount
cylinderSubtotal = Σ line totalCylinderCost
grandSubtotal    = materialSubtotal + cylinderSubtotal

materialWithGst  = round(materialSubtotal × 1.18)
cylinderWithGst  = round(cylinderSubtotal × 1.18)
grandWithGst     = round(grandSubtotal   × 1.18)

materialAdvance  = materialWithGst × 70%
cylinderAdvance  = cylinderWithGst × 100%
totalAdvance     = materialAdvance + cylinderAdvance
```

**Advances are taken on the GST-inclusive amounts.** The client's spreadsheet
printed pre-GST figures on the two advance rows but a GST-inclusive Advance
total, and the two did not reconcile (₹1,65,910 against ₹1,95,774). Confirmed
with the client: GST-inclusive is what they actually collect, so both the rows
and the total now use it.

### Reading a printed quotation

Every column on the document, and where its number comes from. **Typed** means
someone entered it; everything else is worked out.

| Column                   | Source                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| Job Name                 | Typed                                                                    |
| Layer                    | How many plies, see [The laminate, ply by ply](#the-laminate-ply-by-ply) |
| Job Size, Width × Height | Typed, in mm                                                             |
| Micron                   | every ply + 2µ adhesive                                                  |
| No. of Pouch Per kg      | `1000 ÷ ((W×H÷100 × micron × factor) ÷ 10000)`, to 2 decimals            |
| Order Qty                | Typed. **Kilograms**, or **pouches** on a standup line                   |
| Total Pouches            | `pouches/kg × kg`, or the typed count on a standup line                  |
| Rate /Kg                 | Typed. Reads `4.20 /pc` on a standup line, which is priced per piece     |
| Total Rs.                | `kg × rate/kg`, or `pouches × rate/pouch`                                |
| Cylinder Size, Width     | `job width × repeat width + 80` — the 80 is mounting allowance           |
| Cylinder Size, Circum    | `job height × repeat height`                                             |
| No. of Cylinder          | Typed                                                                    |
| Cost Per Cylinder        | `(cyl width × circum ÷ 100) × cylinder rate`                             |
| Total Cylinder Cost      | `cost per cylinder × count` **+ transport**                              |

Three of these do not reconcile the way a reader first expects, and each has
caught someone out:

- **Total Cylinder Cost includes transport.** It is the one term not derived
  from the cylinder's size, so checking `cost per cylinder × count` comes up
  short by exactly the transport. The document says so beneath the totals
  whenever any was charged.
- **Pouches per kg is printed to two decimals** because it is a multiplier the
  reader checks against the total. As a whole number it stops reconciling —
  29.67 shown as 30 makes `30 × 100 kg` look like 3,000 pouches where the line
  correctly reads 2,967.
- **A line priced at several quantities prints one row per quantity.** The
  table is already sixteen columns on a 194mm page, so the quantities go down
  rather than across — and a job's geometry and its cylinders do not vary by
  quantity anyway, so those cells span the rows and only the money repeats.
  Totals follow the same shape: one row per quantity, with the cylinder count
  and cost spanned across them rather than repeated, because repeating the same
  figure down a column reads as being charged for it three times.
- **The summary transposes** when there is more than one quantity — a column
  each, with cylinders on a single row because they cost the same in all of
  them. That side-by-side comparison is the whole reason for quoting tiers and
  does not work stacked. A single-quantity document keeps the original layout.
- **Order Qty is not always kilograms.** A standup or standup-zipper line is
  quoted per piece, so that cell holds a pouch count. When a document mixes the
  two, the Order Qty **total shows a dash** — adding kilograms to pouches would
  print a number that cannot be checked.

### What is frozen, and what moves

A saved quotation is a **snapshot**, not a live view:

| Frozen at save                                    | Read live                                         |
| ------------------------------------------------- | ------------------------------------------------- |
| Every total and line figure                       | Nothing on a saved quotation                      |
| The customer's name, address, mobile, GSTIN       | The customer master, which may since have changed |
| The material rates used, and the margin they gave | Today's rates, on the Rates screen                |
| Cylinder rate, GST %, advance %                   | The same settings, for the _next_ quotation       |

So a quotation accepted in March keeps March's prices and March's margin,
whatever has happened since. Editing one **re-prices the whole document** at the
rates in force on its own date — which is why the edit screen warns that
changes are re-priced and the PDF regenerated.

### Material cost and margin

A quotation is priced per kilogram of finished film, so every component must
become a weight before it can be costed. Films are specified by thickness, and
**density** converts it:

```
GSM = microns × density          e.g. 12µ PET at 1.4 g/cm³ = 16.8 GSM
```

Ink and adhesive are laid down by weight already, so their GSM comes from
settings rather than from a thickness.

```
plyGsm       = ply micron × that material's density      once per ply
inkGsm       = settings.inkGsm
adhesiveGsm  = settings.adhesiveGsm
compositeGsm = Σ plyGsm + inkGsm + adhesiveGsm

costPerKg = Σ(componentGsm × componentRate) ÷ compositeGsm
margin %  = (sellingRate − costPerKg) ÷ sellingRate × 100
```

A ply may carry a **rate the office typed** instead. The rates master prices a
film at the gauge it is stocked in, so quoting a 20µ PET when 12 and 19 are on
the list means neither rate applies — the line asks for one, and what is typed
is stored on the ply. It never reaches the rates master. Recognised on reload by
`overriddenRate`: the ply keeps the film's name, and a name stating a gauge
different from the one quoted is the override, so no flag has to be stored.

Otherwise every ply is costed against **its own material's rate**, so a
metallised PET is priced as MET PET and not as the plain PET beside it — same 12µ and the same
density, so quoted prices and pouch counts are identical either way, but a
different material at a different price.

**The margin does not move with the quantity, and that is correct.** Both sides
are per kilogram, so the ratio cannot depend on how many kilograms are bought:
1,000 pouches at ₹10 and 100,000 at ₹10 both come to ₹1,623/kg against ₹213.65
of material, and both report 86.84%. Ordering twice as much at the same price
earns twice the money at the same margin.

What genuinely improves with volume is the **all-in cost of a pouch**, because
the cylinders are charged once whatever the order:

```
1,000 pouches   ₹10,000 + ₹21,500 cylinders  ÷ 1,000    = ₹31.50 each
100,000 pouches ₹1,000,000 + ₹21,500         ÷ 100,000  = ₹10.22 each
```

That is the figure behind "order more and it gets cheaper", and it is the whole
reason a quotation carries two or three quantities side by side. It is a
document-level number, not a line-level one, so it appears on the Review step
and the printed page rather than beside the rate.

**The margin is material only.** Films, ink and adhesive are in it; cylinders,
printing, lamination, slitting and wastage are not. It answers "what does the
film in this cost against what we are charging for it", which is the question
asked while choosing a rate — not "what does this job earn". The wizard says so
where the figure is shown, because a margin above 90% is otherwise alarming
rather than informative.

Both sides are **per kilogram**, so a line priced per piece is converted first:
1,000 pouches at ₹10 is ₹10,000 for 6.16 kg, a selling rate of ₹1,623/kg. That
is why a small light pouch sold per piece reports a far higher margin than a
heavy one at the same price per piece — there is very little film in it.

**A ply with no material chosen, or a material with no density recorded, stops
the whole line being costed.** It cannot be turned into a weight, so including
it is impossible and excluding it would report an average of the remaining plies
as though it were the laminate. Both cases return no cost and no margin, exactly
as a missing rate does.

Worked example — 2-layer, 60µ poly on PE 60µm (density 0.94, ₹190), PET ₹210,
ink ₹610, adhesive ₹480, selling at ₹295/kg:

```
petGsm       = 12 × 1.4  = 16.8
polyGsm      = 60 × 0.94 = 56.4
inkGsm       = 1.8       adhesiveGsm = 2.5
compositeGsm = 77.5

costPerKg = (16.8×210 + 56.4×190 + 1.8×610 + 2.5×480) ÷ 77.5 = ₹213.4452
margin    = (295 − 213.4452) ÷ 295                            = 27.65%
```

Worked example — **3-layer**, 60µ poly on PE 60µm (density 0.94, ₹190), PET
₹210, MET PET ₹258, ink ₹610, adhesive ₹480, selling at ₹320/kg:

```
petGsm       = 12 × 1.4  = 16.8
metpetGsm    = 12 × 1.4  = 16.8
polyGsm      = 60 × 0.94 = 56.4
inkGsm       = 1.8       adhesiveGsm = 2.5
compositeGsm = 94.3

costPerKg = (16.8×210 + 16.8×258 + 56.4×190 + 1.8×610 + 2.5×480) ÷ 94.3 = ₹221.3828
margin    = (320 − 221.3828) ÷ 320                                      = 30.82%
```

Pricing both plies as plain PET — which is what this did before MET PET was
separated out — gives ₹212.8314 and a margin of 33.49%. **Every 3-layer job
looked about 2.7 points more profitable than it was.**

**A missing rate produces no cost at all, not a partial one.** If any component
has no rate on the quotation's date, `materialCostPerKg` is `null`. An
understated cost would make a quotation look more profitable than it is because
someone had not keyed a rate in that morning — the worst possible failure here.

**Rates are read as of the quotation's own date**, and the result is stored on
the line. A quotation already sent keeps the margin it was accepted on, even
after prices move.

### Rates "in force"

`GET /materials?onDate=X` returns the **most recent rate on or before X** — not
the rate keyed in on that exact day. Rates are not entered every morning, and a
quotation made on a Sunday must still cost against Friday's price.

A blank rate on save means **"no change today"**, not zero: no row is written
and the previous rate stays in force.

#### Carry-forward

Every material's last known rate is copied forward, **one row per day, up to
today**, so the Rates screen always opens on a row for today that is already
filled in and ready to edit. Rates rarely move day to day, and nobody should
have to retype yesterday's numbers to record that nothing changed.

Costing never needed this — the `lte` lookup above already falls back to the
last rate in force. What it buys is the pre-filled screen, and a price history
that reads as a continuous daily series rather than scattered entries.

It runs **when rates are read, not on a schedule**:

- It is idempotent. The `(material_id, effective_date)` unique key means a
  second call, or a second open tab, inserts nothing.
- Render's free tier stops the service while idle, so a midnight cron would
  routinely not fire. Filling the gap when someone next opens the screen
  produces exactly the same rows, however many days were missed.

Carried rows are written with `entered_by = 'Carried forward'`, so the record
never claims the office keyed in a number it did not. Saving over one **updates
that row** rather than adding a second — `created: 0, updated: 1`.

A gap longer than `MAX_CARRY_FORWARD_DAYS` (90) fills only its most recent 90
days, so one unlucky page load after a long idle period cannot write thousands
of rows. Costing is unaffected, since old rates stay in force regardless.

**Change % compares against the literal previous row.** On a carried-forward day
that is the same number, so the Rates screen reads `0.00%` until someone
actually edits a rate. That is deliberate.

##### A worked week

The office prices PET 12µm at 210 on Monday, does not open the app again until
Friday, and puts the rate up to 225 that morning:

| Date       | Rate | `entered_by`    | Written when              | Change % shown |
| ---------- | ---- | --------------- | ------------------------- | -------------- |
| Mon 24 Aug | 210  | Office          | Monday, on save           | —              |
| Tue 25 Aug | 210  | Carried forward | **Friday**, on first read | 0.00%          |
| Wed 26 Aug | 210  | Carried forward | **Friday**, on first read | 0.00%          |
| Thu 27 Aug | 210  | Carried forward | **Friday**, on first read | 0.00%          |
| Fri 28 Aug | 225  | Office          | Friday, on save           | +7.14%         |

Three things this shows:

- **Missed days are filled in with their own dates**, not lumped onto the day
  someone noticed. Tuesday's row says Tuesday even though it was written on
  Friday, so the series stays honest.
- **Friday's save replaced Friday's carried row.** The screen was already
  showing 210 for Friday, so typing 225 updated that row rather than adding a
  second one for the same day. The save reports `updated: 1` and `created: 0`.
- **The change % is right anyway.** It compares Friday against Thursday's
  carried 210 and reports +7.14% — the literal previous row happens to hold the
  last real rate, because carrying forward is what keeps it there.

A quotation raised on Wednesday costs against 210 whether or not Wednesday's row
had been written yet. The `lte` lookup does not care; only the shape of the
history does.

#### Dates are the office's

The API runs with `TZ=Asia/Kolkata`. "Today" has to mean the office's today:
carry-forward happens at midnight IST, and a quotation dated on the morning of
the 26th must not be filed under the 25th. Without it the server runs UTC and
the date would not roll over until 05:30 local. Node's bundled ICU resolves the
zone name, so the Alpine image needs no `tzdata` package.

### Derived job fields

Three columns on a job are computed and never accepted from the client. Which
ones was decided by checking the imported data for formulas, not by guessing:

| Field          | Formula                                            | Held on        |
| -------------- | -------------------------------------------------- | -------------- |
| `compositeGsm` | ink + PET + metallised PET + poly + adhesive       | 411 / 411 rows |
| `pouchesPerKg` | 1e9 ÷ (design height × open width × composite GSM) | 384 / 384 rows |
| `jobCode`      | `YPP` + YY + MM + sequence, restarting each month  | identifier     |

A job code is generated on create and **never rewritten on update** — it is the
job's identity. Sending a forged `jobCode`, `compositeGsm` or `pouchesPerKg` has
no effect; they are not in the input schema at all.

---

## Data model

Full diagram and column reference: [`docs/database-schema.md`](../../docs/database-schema.md).
Regenerate after any migration with `npm run schema:docs -w @yuva/api`.

| Table                       | Holds                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `customers`                 | Companies that order. Text fields use `'NA'` where the imported sheet was blank.          |
| `jobs`                      | Products and their full 55-column specification.                                          |
| `quotations`                | Customer-facing documents. Totals frozen at save; `lost_reason` says why a loss was lost. |
| `quotation_items`           | One priced line: its design, its gazette, its geometry and its cylinders.                 |
| `quotation_item_layers`     | One ply of a line's laminate — material, thickness, density and rate, all snapshotted.    |
| `quotation_item_quantities` | One line's figures at one quoted quantity.                                                |
| `quotation_tiers`           | One quoted quantity and the document totals at it.                                        |
| `materials`                 | The rate catalogue, with density for films.                                               |
| `material_rates`            | One material's price on one date — one row per active material per day.                   |
| `quotation_emails`          | One recorded attempt to email a quotation — recipients, subject, who sent it.             |
| `app_settings`              | Editable rates and costing defaults.                                                      |
| `users`                     | Accounts, their password hash and which modules each may reach.                           |
| `sessions`                  | Live sign-ins. Deleted on expiry, so this table is always "right now".                    |
| `login_events`              | Every successful sign-in, kept permanently. Survives the account being deleted.           |

Two deliberate choices:

**`jobs.job_code` is not unique.** Thirteen codes are reused across 36 rows in
the source spreadsheet for genuinely different jobs. A surrogate `id` is the key
until the client confirms the correct codes.

**Nothing cascades except quotation lines.** Deleting a customer sets
`customer_id` to null on their jobs and quotations rather than destroying
production history or a sent quotation. A line's plies and quantities do cascade
with the line, and a quantity also cascades with its tier — they describe it and
have no meaning apart from it.

**A ply keeps its own copy of what it was costed against.** The material link is
there for reporting, but the name, density and rate are snapshotted onto the row:
a quotation is a document, and the rate it was costed against must not move when
the rates screen is updated tomorrow. Retiring a material sets the link to null
and leaves the history readable.

Money and quantities are `Decimal`, never `Float` — this system computes costs
and variance, and floating point drift in a costing engine is a silent
correctness bug.

---

## Winning and losing

`POST /quotations/:id/outcome` records what the customer said. It takes
`{ outcome: 'WON' | 'LOST', lostReason }`.

This is a separate endpoint rather than a status change through `PATCH`, because
winning has consequences. They belong behind a deliberate action, not a dropdown
someone might brush past while editing something else.

### Winning turns an enquiry into standing records

A won quotation is the moment an enquiry becomes a real customer with real jobs,
and doing that by hand means retyping a specification already on the screen. So
winning:

1. **Attaches the quotation to a customer**, creating one from the quotation's
   own snapshot — name, address, mobile, email, GSTIN — if it was never linked
   to the master. A company of the same name is reused, never duplicated.
2. **Adds each line as a job** on that customer, so the next quotation for them
   can be prefilled from it. The line's kind, pouch style, ply count, micron,
   design size and cylinder count carry across, along with each ply's thickness
   and GSM.

The jobs table predates stated plies: it has three fixed slots, for the printed
ply, an optional metallised one, and the sealant. A line's plies map onto them by
position — outermost first, sealant last, anything between into the middle. A
four-ply laminate therefore loses its third ply _in the jobs record_. That is the
jobs table's limitation, not the quotation's: the quotation itself keeps every
ply, and the job is only ever a starting point for the next enquiry.

The response says exactly what happened, rather than a bare success:

```json
{
  "status": "WON",
  "customerId": "...",
  "customerCreated": true,
  "jobsCreated": ["Winmark Chips 100g", "Winmark Roll"],
  "jobsSkipped": []
}
```

**A job the customer already holds under the same name is left alone and
reported, never overwritten.** Two things follow. Winning the same quotation
twice is harmless — the second time creates nothing. And a job record the office
has been maintaining cannot be flattened by a quotation line, which carries far
fewer of the job's fields.

### Losing records why

`lostReason` is **required** on a loss and cleared on a win. "We lost it"
teaches nothing a year later; "price 8% over the incumbent" is the entire reason
for asking. The three-character minimum is not a quality bar — it only stops an
empty box being submitted by reflex.

`decidedAt` timestamps either answer.

---

## Sending quotations by email

`POST /quotations/:id/send` renders the PDF, attaches it, and emails it through
[Resend](https://resend.com). The web client reaches it from the list, from a
card on mobile, or from the preview.

| Method | Path                     | Notes                                                             |
| ------ | ------------------------ | ----------------------------------------------------------------- |
| POST   | `/quotations/:id/send`   | `{ to[], cc[], subject, message }`. Needs the `quotations` module |
| GET    | `/quotations/:id/emails` | Every recorded send, newest first                                 |

### What happens, in order

1. The PDF is rendered **fresh**, never reused from a cache. A document sent
   from a stale render would be a quietly wrong price list.
2. Resend is called, with a 30-second timeout.
3. **Only once Resend accepts** is the send recorded and the status advanced.

That order matters. Writing first would leave a quotation marked Sent that never
went anywhere — the more damaging way to be wrong, because the office would stop
chasing it.

Sending a **draft** moves it to Sent. A quotation already Won or Lost keeps its
status; forwarding a copy should not drag it backwards. `Quotation.sentAt`
records the **first** send only and is never overwritten; the full history lives
in `quotation_emails`, because a quotation is commonly revised and sent again
and "who has seen this, and when" is a question the office asks.

### Configuration

| Variable         | Meaning                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Optional. Without it the app runs normally and only this action reports that email is unavailable, so a developer with no credentials is not blocked from everything else |
| `MAIL_FROM`      | The sender. Must be an address Resend will send from                                                                                                                      |
| `MAIL_REPLY_TO`  | Optional, if replies should go somewhere other than the sender                                                                                                            |

**`MAIL_FROM` decides whether this feature is usable.** `onboarding@resend.dev`
needs no domain, but Resend will only deliver to the address that owns the
Resend account — fine for a demo, useless for sending to a customer. Any other
address must be on a domain **verified in the Resend dashboard**, and that is
what real sending requires.

`delivered@resend.dev` is Resend's simulator: it exercises the whole path and
reaches nobody. Use it to test without emailing a real person.

### Failures the office will actually see

Resend's own errors are unhelpful out of context — a 403 for test mode reads
like a bug in this app. They are translated in `lib/mailer.ts`:

| Cause                                   | What the user is told                                   |
| --------------------------------------- | ------------------------------------------------------- |
| Test-mode sender, third-party recipient | Verify a domain and set `MAIL_FROM` to an address on it |
| Unverified domain in `MAIL_FROM`        | Verify it, or use `onboarding@resend.dev` while testing |
| A reserved domain such as `example.com` | Use a real address, or `delivered@resend.dev`           |
| No API key configured                   | Email is not configured on the server                   |

### Safety

Sending is rate limited to **60 an hour** — looser than login, far tighter than
the general API. Each call costs money at the provider, renders a PDF with
Chromium first, and is the only endpoint here that reaches outside the company;
the limit bounds a runaway loop rather than rationing ordinary work.

The customer name and the sender's note are both **escaped** before going into
the HTML. Neither is trusted: the names came from a spreadsheet import, and a
company really can be called "Smith & Sons". Every message carries a plain-text
alternative, because some clients render nothing else.

---

## Sign-in monitor

`GET /api/monitor` — a read-only snapshot of who has been using the system.
Administrators only, over the ordinary session; the browser screen that renders
it is documented in [the web README](../web/README.md).

Returns three things, all timestamps ISO in UTC — the screen converts to IST:

- **`users`** — one row per account: role, whether it is still active, the last
  time it was used, and how many sessions it has open. Ordered by most recent
  sign-in, with accounts nobody has ever used last.
- **`sessions`** — one row per live session: when it started, when that browser
  last made a request, when it expires.
- **`history`** — every successful sign-in, newest first, with the address it
  came from and the browser that made it.

`?limit=` how many history rows to return: 100 by default, 1000 at most. A value
that is not a number falls back to the default rather than erroring.
`historyTotal` always reports the true count, so the screen can say when it is
showing a slice.

### How far back each part goes

The three answer different spans, and it matters which one is being read:

- **`users[].lastLoginAt`** is a single column, overwritten every time. Always
  current, keeps no history.
- **`sessions`** last seven days and are deleted once they expire, so that list
  is only ever "the current week".
- **`history`** is `login_events`, and nothing removes a row. It goes back to
  the day the table was created.

Signing in writes all three inside one transaction, so they cannot disagree.

### What the history records, and what it does not

Each row keeps the username and display name **as they stood at that moment**,
alongside a nullable link to the account. Renaming a user therefore does not
rewrite their past, and deleting one does not erase it — the foreign key is
`ON DELETE SET NULL`, and those rows come back with `accountExists: false`. Same
reasoning as `quotation_emails.sent_by`.

The address is whatever Express resolves under `trust proxy`. The user agent is
stored whole and truncated at 512 characters, because it is client-supplied and
unbounded; the screen shows a short description derived from it.

**Only successful sign-ins are recorded.** Failed attempts are not, deliberately:
the interesting failure is a sustained one, and that is what the login rate
limiter answers. Recording them would mean storing attempted usernames, which
are frequently somebody's mistyped password.

Nothing prunes the table. At an office of this size that is a few rows a day and
will not need attention for years.

### Where the first rows came from

The table shipped empty, which would have left the screen blank on the day it
went live even though people had plainly been signing in. A second migration
seeds it from the sessions that already existed — each one is a real sign-in
with a real timestamp, so the previous week was recovered exactly.

Those backfilled rows carry no address or browser, because neither was ever
recorded, and their names are the account's current ones rather than a snapshot.
They are the only rows in the table of which that is true.

## CORS

`CORS_ORIGINS` is a comma-separated allowlist. Entries may contain `*`, which
matches any run of characters **except a dot or a slash** — so a wildcard stays
inside one hostname label.

That exists for Vercel preview deployments, which get a new hostname per branch
and per commit. One pattern covers all of them:

```
CORS_ORIGINS=https://yuva-polyprint.vercel.app,https://yuva-polyprint-*.vercel.app
```

| Origin                                                | Allowed |
| ----------------------------------------------------- | ------- |
| `https://yuva-polyprint.vercel.app`                   | yes     |
| `https://yuva-polyprint-git-abhi-dev-me.vercel.app`   | yes     |
| `https://yuva-polyprint-k2f9x1qzp-me.vercel.app`      | yes     |
| `https://someone-elses-app.vercel.app`                | no      |
| `https://yuva-polyprint-x.attacker.com`               | no      |
| `http://yuva-polyprint.vercel.app` (scheme downgrade) | no      |

**Keep the project name in the pattern.** `https://*.vercel.app` would let any
site anyone deploys on Vercel call this API with credentials attached.

A request with **no `Origin` header is always allowed** — that is curl,
server-to-server calls, and the Vercel rewrite, which proxies `/api` from the
edge and never presents a browser origin. In the deployed setup that is every
request, which is why `CORS_ORIGINS` can stay at its localhost default: the
browser only ever talks to the Vercel host. See
[Preview deployments and CORS](../../README.md#preview-deployments-and-cors).

---

## Hosted database (Neon)

Local development runs against the Docker container. Neon holds the same schema
and data for deployed environments; the two are kept separate on purpose, so
experiments and re-seeding locally never touch real data.

### One-time setup

Copy `.env.neon.example` to `.env.neon` (git-ignored) and paste both connection
strings from the Neon console:

| Variable       | Endpoint | How to spot it                  |
| -------------- | -------- | ------------------------------- |
| `DATABASE_URL` | Pooled   | Host contains `-pooler`         |
| `DIRECT_URL`   | Direct   | Same host **without** `-pooler` |

Keep `?sslmode=require` on both.

**Why two.** Prisma migrations take advisory locks and run DDL, which a pooled
endpoint cannot hold — migrations hang or fail with a lock error. So
`prisma.config.ts` uses `DIRECT_URL` when it is set and falls back to
`DATABASE_URL` otherwise, which is what plain Postgres wants.

### Deploying the schema

```bash
cd apps/api && set -a && source .env.neon && set +a && npx prisma migrate deploy
```

`migrate deploy` applies pending migrations without prompting and never resets
— it is the command for anything that is not your own machine.

### Copying data up

```bash
npm run db:copy-to-remote -w @yuva/api
```

Reads the target from `.env.neon`, so the connection string never reaches shell
history or a process listing, and echoes it with the credentials masked.

Three things it does that a plain `pg_dump | psql` does not:

- **Dumps table-by-table in dependency order.** `pg_dump --data-only` emits
  tables alphabetically, which tries to insert `jobs` before the `customers`
  they reference and fails on the foreign key.
- **Refuses to run when the target already holds rows**, rather than
  duplicating them or dying halfway on a unique key.
- **Restores in a single transaction**, so a partial copy cannot leave the
  target in a state that blocks a clean retry.

It finishes by printing local and remote row counts side by side for every
table.

### Pointing the API at Neon temporarily

```bash
cd apps/api && set -a && source .env.neon && set +a && PORT=4001 npm run dev
```

Your `.env` stays pointed at Docker throughout.

---

## Scripts

| Command                              | Does                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `npm run dev`                        | Watch mode on port 4000                              |
| `npm run build` / `start`            | Compile to `dist/`, then run it                      |
| `npm test`                           | Vitest, including the shell smoke tests              |
| `npm run db:migrate`                 | Create and apply a migration                         |
| `npm run db:studio`                  | Prisma Studio                                        |
| `npm run seed:materials`             | Seed the 16 materials and opening rates. Idempotent. |
| `npm run import:legacy -- --dry-run` | Parse the legacy sheet, write nothing                |
| `npm run import:legacy [-- --fresh]` | Import it; `--fresh` replaces existing rows          |
| `npm run schema:docs`                | Regenerate the database documentation                |

### PDF rendering

`GET /quotations/:id/pdf` renders with Puppeteer from
`quotation-document.ts` — one self-contained A4 page, everything inlined,
because the renderer has no network access.

One Chromium instance is shared for the process and closed on shutdown;
launching per request would make every download feel broken. The letterhead
comes from `assets/quotation/` (`header.png`, `footer.png`, `payment-qr.png`);
if those files are missing the document still renders with a CSS letterhead
instead.

The header band repeats on every page (`position: fixed` in print), while the
footer follows the content so it appears once, under the sign-off.

## GSTIN lookup

`GET /api/gstin/:gstin` — the registered details behind a GST number. Signed in,
but not tied to a module: the customer form and the quotation wizard both use
it, and gating it on one would break it on the other.

### The offline check comes first

`checkGstin()` in `@yuva/shared` validates shape, state code and check digit
with no network and no cost. **A GSTIN that fails it is refused before any
credit is spent** — asking about a number that cannot exist buys nothing that
arithmetic did not already know.

That check is exhaustive against the errors people actually make: **100% of
single-character typos** and **100% of adjacent transpositions**, which is what
Luhn mod 36 guarantees by construction. State codes 01–38, 97 and 99 are
accepted; 25 and 28 are no longer issued but old registrations under them are
genuine, so they are not refused.

### Every answer is cached, permanently

Keyed by GSTIN in `app_settings`. A legal name and a registered address do not
change, and a credit spent on one should never be spent twice. `?refresh=1`
re-asks; the response carries `fromCache` and `checkedAt` so a caller can weigh
how old an "Active" is.

**Status is the only field that goes stale.** It does not matter for a
quotation. It matters for an invoice — billing a cancelled registration costs
the customer their input tax credit — so that re-check belongs to Invoicing.

### Three paths write a quotation line

Creating a quotation, updating one, and copying one into a new version. Every
column a line carries has to be written by all three.

`item-persistence.test.ts` walks the three `quotationItem.create` blocks in the
source and asserts each hand-written column appears in every one. It exists
because the gazette flags were added to a single path: the geometry is spread
into the row wholesale, so the film size and the weight came across on their
own, and the line stored itself as an ordinary flat bag while showing the
gazette figures on screen. Right in the browser, wrong in the database, and not
repriceable afterwards.

A source-level check rather than a round trip, because the failure is one of
omission — a field nobody writes cannot be caught by exercising the fields that
were.

### Swapping providers

Two things know who answers: the `BASE_URL` constant and `toLookup()` in
`gstin.service.ts`. Nothing above them does. Every provider field is optional
going in and null coming out, so a renamed field degrades to a missing one
rather than a crash.

**The mapping is pinned by a recorded response.** `gstin-mapping.test.ts` holds
a real 200 from gstinapi.in verbatim. It exists because the first mapping was
written from a document and was wrong in a way nothing caught: the payload is
nested under `data`, so every field came back null with no error to explain it.

Two things about this provider's shape are worth knowing before swapping:

- `business_constitution`, not `constitution`. Null on the record seen.
- The **composed** `address` is preferred over `address_details`. Reassembling
  from the parts gives something worse — the sample puts the industrial estate
  in `building_name` and the survey number in `floor`, which is not how any
  address there is written. `address_details.city` and `.district` were null on
  a record whose top-level `city` was populated, so the top level wins.

`credits_remaining` is logged on every uncached lookup, at `warn` below fifty.
It is not returned to the browser: the office cannot act on it, and it would be
noise beside a customer's address.

### Configuration

| Variable             | Meaning                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GSTIN_API_KEY`      | Optional. Without it the offline format check still runs — that is the half that catches typos — and only **Verify** reports itself unavailable |
| `GSTIN_API_BASE_URL` | Defaults to `https://gstinapi.in`                                                                                                               |

Rate limited to 120 lookups per hour per IP. That is generous against real use —
once per new customer — and tight against a stuck retry loop draining the
account's balance.

> **Blank means absent.** A `.env` cannot express `undefined`, so `KEY=` arrives
> as an empty string. Every optional credential is now wrapped so that reads as
> unset. Before that, copying `.env.example` to `.env` produced a server that
> refused to boot, naming a key the developer had deliberately left blank.

## The API's own documentation

`/docs` serves a browsable, testable reference; `/docs/openapi.json` serves the
spec behind it. Both are open — reading changes nothing, and every endpoint they
describe answers 401 without a session, so the URL can be shared with a
developer without giving anybody a way in.

**The request and query schemas are generated, not written.** Zod 4 emits JSON
Schema natively, so `openapi.ts` converts the very schemas the routes validate
with — change a schema and the page changes with it. Documentation kept
separately from validation drifts, and the drift is invisible until somebody has
already built against the wrong contract.

What is written by hand is the _surface_: which paths exist and what each is
for. Express does not expose that in a form worth introspecting, and a route's
purpose is not something a type can state. `openapi.test.ts` pins every
documented path, because a path that does not exist is worse than no
documentation — `/api/monitor/logins` sat in there until a live 404 said so.

### Trying it out

Everything but `POST /api/auth/login` needs a session. Call login, copy
`data.accessToken`, press **Authorize**. It survives a reload.

There is no sandbox: the docs point at whichever server served them, so on the
deployed URL **Try it out writes to production**. Reading is free; a POST is
real.

### Sharing it

The deployed page is at `https://<your-api-host>/docs`. A developer who would
rather generate a client than click can take `/docs/openapi.json` straight into
openapi-generator, Postman or Insomnia.
