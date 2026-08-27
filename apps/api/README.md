# API — Yuva Polyprint ERP

Express 5 + Prisma 7 + PostgreSQL 17. Serves the web client and renders
quotation PDFs.

- [Running it](#running-it)
- [Layout](#layout)
- [Request and response shape](#request-and-response-shape)
- [Authentication and access](#authentication-and-access)
- [Endpoints](#endpoints)
- [Calculations](#calculations) ← the part worth reading
- [Data model](#data-model)
- [Sending quotations by email](#sending-quotations-by-email)
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

| Method | Path                      | Notes                                                    |
| ------ | ------------------------- | -------------------------------------------------------- |
| GET    | `/quotations`             | Search by number, customer or job name; filter by status |
| GET    | `/quotations/next-number` | The number the next quotation will get                   |
| GET    | `/quotations/:id`         | Full document with all lines                             |
| GET    | `/quotations/:id/pdf`     | The PDF. `?inline=1` displays, otherwise downloads       |
| POST   | `/quotations`             | Create; prices and costs every line                      |
| PATCH  | `/quotations/:id`         | Update; **re-prices the whole document**                 |
| POST   | `/quotations/:id/send`    | Email it to the customer with the PDF attached           |
| GET    | `/quotations/:id/emails`  | Every recorded send, newest first                        |
| DELETE | `/quotations/:id`         | Delete; lines cascade                                    |

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

### Quotation line

Given: layers (2 or 3), width and height in mm, poly micron, quantity in kg,
rate per kg, repeat width and height, cylinder count, optional transport cost.

**1. Total micron** — PET is 12µ per ply and adhesive adds 2µ:

```
2 layer:  micron = 12 + poly + 2
3 layer:  micron = 12 + 12 + poly + 2
```

**2. Yield factor** — 3-layer film wastes more:

```
2 layer: 1.1     3 layer: 1.2
```

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

**5. Printing total**

```
totalAmount = quantityKg × ratePerKg
```

**6. Cylinder** — the +80 is the mounting allowance:

```
cylinderWidth         = width × repeatWidth + 80
cylinderCircumference = height × repeatHeight
costPerCylinder       = (cylinderWidth × cylinderCircumference ÷ 100) × cylinderRate
totalCylinderCost     = costPerCylinder × cylinderCount + transportCost
```

Worked example, 5 Kg Paneer Bag, 670 × 460 mm, 60µ poly, 2 layer, 250 kg at
₹295, repeat 1 × 1, 4 cylinders:

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
petGsm       = (layers = 3 ? 2 : 1) × 12 × 1.4
polyGsm      = polyMicron × the chosen film's density
inkGsm       = settings.inkGsm
adhesiveGsm  = settings.adhesiveGsm
compositeGsm = petGsm + polyGsm + inkGsm + adhesiveGsm

costPerKg = Σ(componentGsm × componentRate) ÷ compositeGsm
margin %  = (sellingRate − costPerKg) ÷ sellingRate × 100
```

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

| Table              | Holds                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `customers`        | Companies that order. Text fields use `'NA'` where the imported sheet was blank. |
| `jobs`             | Products and their full 55-column specification.                                 |
| `quotations`       | Customer-facing documents. Totals frozen at save.                                |
| `quotation_items`  | One priced line, with its costing.                                               |
| `materials`        | The rate catalogue, with density for films.                                      |
| `material_rates`   | One material's price on one date — one row per active material per day.          |
| `quotation_emails` | One recorded attempt to email a quotation — recipients, subject, who sent it.    |
| `app_settings`     | Editable rates and costing defaults.                                             |

Two deliberate choices:

**`jobs.job_code` is not unique.** Thirteen codes are reused across 36 rows in
the source spreadsheet for genuinely different jobs. A surrogate `id` is the key
until the client confirms the correct codes.

**Nothing cascades except quotation lines.** Deleting a customer sets
`customer_id` to null on their jobs and quotations rather than destroying
production history or a sent quotation.

Money and quantities are `Decimal`, never `Float` — this system computes costs
and variance, and floating point drift in a costing engine is a silent
correctness bug.

---

## Sending quotations by email

`POST /quotations/:id/send` renders the PDF, attaches it, and emails it through
[Resend](https://resend.com).

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
