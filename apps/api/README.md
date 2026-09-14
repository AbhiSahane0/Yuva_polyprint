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
/inventory   authenticate — reading stock is open for the same reason. Every
             write — receive, issue, adjust, transfer — needs
             requireModule('inventory'), applied on those endpoints.
             /inventory/reconcile is requireAdmin on top.
/purchase    authenticate — knowing what is on order is part of knowing what the
             works can commit to. Raising one needs requireModule('purchase');
             recording a delivery needs inventory as well, because it creates
             stock and must not be reachable through a second door.
/cylinders   authenticate — whether a design already has a set is what stops a
             second one being ordered, and the quotation screens ask the same
             question. Registering or moving one needs
             requireModule('cylinders'); DELETING a design needs customers as
             well, because the record it destroys is a job.
/costing     authenticate — the quotation wizard costs every line against the
             machines and wages, so gating the read would break pricing for
             somebody who has quotations but not rates. Changing one needs
             requireModule('rates').
/artwork     authenticate — the floor works to the file a job prints, and gating
             that on the cylinders module hides it from exactly the people who
             need it. Uploading, refiling and removing need
             requireModule('cylinders'), which is where designs are owned.
/users       authenticate + requireAdmin
```

**The sidebar hiding a section is not access control.** It is a courtesy so the
app does not look broken. Anyone can type a URL or call the endpoint with curl,
so the server is what actually says no — and it returns 403 whether or not the
client bothered to hide the link.

### A PATCH sends what it sends

`schema.partial()` is not enough on its own, and getting this wrong turned
every partial update into a full overwrite.

Zod's `.partial()` makes a field optional; it does **not** remove its
`.default()`, and a default fires precisely when a key is absent. So
`PATCH /customers/:id` with `{ district: 'Nashik' }` parsed to that plus
`brandName: 'NA'`, `address: 'NA'`, `city: 'NA'`, `mobile: 'NA'`,
`email: 'NA'` — and the service spread it into `prisma.update`.

It erased four real customer records. Three attempts to fix it in the quotation
wizard failed because the wizard was innocent: it sent exactly the one field
that had changed.

**Seven of the eleven update schemas had it**, and the customer one was not the
worst — a partial quotation update reset a SENT quotation to `DRAFT` and
rewrote its terms; a partial material update un-retired the material.

All of them now use `partialWithoutDefaults`, which unwraps one layer of
`ZodDefault` before making the field optional. Validation of what IS sent is
unchanged. A test sweeps every exported `update*Schema` and asserts an empty
body parses to an empty object — testing the seven that were broken would not
have stopped the eighth.

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
| DELETE | `/materials/:id`         | Remove one nothing has quoted or bought. `?discardStock=true` takes its stock with it                                                           |
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

#### What `DELETE /materials/:id` refuses, and what it does not

Deleting is for a mistake — a name typed wrong, a film added and thought better
of. Two things are never deleted around:

- **a quotation ply**, and
- **a purchase line**.

Both are documents the works sent out, and each has to stay able to say what it
was priced on. The refusal names them: "PET 12µm is on 18 quotation lines. Take
it off the price list instead — deleting it would leave those unable to say what
they were priced on."

A purchase line is `Restrict`, so the database would refuse it anyway, with a
foreign-key error nobody can act on. A quotation ply is `SetNull`, so the
database would **allow** it — the ply snapshots the name, micron, density and
rate, so the document still reads while the link to what priced it disappears
without a word. That one is refused on purpose.

**Stock is not in that class.** A batch is the works' own note of what it holds,
not a promise made to anybody, and a material received by mistake has to be
removable. So stock refuses only until the caller says it has seen how much goes
— `?discardStock=true`, which the Inventory screen sends after showing the
quantity and batch count in the dialog. The batches and their movements are then
deleted in the same transaction as the material, and the rate history cascades.

Without the flag the refusal says where to do it properly: "Green PET 12µm is on
the inventory — 250 KG across 1 stock batch. Delete it from Inventory, where
what goes with it is shown before you confirm."

The route needs the **rates** module, not inventory — deleting a material is a
change to the price list. Somebody who may record a movement should not thereby
be able to remove the material the movement was against.

### Inventory

| Method | Path                           | Notes                                                                  |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| GET    | `/inventory`                   | Every active material with its stock, plus the totals                  |
| GET    | `/inventory/:id`               | One material: batches oldest first, last 200 movements newest first    |
| POST   | `/inventory/receive`           | Records a delivery and opens a batch. The only action that creates one |
| POST   | `/inventory/issue`             | Issue or waste. Refused if the batch holds less than is being taken    |
| POST   | `/inventory/adjust`            | A cycle count. Takes what was counted, not the difference              |
| POST   | `/inventory/transfer`          | Moves a batch. Changes where stock is, never how much                  |
| PATCH  | `/inventory/:id/reorder-level` | Sets or clears the level below which stock reads as low                |
| GET    | `/inventory/reconcile`         | Admin. Proves the cached quantities agree with the ledger              |

Query on `GET /inventory`: `q`, `category`, `lowOnly`.

**Every active material is listed, including ones with no stock.** A material
missing from the answer because it happens to be empty is exactly the one that
needs ordering. Totals are over everything the filters matched rather than over
a page — a stock value that changes when a category filter is clicked is not a
total anybody can use.

`/inventory/reconcile` exists because "the system says 2,450 and the shelf says
2,410" needs an answer that is not "trust it". It recomputes every batch from
its own movements and reports what does not match.

### Purchase & Suppliers

| Method | Path                           | Notes                                                            |
| ------ | ------------------------------ | ---------------------------------------------------------------- |
| GET    | `/purchase/suppliers`          | With what each supplies and last charged, derived from orders    |
| POST   | `/purchase/suppliers`          | Add a supplier                                                   |
| PATCH  | `/purchase/suppliers/:id`      | Edit, or retire — orders already placed still name them          |
| DELETE | `/purchase/suppliers/:id`      | Remove one nobody has ordered from; refused with the count       |
| GET    | `/purchase/orders`             | Open first, with the totals                                      |
| POST   | `/purchase/orders`             | Raise an order. Several lines, each in the unit it is ordered in |
| GET    | `/purchase/orders/next-number` | A peek, not a reservation                                        |
| GET    | `/purchase/orders/:id`         | One order, its lines and its deliveries                          |
| PATCH  | `/purchase/orders/:id`         | Expected date, notes, or status                                  |
| POST   | `/purchase/receipts`           | **Record a delivery.** The join to inventory                     |
| POST   | `/purchase/lines/close`        | Give up on the balance of a line, with a reason                  |

Query on `GET /purchase/orders`: `q` (PO number or supplier), `status`,
`supplierId`, `delayedOnly`.

`POST /purchase/receipts` needs the **inventory** module as well as purchase: it
creates stock, and somebody who may raise orders but not touch the ledger should
not reach it through a second door.

`DELETE /purchase/suppliers/:id` is for a name typed wrong, or a supplier added
and never used. Anyone with an order against them is refused by count —
"Sharma Films is on 3 purchase orders. Retire them instead — an order has to
stay able to say who it was placed with." The database agrees
(`purchase_orders.supplier_id` is `Restrict`), but a foreign-key error is not an
answer, and what that case wants is the retire switch on their card.

`PATCH /purchase/orders/:id` accepts only ORDERED, IN_TRANSIT and CANCELLED, and
refuses even those once deliveries exist — the status follows the receipts by
then, and relabelling would make the order disagree with a ledger it cannot
undo.

### Design & Cylinders

| Method | Path                      | Notes                                                        |
| ------ | ------------------------- | ------------------------------------------------------------ |
| GET    | `/cylinders`              | Designs with a registered set, and the totals                |
| GET    | `/cylinders/unregistered` | Designs the job says need a set but have none — the worklist |
| GET    | `/cylinders/out`          | Every cylinder off the shelf, whatever design it belongs to  |
| GET    | `/cylinders/:id`          | One design in full. **`:id` is the job id**                  |
| POST   | `/cylinders`              | Register a set against a design                              |
| POST   | `/cylinders/events`       | Record what happened to one or more cylinders                |
| PATCH  | `/cylinders/:id`          | Correct a cylinder — not its status, not its number          |
| GET    | `/cylinders/:id/deletion` | What deleting this design would destroy, counted             |
| DELETE | `/cylinders/:id`          | Delete a design, its cylinders and its files                 |

Query on `GET /cylinders`: `q` (design, customer or cylinder number), `status`,
`customerId`, `attentionOnly`.

`:id` is a **job** id on the design endpoints and a **cylinder** id on the PATCH.
They are different things at the same position, which is worth knowing before
wiring a client: a design is a job, and the cylinders hang off it.

`PATCH /cylinders/:id` refuses two fields. **Status** follows the events, and
typing it separately is what lets a cylinder claim to be in store while the
history says it went out. **The number** is painted on the cylinder, and changing
it here would leave the two disagreeing.

Only jobs with cylinders registered appear in `GET /cylinders`. 382 record a
cylinder _count_, and a count is not a set — `/cylinders/unregistered` is where
those live, largest first, because the biggest sets cost most to lose.

Totals are counted over every cylinder rather than over the rows returned, so a
filter cannot move the damaged figure.

#### Deleting a design

`DELETE /cylinders/:id` removes the job, its cylinders, their whole history and
its files. **The customer stays.** So does every quotation the design was priced
on: a quotation snapshots the name, the geometry and every rate it was costed
against, precisely so a sent document keeps saying what it said — only the live
link goes, which `quotation_items.job_id` has always been nullable for.

|                            | Deleting a design               |
| -------------------------- | ------------------------------- |
| Cylinders and their events | destroyed                       |
| Design files               | erased from R2                  |
| The customer               | untouched                       |
| Quotations                 | kept — they hold their own copy |
| Stock movements            | **refuses the deletion**        |

**Material issued against the design refuses it, 409.** A quotation carries its
own copy of everything, so the document survives. A stock movement carries only
the link, so "what were these 200 kg issued for" would have no answer — and a
ledger that cannot answer that is the one thing the inventory module exists to
prevent.

`GET /cylinders/:id/deletion` returns that impact **counted**, and the dialog is
built from it. "8 cylinders, 16 events and 1 file" is a decision somebody can
make; "are you sure?" is not.

Two details in the order of operations:

- **Files are erased before the rows cascade away.** Their rows go with the job,
  so an object not erased by then is one nothing will ever point at again — a
  customer's artwork in a bucket with no record it is there. A failure at that
  step aborts the whole deletion, which is recoverable; the reverse is not.
- **Cylinders are deleted explicitly, not by cascade.** Their foreign key is
  `Restrict` on purpose — a job with cylinders against it must not vanish by
  accident. Stepping around that deliberately, in one place that had to ask
  first, is a different thing from loosening it everywhere.

It needs **both** `requireModule('cylinders')` and `requireModule('customers')`.
The screen belongs to the cylinder register, but the record being destroyed is a
job, which is what `/jobs` is gated on. Somebody trusted with the cylinder
register is not automatically somebody trusted to delete a customer's design,
and one tick box should not answer both questions.

A design is on the register once it has **either** a cylinder set **or** a file.
Artwork comes first in the real order of work — the file is drawn and sent to
the engraver, and the set comes back weeks later — so a design with artwork and
no cylinders is precisely the one the office is waiting on. Jobs with neither
stay in `/cylinders/unregistered`.

### Artwork

| Method | Path                   | Notes                                                |
| ------ | ---------------------- | ---------------------------------------------------- |
| GET    | `/artwork/job/:jobId`  | The files on one design. **`:jobId` is a job id**    |
| GET    | `/artwork/:id/link`    | A signed URL to view or download one file            |
| POST   | `/artwork/uploads`     | Sign an upload, and book the row it will belong to   |
| POST   | `/artwork/:id/confirm` | Confirm the file reached storage                     |
| PATCH  | `/artwork/:id`         | Refile it — its kind and its note                    |
| POST   | `/artwork/:id/restore` | Put a removed file back                              |
| DELETE | `/artwork/:id`         | Take a file off the design screen — the file is kept |
| DELETE | `/artwork/:id/file`    | **Erase the file for good.** The row stays           |

Query on the list: `includeArchived`. Off by default, so the screen shows what
is current and the history is a click away.

**No endpoint here returns bytes.** See below.

### Design files live in Cloudflare R2

**The bytes never pass through this API.** An upload is a presigned URL the
browser PUTs to Cloudflare itself; a download is the same in reverse. A 40 MB
artwork proxied through one Render instance would hold that process for the
length of the upload, and the works' connection is not fast. Signing takes about
a millisecond.

That shapes the flow into three steps:

1. `POST /artwork/uploads` writes a **PENDING** row and signs a URL for its key.
2. The browser PUTs the file straight to R2.
3. `POST /artwork/:id/confirm` asks R2 what actually arrived and, if it did,
   makes the row **ACTIVE** with the size **R2** reports.

The row before the object is the order that matters. Signing a key with no row
would let anyone who could reach step 3 attach an arbitrary key — or another
customer's artwork — to a design; and an upload that fails leaves a row that can
be seen and ages out, rather than an object belonging to nothing.

A file is checked twice on the way in: the browser refuses an oversized or
unaccepted file before sending it, and the server refuses it again. **The
extension decides the type, not the browser** — Chrome sends a `.cdr` as
`application/octet-stream` and an `.ai` as `application/pdf`, because an
Illustrator file _is_ a PDF. SVG is deliberately not accepted: it is a document
that can carry script.

**A revision supersedes; it never overwrites.** The cylinder on the shelf was
engraved from one particular version of one particular file, and a store that
overwrites cannot say which. Nothing is superseded unless the upload names
`replacesId` — a design legitimately carries a front and a back panel.

**The row outlives the bytes.** There are two ways a file leaves the screen and
they are different decisions:

|            | `DELETE /artwork/:id`              | `DELETE /artwork/:id/file`           |
| ---------- | ---------------------------------- | ------------------------------------ |
| Status     | `REMOVED`                          | `DELETED`                            |
| The object | stays in the bucket                | **erased**                           |
| Reversible | yes, `POST .../restore`            | no                                   |
| For        | filing — artwork that is done with | a wrong upload that should not exist |

Either way the **row stays**. "There were three files and now there are two" is
not something anybody can act on: the office asks where the artwork went, and
_"deleted by Sudeep on 6 September"_ is an answer where silence is not. So a
`DELETED` row keeps the filename, the size, who uploaded it, who erased it and
when — and nulls its `storage_key`, so nothing can sign a URL for a key that is
no longer there. Afterwards it cannot be opened, restored or deleted again, and
each refusal names who deleted it.

**The object is erased before the row records it.** The other order has a worse
failure: mark the row first, fail to erase, and the register now says a
customer's artwork was destroyed while it sits in the bucket. This order can
only leave a row whose file is already gone — which is what the row is about to
claim anyway. A failed erase aborts the whole thing rather than being logged
past.

The revision chain survives all of it, because nothing is deleted at the
database level: "v3 replaced v2, which was deleted" stays readable.

Only a PENDING row whose upload never completed is deleted outright, since
nothing arrived to keep and there is nothing to explain later.

Erasing is a **separate path, not a flag** on remove. A query parameter that
turns "hide it" into "erase a customer's artwork" is one typo away from a file
nobody can get back, and it would not show up in a route table at all.

Superseding happens at **confirmation**, not when the URL is signed: replacing
the current file before the new one is actually in the bucket would leave the
design with no artwork and an upload that may never finish.

The bucket stays **private**. Every read is a signed URL that expires in five
minutes, so a link that ends up in a chat message stops working rather than
standing as a permanent public link to a customer's unreleased packaging.
Thumbnails come signed with the list rather than one request per file — signing
costs an HMAC and no network call — which is why the browser refetches the list
inside that window.

One thing measured rather than assumed: a presigned URL signs only `host`
(`X-Amz-SignedHeaders=host`), so the `Content-Type` the browser sends with its
PUT is accepted whatever it is. The header is still sent, so the object is
_stored_ as the right type for anyone reading the bucket — but nothing depends
on it, because every download overrides the served type from the record.

#### Configuration

Four keys, and it is all four or none — three out of four boots happily and then
fails on the first upload with a signing error nobody can trace back to a
missing line in `.env`, so that is refused at boot instead. Without any of them
the app runs normally and only the artwork panel reports itself unavailable.

| Key                    | Where it comes from                                             |
| ---------------------- | --------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare dashboard → R2 → "Account ID"                        |
| `R2_BUCKET`            | The bucket you created                                          |
| `R2_ACCESS_KEY_ID`     | R2 → Manage API Tokens → **Object Read & Write** on that bucket |
| `R2_SECRET_ACCESS_KEY` | Shown once, when the token is created                           |
| `R2_ENDPOINT`          | Optional — only for a jurisdiction-specific (`.eu.`) bucket     |

The bucket also needs a **CORS rule**, or the browser's upload fails at the
preflight with an error nobody can read. In R2 → the bucket → Settings → CORS
Policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://<your app>"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Costing

| Method | Path                           | Notes                                                  |
| ------ | ------------------------------ | ------------------------------------------------------ |
| GET    | `/costing`                     | Machines and wages, in one request                     |
| POST   | `/costing/workbook`            | The costing as a spreadsheet, in the works' own layout |
| POST   | `/costing/machines`            | Add a machine                                          |
| PATCH  | `/costing/machines/:id`        | Correct one                                            |
| POST   | `/costing/machines/:id/retire` | Retire or restore it                                   |
| POST   | `/costing/labour`              | Add a role                                             |
| PATCH  | `/costing/labour/:id`          | Correct one                                            |
| POST   | `/costing/labour/:id/retire`   | Retire or restore it                                   |

Readable by anyone signed in, because the quotation wizard costs every line
against it. Writing needs `requireModule('rates')` — a machine speed or a wage
moves the price of every quotation raised afterwards, which is the same
authority a rate change carries. Retire rather than delete, for the same reason
a retired material stays: quotations were costed against it.

**A name a retired row holds is not free, and adding it back revives that row.**
Retiring keeps the row, so the name stays taken — and the row is off the screen
unless the caller asks for retired ones, so `POST /costing/machines` used to fail
with "there is already a machine with that name" about a machine nobody could
see. It now reactivates that row with whatever figures were sent, which is what
was being asked for and beats a second row: the id survives, so everything
already pointing at it still does. A name held by a row that is still active
conflicts as before. `POST /materials` follows the same rule.

### Building a rate from what it costs to make

`packages/shared/src/lib/rate-costing.ts`. Nothing on the server computes it —
the wizard, the API and the PDF all call the same function, so they cannot
disagree about a price.

It is the works' own method, from the spreadsheets they cost by. Kilograms
become running metres, metres become machine minutes, minutes become rupees:

```
order 500 kg + 8% wastage      →  540 kg consumed
each ply's share of the GSM    →  its kilograms
kg ÷ GSM ÷ web width           →  running metres
metres ÷ machine speed         →  minutes, + setup
minutes × (HP × rate)          →  electricity
minutes × (salary ÷ days ÷ hours ÷ 60)  →  wages
```

Ink and adhesive are the parts worth understanding, because they are where a
naive costing goes wrong by a factor:

- **Ink is bought wet.** A colour lays 0.15 g/m² of pigment from a tin that is
  23% solids, so `100 ÷ solids` kilograms are purchased for every one that
  stays on the film, and solvent is added on top at the press ratio. Costing a
  laydown against the purchase rate understates ink three to five times over.
- **Each colour is its own material.** A white base coat lays 1.8 g/m² at 40%
  solids; a process colour lays 0.13 at 19.5%. One "ink GSM" cannot price a job
  that uses both. `materials.ink_kind` separates the four every press carries
  from a customer's own — stored rather than inferred from the name, because
  "Ink — Cyan" and "Cyan (Sun Chemical)" are the same colour and a rule reading
  names would disagree. Special colours are created from the quotation screen
  as they come up, with their rate, and are ordinary ink rows afterwards.
- **Adhesive is a diluted batch.** `100:146:15` is adhesive : ethyl acetate :
  hardener, 35% solid, and each component is priced separately. It is spread
  over the **substrate** GSM, not the whole laminate — it does not stick to
  itself or to the ink.

**Adhesive is worked out, not stated.** The sheet takes a heavier coat under a
thick ply — `IF(ply > 40µ, 3, 2)` — and one coat per lamination, so a 12µ PET
over a 110µ poly is 3 GSM across one join while a PET over a MET PET is 2. The
three numbers are settings. The sheet writes the second term as "2 if there is
a Met PET ply, else 1", which is a shortcut for its own three-ply structure;
laminations are plies minus one, which agrees with it everywhere the sheet is
used and is right on the structures it never had to handle.

**Stations are not colours.** The surcharge for the sixth and seventh printing
station is charged on the stations a job occupies — one cylinder each — not on
how many inks are priced. The sheet counts seven stations on a job it prices
four inks for.

**A press draws what the colours on it draw.** Its 30 HP main drive runs alone
until the third colour, and a 12 HP station motor comes on at the third, the
fourth and the sixth — so a two-colour job draws 30 HP where a seven-colour job
draws 66. Charging the full connected load on every job overstated electricity
on everything short of a full press, by Rs 1.53 a kilogram on the client's own
two-colour Govt Sugar quotation.

| Colours | Motors | Press draws |
| ------- | ------ | ----------- |
| 1–2     | none   | 30 HP       |
| 3       | one    | 42 HP       |
| 4–5     | two    | 54 HP       |
| 6–8     | three  | 66 HP       |

`costing_machines.station_horsepower` and `station_colour_steps` hold it, and a
machine with no station load — a laminator, a slitter — keeps one figure whatever
it prints. The steps are `3,4,6` because that is what the sheet's formulas
compute and what the operator confirms; the layout of those same rows implies
`3,5,7`, and two of its four references are off by one.

**Four figures belong to the quotation, not the works.** `margin_percent`,
`transport_per_kg`, `pouch_making_per_kg` and `wastage_percent` are columns on
`quotations`, null for "use the Costing screen". The client varies them job to
job: across seven of their own quotations, margins of 5%, 9% and 10%, transport
at Rs 5 and Rs 10, and pouch making at 0, 11.04 and 15 — **five of those seven
written on the same day**, so none of it is a price that moved over time.

`pouch_making_per_kg` stays in **rupees per kilogram** although the works' own
figure is now per pouch: it replaces the whole charge rather than any part of
it, which is what the office means by overriding it, and it is the unit every
quotation written before the change already carries.

#### Pouch making, and the two costing documents

**Making a pouch is charged per POUCH**, from the works' pouch workbook —
`costing_for_Standup.xlsx`, four sheets, nine costed jobs, all nine reproduced
before any of this was written. A rate per kilogram cannot describe the work:
across those nine the same charge reads between Rs 11 and Rs 64 a kilogram,
purely because a small pouch packs 130 to a kilo and a big one 14.

```
standup        = pouchMakingPerPouch                          0.25
standup zipper = pouchMakingPerPouch + width_m × zipperRate    0.25 + 0.468 …
zipper         = the same
D punch        = dPunchPerPouch                                0.60 flat
D punch, wide  = dPunchLargePerPouch, over 450 mm              0.80 flat
roll           = 0

pouchMakingPerKg = pouch expense × pieces per kg
                   — or the quotation's own Rs/kg, where it has one
```

The **finished** pouch width is what the zipper crosses, not the flat film
width: a bottom gusset lengthens the sheet without widening the mouth.

**Two figures depend on the style, not on "is it a pouch".** The works costs
from two documents and they split by style:

|                  | covers                                    | wastage | ink GSM |
| ---------------- | ----------------------------------------- | ------: | ------: |
| Estimation sheet | centre seal, three side seal, spout, roll |      8% |     1.8 |
| Pouch workbook   | standup, standup zipper, zipper, D punch  |      7% |     1.2 |

That distinction is load-bearing. Every one of the seven 2022 quotations
verified to the paisa is a **centre seal** pouch, so a rule reading "any pouch"
would have moved all seven onto figures that never priced them.
`isWorkbookPouch` in `@yuva/shared` holds the list, and both rules read it.

**Everything is priced at the quotation's own date.** `loadCostingContext` reads
the material rates and the settings in force on it, so an older job entered now
is costed as it would have been then rather than at today's film prices.

**Why the margin reads the same at every quantity.** Because the sheet's margin
is nine per cent of the MATERIAL cost, and material scales exactly with the
order — so material per kilogram, and the margin it produces, are identical at
any volume. Only the setup and the sundries shrink, and on a film-heavy job
they are a rounding error beside it: a three-fold order moved one real
quotation by 38 paise a kilogram. It is the sheet's formula, not a fault. The
tiers do separate under `marginBasis: TOTAL_COST`, where the margin follows a
cost that does fall.

**It downloads as their own spreadsheet.** `POST /costing/workbook` returns an
`.xlsx` laid out like the Estimation sheet — their headings, their row order,
their spelling — with **live formulas**, so a works that wants to try a
different wage or film rate does it in the copy and watches the total move.
That is what they do today, and a download full of pasted numbers would not let
them. Verified by evaluating the generated file: the chain recalculates to
Rs 263.40 a kilogram and Rs 13.83 a pouch.

The whole calculation travels in the body rather than a quotation id, because
the panel is a calculator: it prices quantities the document may never carry,
against colours nobody has committed to. What is on screen is what downloads.

**Gross and net.** The works' sheet has one margin concept — material cost
times nine per cent — and no gross/net split at all. Its own labelled totals
map onto both, so that is where they come from: **B** is the materials, and
**A + C + D** plus the per-kilogram additions are everything else.

|       | Subtracts                            | Reads                 |
| ----- | ------------------------------------ | --------------------- |
| Gross | Film, ink and solvent, adhesive      | What the trade quotes |
| Net   | All of it, including the press setup | What the job earns    |

Both are reported against the rate somebody **typed**, not the one that was
suggested — a margin on a price nobody is offering is worse than no margin.

Gross alone was actively misleading, and worst where it mattered. Materials
cost the same per kilogram at any volume, so a short run at a higher rate shows
the fattest margin on the page while earning least, because the same hour of
setup is spread over a fraction of the film. On one real quotation: 1,000
pouches read **71.9% gross** against 8,999 pouches' 37.3% — and net put both at
**8%**.

**Two sheets, reconciled.** The client's own workbook answered the same job
twice, Rs 263.40 and Rs 228.22 a kilogram. The **Estimation** frame is the one
followed — it is the headline figure, and it divides by the quantity
**ordered**, because the wastage is already inside the cost and dividing by the
consumed weight would charge for it and then hand it back. The Costing sheet's
per-colour ink and batch adhesive are computed alongside and shown in the
breakdown, and `inkCostModel` / `adhesiveCostModel` switch to them.

`inkCostModel` decides more than a number: under `FLAT_GSM` the colours chosen
are not read at all — the same 500 kg job costs Rs 233.76/kg on CMYK, on CMYK +
Gold and on CMYK + White alike. Under `PER_COLOUR` those three come to
Rs 236.89, 241.49 and 246.59. The quotation screen used to let the office pick
the colours; it no longer does, since under the works' own setting the picker
moved nothing. They are taken from the catalogue in order, up to the job's
colour count — which is also what the station surcharge is charged on, from the
sixth station.

**The blended rate and the purchase rate are different numbers for the same
drum.** Estimation costs the whole ink laydown at Rs 800/kg and the adhesive at
Rs 400/kg — figures that already carry the solvent, the dilution and the losses.
Costing buys the same black at Rs 202 and the same adhesive at Rs 165, and
prices the thinner and hardener beside them. Both are right for their own
method, so each names its own material: `defaultFlatInkMaterial` and
`defaultFlatAdhesiveMaterial` for the flat method, `defaultAdhesiveMaterial`
and the solvent settings for the batch. Pointing the flat method at a purchase
rate, which is what it did, understated ink by a quarter — Rs 10.14 a kilogram
off the quoted rate, and nothing said so, because Rs 202 is a perfectly
plausible number for ink.

`npm run seed:excel-rates -w @yuva/api` writes the workbook's own figures into
the catalogue. Unlike `seed:costing` it DOES change rates already set — that is
its purpose — but rates are append-only, so the previous figure stays on the
Rates screen.

It also **retires the two lamination wages**. The sheet has no line for one,
though the laminator runs 86 minutes on the job it costs — somebody stands at
that machine, and the sheet does not pay them. Seeded at Rs 18,000 and Rs 8,000
they put the rate 48 paise a kilogram over the sheet; on 10 September 2026 the
works chose the sheet. Retired rather than deleted, so the Costing screen shows
them greyed with a Restore beside them and the decision stays visible.

With those off, the workbook reconciles **exactly** — Rs 263.40 a kilogram and
Rs 13.83 a pouch, on local and on Neon alike.

Master data lives in `costing_machines`, `costing_labour`, and the `costing_*`
keys in settings. `npm run seed:costing -w @yuva/api` loads the works' own 2022
figures — **check them before quoting on them**.

### Settings

| Method | Path                          | Notes                                 |
| ------ | ----------------------------- | ------------------------------------- |
| GET    | `/settings`                   | All settings, with defaults filled in |
| GET    | `/settings?onDate=2022-03-23` | What the works held **then**          |
| PATCH  | `/settings`                   | Update any subset                     |

Stored as key/value rows so a new setting never needs a migration. Anything
missing falls back to a documented default, so a fresh database works with no
seeding step.

#### A setting has a history

`app_setting_history` records what a figure was on a given day, the way
`material_rates` always has for a price. The client's own sheets carry a bank
EMI of Rs 4,166.66 in March and April 2022 and Rs 10,000 in July — one figure,
changed in between, not something that varies job to job. Without a history a
quotation dated 2022 was repriced at today's overheads and could never reproduce
itself.

**Today reads the current row; only a past date consults the history.** The
current value is not derived from the history, so the two cannot drift — and
`app_settings` is also where the GSTIN lookup cache lives, which is why the
history sits beside it rather than replacing it. A key with no entry simply never
changed.

`PATCH /settings` dates the change **today**, which is what saving the Costing
screen means: this is what the works pays from now on. The screen does not offer
to rewrite what a figure was months ago — that is the basis of quotations already
sent.

| Setting                       | Default                           | Meaning                                                                                    |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `quotationStartNumber`        | 119                               | Continues the client's existing paper series                                               |
| `cylinderRate`                | 2.5                               | Multiplier in the cylinder cost formula                                                    |
| `gstPercent`                  | 18                                | Applied to material and cylinder totals                                                    |
| `materialAdvancePercent`      | 70                                | Advance taken on the material total                                                        |
| `cylinderAdvancePercent`      | 100                               | Advance taken on the cylinder total                                                        |
| `inkGsm`                      | 1.8                               | Ink laid down per m², for weighing and costing — Estimation sheet                          |
| `pouchInkGsm`                 | 1.2                               | And on a pouch-workbook style. Decides the pouch's WEIGHT, so it moves the count per kg    |
| `pouchMakingPerPouch`         | 0.25                              | Forming, sealing and cutting one pouch — **per pouch, not per kg**                         |
| `dPunchPerPouch`              | 0.6                               | What a D punch costs to make instead of the making rate                                    |
| `dPunchLargePerPouch`         | 0.8                               | And a wide one, the punch being made across the top                                        |
| `dPunchLargeAboveMm`          | 450                               | The pouch width at which the D punch rate steps                                            |
| `zipperRatePerMetre`          | 3.6                               | The zipper, charged across the pouch's mouth                                               |
| `defaultWastagePercent`       | 8                                 | Film spoiled setting up and running — Estimation sheet                                     |
| `pouchWastagePercent`         | 7                                 | And on a pouch-workbook style                                                              |
| `adhesiveGsm`                 | 2.5                               | Adhesive laid down per m², for costing                                                     |
| `defaultPetMaterial`          | `PET 12µm`                        | Which material's rate prices the PET layer                                                 |
| `defaultInkMaterial`          | `Ink — Black`                     | Which rate prices the ink                                                                  |
| `defaultAdhesiveMaterial`     | `Adhesive — PU`                   | Which rate prices the adhesive, per batch                                                  |
| `defaultFlatInkMaterial`      | `Ink — Blended (Estimation)`      | What the FLAT method prices the whole ink laydown at — a blended rate, Rs 800 on the sheet |
| `defaultFlatAdhesiveMaterial` | `Adhesive — Blended (Estimation)` | The same for adhesive — Rs 400, the made-up batch rather than the drum                     |
| `cylinderMountingMm`          | 80                                | Cylinder face beyond the web, which the engraver charges for                               |

The two `Flat*` settings are deliberately not the purchase rates above them. See
**Two sheets, reconciled** below: the same drum has one price on the invoice and
another, blended, in the Estimation sheet, and mixing them understated ink by a
quarter.

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
| **Structure GSM**  | Every ply at its own density, plus the ink and adhesive coats. What a pouch actually weighs, and what the client's own sheet totals to reach its 125.                                                 |
| **Yield factor**   | A stand-in for density, used only when a ply's film has no density recorded. 1.1 for two plies, 1.2 for three or more.                                                                                |
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

The layer **count** still moves the stated thickness:

```
micron = every ply + 2µ adhesive          (flat, not per bond)
```

The adhesive is a single 2µ whatever the ply count. A three-ply laminate is
glued twice and ought to carry twice as much, but the client's spreadsheet adds
one either way and every imported job matches it — changing it would move
pouches-per-kg on every 3-layer line ever quoted.

**A pouch's weight no longer comes from that thickness.** It comes from
`structureGsm` — each ply at its own density, plus the ink and adhesive coats —
which is the column the client's own workbook totals to reach its 125 GSM, and
there is a table of densities in that workbook for the purpose. The **yield
factor** below (2 plies 1.1, 3 or more 1.2) survives only as the fallback for a
ply whose film has no density on record. It stood in for the density on every
job until 10 September 2026: PET over white-opaque poly averages 0.985, so a
pouch came out 9.1% heavy — 500 kg quoted as 8,730 pouches where the sheet says
9,524 — and PET over MET PET averages 1.400 and went the other way by 27%.

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

**2. Yield factor** — the fallback when a ply has no density recorded:

```
2 plies: 1.1     3 or more: 1.2
```

Where the films do carry a density — which is now editable on the Rates screen —
the weight comes from `structureGsm` instead and this is not consulted.

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

**The basis is stored on the line** as `pricingBasis`, and the API still honours
both. A line that does not state one takes the convention for its style —
standup and standup-zipper by the piece, everything else by weight — which is
`pricingBasisFor()` in `@yuva/shared`, the schema's default rather than its rule.

**The quotation form now writes `PER_KG` on every line it saves.** It used to
offer a Kilogram / Pouches switch on the Quantities panel, and the switch
decided which pair of boxes existed — so whichever unit was picked, the other
was off screen. The panel now shows both from one typed pair, and the typed pair
is the kilograms, because that is what the film is bought in and what every line
of the costing is worked out from. The pouch figures are derived.

`PER_POUCH` is therefore a legacy basis on the write path and a live one on the
read path: quotations written before the change still carry it, still reprice
correctly, and still print the per-piece rate they were quoted at.

> Before either, the basis was derived from the style and never chosen, with the
> server re-deriving it rather than trusting the client. That refused a real
> order — a customer who buys standup pouches by the kilogram.

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

On the printed quotation a `PER_POUCH` line shows its pouch count under Order
Qty and reads `4.20 /pc` in the rate cell. A `PER_KG` line — which is everything
the form writes now — shows kilograms and the per-kilogram rate, **with the rate
each underneath it** in smaller type, from `costPerPouch`. That is the same
price read the other way round rather than a second charge, and printing it
saves the customer doing the sum against the pouches-per-kilogram column and
getting a different answer. A roll gets no such line: there is nothing on a reel
to count, and a per-piece rate on one would be an invented unit.

The Order Qty **total** is only summed when every line shares a basis — adding
kilograms to pouches would print a number the customer could check and find
wrong, so a mixed document shows a dash there. The money totals are unaffected;
those are always rupees.

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
structure GSM     = 12×1.4 + 60×0.94 + 1.8 ink + 3 adhesive     = 78.0
pouches/kg        = 1000 ÷ (670 × 460 × 78.0 ÷ 1,000,000)       = 41.60
  (a film with no density falls back to 74µ × 1.1)              = 39.86
totalPouches      = 41.60 × 250                                 = 10,400
totalAmount       = 250 × 295                                   = ₹73,750
cylinderWidth     = 670 × 1 + 80 mounting                       = 750
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
inkGsm       = a pouch-workbook style ? pouchInkGsm : inkGsm      1.2 or 1.8
adhesiveGsm  = settings.adhesiveGsm
compositeGsm = Σ plyGsm + inkGsm + adhesiveGsm

costPerKg = Σ(componentGsm × componentRate) ÷ compositeGsm
margin %  = (sellingRate − costPerKg) ÷ sellingRate × 100
```

**The ink figure is not only a cost.** It is what the laminate is weighed with,
so it decides what one pouch weighs and therefore how many come out of a
kilogram — the divisor on every per-pouch price. The works has two, from its two
costing documents, and `inkGsmFor` in `@yuva/shared` picks between them.

A ply may carry a **rate the office agreed for this job** instead, held in
`rate_override`. It never reaches the rates master: a figure keyed while quoting
is a decision about one document, and letting it edit the price list would make
every quotation a chance to change what every other quotation costs.

Two different reasons to type one, and for a long time only the first was
handled:

- **A gauge the rates master does not stock.** `PET 12µm` prices a 12µ PET;
  quote 20µ when 12 and 19 are on the list and neither rate applies, so the line
  asks and refuses to cost itself until it is answered.
- **A price agreed for this job.** The works' own quotations carry PET at 185,
  175 and 190 — every one at 12µ, every one written on 23 March 2022.

The override used to be **deduced** rather than stored: the ply keeps the film's
name, and a name stating a gauge different from the one quoted was taken to be
the override. That caught the first reason and missed the second completely — a
rate agreed at the film's own gauge was saved and then invisible, so reopening
the quotation and saving replaced what had been charged with the catalogue
price. Silently, on a document that had already gone out.

It is a column now. Plies written before it read through `overriddenRate` as
they always did, so nothing already saved moves.

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

## Stock is a ledger

Every change to a quantity is a row in `stock_movements`, and what is on hand is
the sum of them. `stock_batches.quantity` is a **cache** of that sum, written
inside the same transaction as the movement that changed it, so the two cannot
drift.

Three rules hold it together, and all three are enforced rather than documented:

- **One write path.** `record()` is the only function that touches a quantity.
  It updates the batch and creates the movement together, so there is exactly
  one place a balance is computed and exactly one place that could get it wrong.
  A source-level test asserts there is exactly one `increment` in the file.
- **Nothing rewrites history.** No update, no delete, no upsert on a movement —
  the balance stored on every later row would become a lie. A mistake is
  corrected by an `ADJUSTMENT` that leaves both the error and the correction on
  the record. The same test asserts the absence of those calls, because a delete
  that is never called cannot be caught by calling the code.
- **The sign comes from the kind.** `signedQuantity` decides direction from
  `RECEIPT` / `ISSUE` / `WASTE`, so a caller passing a negative receipt cannot
  add stock that never arrived. Only `ADJUSTMENT` carries its own sign, derived
  on the server from the counted figure against the books.

Batches are locked for the length of the transaction — Prisma has no
`SELECT … FOR UPDATE`, so a no-op write to the row takes the lock — which is
what stops two people issuing from the same batch and both reading the quantity
before either has written.

`GET /api/inventory/reconcile` recomputes every batch from its own movements and
reports what does not match. It exists because "the system says 2,450 and the
shelf says 2,410" needs an answer that is not "trust it": this says whether the
discrepancy is in the books or on the floor.

### Receiving converts, and may create the material

A delivery arrives in whatever unit the supplier invoices in. Film is bought by
the tonne and stocked by the kilogram, so `receiveStock` converts both figures
before anything is written, and everything downstream measures in the stocked
unit without knowing a conversion happened:

```
2 TON               -> initial_quantity 2000       (convertQuantity)
Rs. 205,000 / TON   -> rate_per_unit    205        (convertRate — the inverse)
purchase_quantity 2, purchase_unit 'TON'           (only when they differ)
```

The rate moves the **opposite way** to the quantity. Getting that backwards
would value the stock at Rs. 205,000 a kilogram — out by a factor of a million,
and exactly the sort of figure that gets believed because it is too large to be
a typo. A test asserts the invariant directly: whichever unit it was entered in,
the delivery is worth the same money.

**Only conversions within one family are offered** — g/kg/ton, ml/l/kl. Litres
to kilograms is a property of the substance rather than arithmetic, and none of
the four inks has a density recorded, so the server refuses with the material's
own unit named rather than guessing at one.

> Ink is priced at Rs. 640 and costed as `GSM × rate`, which only works if that
> figure is per kilogram. **Whether it is has not been confirmed.** Until it is,
> ink is received in the unit it is priced in. If it turns out to be per litre,
> quotations are costing ink wrongly today, independently of any of this.

A receipt may also carry `newMaterial` instead of `materialId`, and creates the
material in the same transaction. A film the works has not bought before is an
ordinary event; the alternative is the office unable to book in a delivery until
somebody with the rates module adds it, which leaves the stock wrong until they
do. It is created **with no rate and no density** — both belong on the Rates
screen, where there is room to get them right. What one supplier charged on one
day is not the works' rate for the material.

Creating it inside the transaction matters: a material that exists with no stock
against it, because the receipt then failed, is a row somebody has to notice and
tidy up. A name that already exists is reused rather than refused — two people
booking in the same new film on one morning should not produce an error neither
can explain — and a retired one is brought back, because receiving it is what
that means.

## Buying joins holding in one place

`receivePurchaseLine` does not write stock. It calls `receiveStock` — the same
function a manual receipt uses — and hands it the open transaction:

```
accepted 1.8 TON  ->  receiveStock(..., tx)  ->  1,800 KG batch, ref PO-4471
rejected 0.2 TON  ->  recorded on the receipt, never stocked
```

Three consequences, and each is the reason for the shape:

- **One way stock is created.** Units convert once, the ledger is written once,
  and there is one place a balance could be wrong. A second implementation in
  the purchase module would have its own conversion and drift within a month. A
  source-level test asserts this module never touches `stockBatch` or
  `stockMovement` directly.
- **The batch and the receipt commit together.** Prisma has no nested
  transactions, so `receiveStock` takes an optional client and joins the
  caller's rather than opening a second that would deadlock. A receipt naming a
  batch that was never created is worse than no receipt.
- **Faulty goods never reach the ledger.** They are recorded against the order,
  with a reason, because that is what gets taken up with the supplier — but
  counting them as stock would overstate what the works can print with.

An order's progress is derived by `restatus` from its own receipts, never ticked
by hand: an order somebody forgot to mark as received is exactly the order they
are chasing. Only ORDERED, IN_TRANSIT and CANCELLED can be chosen, and even
those are refused once deliveries exist — stock is already there, and
relabelling would not undo it.

> One thing worth knowing if you extend this: **a deep `include` inside a
> transaction is a trap.** Prisma issues a multi-level include as several
> queries and may run them concurrently, which on a transaction's single
> connection is a use-after-busy that `pg` warns about. `createPurchaseOrder`
> creates inside the transaction and reads back outside it for exactly this
> reason.

## Data model

Full diagram and column reference: [`docs/database-schema.md`](../../docs/database-schema.md).
Regenerate after any migration with `npm run schema:docs -w @yuva/api`.

| Table                       | Holds                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customers`                 | Companies that order. Text fields use `'NA'` where the imported sheet was blank.                                                                             |
| `jobs`                      | Products and their full 55-column specification.                                                                                                             |
| `quotations`                | Customer-facing documents. Totals frozen at save; carries its own date, margin, transport, pouch making and wastage; `lost_reason` says why a loss was lost. |
| `quotation_items`           | One priced line: its design, its gazette, its geometry and its cylinders.                                                                                    |
| `quotation_item_layers`     | One ply of a line's laminate — material, thickness, density and rate, all snapshotted. `rate_override` is the price agreed for this job, when one was.       |
| `quotation_item_quantities` | One line's figures at one quoted quantity.                                                                                                                   |
| `quotation_tiers`           | One quoted quantity and the document totals at it.                                                                                                           |
| `materials`                 | The rate catalogue, with density for films.                                                                                                                  |
| `material_rates`            | One material's price on one date — one row per active material per day.                                                                                      |
| `app_setting_history`       | One setting's value from one date — what the works held then, the way `material_rates` answers it for a price.                                               |
| `stock_batches`             | One delivery of one material, and what is left of it. Unique batch code per material. Keeps the delivery note's own figure when it arrived in another unit.  |
| `suppliers`                 | Who the works buys from. What they supply is derived from their orders, never stored.                                                                        |
| `purchase_orders`           | One order to one supplier. Progress follows its receipts; delay is computed, not stored.                                                                     |
| `purchase_order_lines`      | One material on an order, in the unit it was ordered in.                                                                                                     |
| `purchase_receipts`         | One delivery against a line. Accepted stock names the batch it became; rejected stock names nothing.                                                         |
| `stock_movements`           | The stock ledger — one immutable row per change, with the balance it left behind.                                                                            |
| `job_artwork`               | A design file, held in R2 with only its description here. A revision supersedes rather than overwrites; erasing the file keeps the row that describes it.    |
| `costing_machines`          | A machine and what a minute of it costs — load, tariff, speed, setup. Retired, never deleted: quotations were costed against it.                             |
| `costing_labour`            | A wage, and which machine's minutes it is paid for. Monthly; the working month in settings turns it into a rate per minute.                                  |
| `quotation_emails`          | One recorded attempt to email a quotation — recipients, subject, who sent it.                                                                                |
| `app_settings`              | Editable rates and costing defaults.                                                                                                                         |
| `users`                     | Accounts, their password hash and which modules each may reach.                                                                                              |
| `sessions`                  | Live sign-ins. Deleted on expiry, so this table is always "right now".                                                                                       |
| `login_events`              | Every successful sign-in, kept permanently. Survives the account being deleted.                                                                              |

Two deliberate choices:

**`jobs.job_code` is not unique.** Thirteen codes are reused across 36 rows in
the source spreadsheet for genuinely different jobs. A surrogate `id` is the key
until the client confirms the correct codes.

**Nothing cascades except quotation lines and artwork.** Deleting a customer sets
`customer_id` to null on their jobs and quotations rather than destroying
production history or a sent quotation. A line's plies and quantities do cascade
with the line, and a quantity also cascades with its tier — they describe it and
have no meaning apart from it. A job's artwork cascades with the job for the
same reason: a design file with no design is a file nobody can identify.

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

| Command                              | Does                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`                        | Watch mode on port 4000                                                        |
| `npm run build` / `start`            | Compile to `dist/`, then run it                                                |
| `npm test`                           | Vitest, including the shell smoke tests                                        |
| `npm run db:migrate`                 | Create and apply a migration                                                   |
| `npm run db:studio`                  | Prisma Studio                                                                  |
| `npm run seed:materials`             | Seed the 16 materials and opening rates. Idempotent.                           |
| `npm run seed:costing`               | Machines, wages and ink figures. Never overwrites.                             |
| `npm run seed:excel-rates`           | The workbook's own rates. DOES overwrite — see above.                          |
| `npm run seed:old-quotations`        | Rebuilds seven of the works' 2022 quotations and checks each against its sheet |
| `npm run import:legacy -- --dry-run` | Parse the legacy sheet, write nothing                                          |
| `npm run import:legacy [-- --fresh]` | Import it; `--fresh` replaces existing rows                                    |
| `npm run schema:docs`                | Regenerate the database documentation                                          |

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
