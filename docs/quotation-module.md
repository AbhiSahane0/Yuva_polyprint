# The Quotation module, explained

_The companion to [`job-sheet-module.md`](./job-sheet-module.md). Written to be
read start to finish, in plain words. Every formula here has a precise version
in [`formulas.md`](./formulas.md) with the workbook cell it answers to — this
document explains **what each thing means and why**, that one is the reference._

---

## 1. The one-sentence version

**A quotation works out what to charge for a job that has not been made yet**,
starting from nothing but the finished size, the layers of film, the colours and
how many kilograms the customer wants.

It ends in one number: **rupees per kilogram** (and, on a pouch job, rupees per
pouch). Everything below is how it gets there.

---

## 2. Where it sits

|                | **Quotation**              | **Job sheet**              |
| -------------- | -------------------------- | -------------------------- |
| **When**       | Before the job             | After the job              |
| **Question**   | What should we charge?     | What did it actually cost? |
| **Built from** | A design and an order size | Drums, scales, the crew    |
| **Answer**     | A forecast                 | A record                   |

The works has always done both on paper. What the system adds is that the
forecast and the record are now **built from the same figures**, so they can be
compared — and they are. See §17.

---

## 3. The screen — four steps, and what each input does

### Step 1 — Customer

| Input           | What it does                                                                    |
| --------------- | ------------------------------------------------------------------------------- |
| Company         | Picks an existing customer, or starts a new one                                 |
| Brand           | Printed on the document                                                         |
| **Referred by** | **Who sent this enquiry the works' way. Recorded and nothing else — see below** |
| **Date**        | **Decides which rates and settings price the job**                              |

> **The date is not decoration.** A quotation is costed on the rates and
> overheads **in force on its own date**, not on today's. Open a quotation from
> April and it re-prices at April's PET rate and April's blended ink. This is
> what lets an old document still reconcile with the paper it was copied from.

> **"Referred by" is internal.** Business arrives through people and the works
> wants that on the record — but the customer reading the quotation has no
> business seeing it, so it is **not printed on the document and not emailed**.
> The screen says so under the box rather than leaving somebody to find out by
> sending one.
>
> It belongs to the **quotation**, not to the customer, because that is the
> finer grain: two enquiries from one company can come through different people,
> and a per-customer view can be derived from these later but not the reverse. A
> revision carries it across, since a revision is the same enquiry repriced.
>
> It is free text and deliberately has no more machinery than that — no
> suggestions, no search, no totals. What it is eventually **for** is the works'
> decision to make once they have a year of it.

### Step 2 — Details

Address, GST number and contact. These print on the document; none of them
touches the price. The **GST number** can be verified against the registry,
which fills in the address.

### Step 3 — Jobs

This is where the price comes from. One quotation can carry several jobs; each
is priced on its own and they are totalled at the end.

| Input                                                   | What it does to the price                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Job name**                                            | Nothing — it identifies the job                                                                                                                           |
| **Saved job**                                           | A repeat of an existing design: **no cylinder charge**, because the cylinders are already in the works                                                    |
| **Type** — Pouch or Roll                                | A roll is not made into anything, so it pays no making charge                                                                                             |
| **Pouch type** — standup, zipper, D punch, centre seal… | Decides the making charge, **and** which of the works' two costing documents the job belongs to (see §5)                                                  |
| **Width / Height** (mm)                                 | The finished pouch. Decides the film each pouch is cut from, so it decides **the weight of a pouch**, so it decides **how many pouches a kilogram makes** |
| **Gazette** + three gusset depths                       | A standing pouch needs more film for the same face                                                                                                        |
| **Layers** — 2 or 3                                     | How many plies, and so how many lamination passes                                                                                                         |
| **Film** per ply                                        | The material, its **rate** and its **density**                                                                                                            |
| **Micron** per ply                                      | Thickness. With density it gives GSM — the weight of a square metre                                                                                       |
| **Rate for this job** per ply                           | Overrides the catalogue rate for this quotation only                                                                                                      |
| **Colours**                                             | Which inks. Decides the ink cost, and **how** the ink is costed                                                                                           |
| **Cylinder count**                                      | Cylinders to engrave, and **stations** on the press — which decides press horsepower and any surcharge                                                    |
| **Ups across / Repeats around**                         | How the design lands on a cylinder — decides cylinder size and so cylinder cost                                                                           |
| **Transport** (per line)                                | A flat sum added to the cylinder charge                                                                                                                   |
| **Quantities** — 1 to 3                                 | The order sizes being quoted. Each is priced separately                                                                                                   |

### Step 4 — Review

The document as the customer will see it, with the subtotals, GST and the
advance. Nothing is calculated here that was not calculated already.

---

## 4. From a size to a weight

Everything downstream needs one thing first: **what does one pouch weigh?**

### 4.1 A ply's weight

```
GSM = micron × density
```

A 12 micron PET at density 1.4 is **16.8 g/m²**. That single conversion is what
the whole system turns on — it is how a thickness becomes a weight, and money is
per kilogram.

> This is why **density on the film is not optional**. A film with no density
> cannot be turned into a weight at all, and the line says so rather than
> guessing.

### 4.2 The structure

```
structure GSM = every ply's GSM + the ink + the adhesive
```

The ink and adhesive are coatings and they weigh something too.

- **Ink GSM** is **1.8** on the Estimation sheet, **1.2** in the pouch workbook.
- **Adhesive** is **3 g/m²** above 40 micron and **2** below, **per bond**.

### 4.3 One pouch

```
flat film for one pouch = (width + gussets) × height × 2 faces  → m²
weight of one pouch     = that area × structure GSM
pouches per kilogram    = 1000 ÷ weight in grams
```

> **This used to be a fudge factor and now it is arithmetic.** Until September
> 2026 a "yield factor" of 1.1 or 1.2 stood in for the density. PET over
> white-opaque poly averages 0.985, so a pouch came out **9.1% heavy** — 500 kg
> quoted as 8,730 pouches where the sheet says 9,524. PET over MET PET averages
> 1.400 and went the other way by **27%**. The factor now survives only as the
> fallback for a film with no density on record.

---

## 5. How much film is actually bought

You cannot buy exactly what you sell. Some is spoiled setting up and running.

```
wastage kg  = order kg × wastage %
consumed kg = order kg + wastage kg
```

**The works has two wastage figures, from two of its own documents, and which
one applies is decided by the pouch STYLE — not by whether it is a pouch:**

|                      | Covers                                    | Wastage | Ink GSM |
| -------------------- | ----------------------------------------- | ------- | ------- |
| **Estimation sheet** | centre seal, three side seal, spout, roll | **8%**  | 1.8     |
| **Pouch workbook**   | standup, standup zipper, zipper, D punch  | **7%**  | 1.2     |

> That distinction carries real weight. All seven of the works' 2022 quotations
> that the system reproduces to the paisa are **centre seal** pouches. A rule
> reading "any pouch" would have moved every one of them onto figures that never
> priced them.

**The cost is worked out on the consumed weight, then divided by the ORDERED
weight.** That is deliberate: the wastage is a cost the customer pays for.
Dividing by the consumed weight would charge for the waste and then hand it
back.

---

## 6. What the material costs

### 6.1 Film

```
web width      = pouch film width × lanes + trim (15 mm)
each ply's kg  = (its GSM ÷ structure GSM) × consumed kg
each ply's m   = its kg × 1,000,000 ÷ (its GSM × web width)
each ply's cost= its kg × its rate per kg
```

Every ply runs **the same length**, which is a useful check that the arithmetic
is right.

> **A film has one rate and it applies at every gauge.** The works pays near
> enough the same for a kilogram of PET whether the reel is 12 micron or 15, so
> they keep one PET rate rather than one per thickness. The gauge decides how
> many metres that kilogram covers — never what the kilogram costs.

### 6.2 Ink — two methods, and they disagree by 2×

**Flat** (the Estimation sheet, and the default):

```
ink cost = (ink GSM ÷ structure GSM) × consumed kg × blended ink rate
```

The blended rate is **Rs 800/kg** — a figure that already carries the solvent,
the dilution and the losses. It is deliberately **not** the price on the
invoice.

**Per colour** (the Costing sheet):

```
printed area    = first ply's kg × 1000 ÷ its GSM
dry ink         = area × that colour's laydown ÷ 1000
wet ink         = dry ÷ solids %          ← the tin has to be BOUGHT wet
solvent         = wet × 80 parts per 100 of ink, half ethyl, half toluene
colour cost     = wet ink at its own rate + solvent at theirs
```

Here the **purchase** rates apply — black Rs 202, cyan Rs 217, magenta Rs 235.

> **The two rates are not alternatives — they are the same drum described two
> ways.** Rs 800 blended and Rs 202 on the invoice each belong to their own
> method. Feeding the flat method a purchase rate understated ink by a quarter:
> **Rs 10.14 a kilogram** off the quoted rate once the margin it also lost is
> counted.

> Only the pigment stays on the film. Costing a laydown against the purchase
> rate, without grossing up for solids, understates ink **three to five times
> over**.

### 6.3 Adhesive — also two methods

**Flat:** `(adhesive GSM ÷ structure GSM) × consumed kg × Rs 400/kg`.

**Per batch:** the dilution ratio (e.g. `100:189:15`) gives the batch solids,
the batch is split into adhesive, ethyl acetate and hardener, and each is priced
at its own rate.

> Note the divisor in the per-batch method: adhesive is spread over the
> **substrate** GSM, not the whole laminate. **It does not stick to itself or to
> the ink.**

### 6.4 Material total

```
material cost = film + ink + adhesive
```

On a typical job this is about **four-fifths of the whole rate**, which is why
one percentage point of wastage is roughly **Rs 2 a kilogram**.

---

## 7. The machines, and the time

```
printing metres   = the first ply's metres
slitting metres   = the first ply's metres again
lamination metres = the first ply's metres × (plies − 1)     ← one pass per bond

run minutes      = metres ÷ that machine's speed
occupied minutes = run minutes + setup minutes
electricity      = horsepower × rate per HP-hour ÷ 60 × powered minutes
```

**A job runs on one machine of each kind.** The works has two laminators; if a
job were charged for both it would be billed for a lamination pass it never
made — quietly, on every quotation, because nothing in the total says which
machine it came from. A job takes the machine it names, or the first on the
works' own list.

**Press horsepower follows the stations.** 30 HP main drive plus 12 HP per
station: a seven-colour job draws more than a two-colour one because seven
stations are inked and turning. Note it is **stations**, not priced colours — a
station draws power whether or not its ink appears in the costing.

**Setup is charged for wages, and for power at a factor the works sets.** Their
sheet billed the operator for the hour spent threading the press and billed
nothing for the press itself, which cannot be right — the machine is switched
on. How _much_ it draws while being threaded is not a question arithmetic can
answer, so `setupPowerFactor` is the works' answer to it. It ships at 0, which
is the sheet.

---

## 8. The big one — why a bigger order is now cheaper

This is the change the client asked for in so many words, and it is worth
explaining carefully because it changes every rate in the system.

### The problem

> "Right now if I put 1,000 kg and 2,000 kg the rate stays almost the same, but
> the client says the rate should change by almost 10 rupees."

They were right, and here is exactly why. In the works' Estimation method,
**everything scales with the kilograms** — film, ink, adhesive, transport,
packing, even the wages, because wages were charged per minute and minutes
follow metres. The only genuinely fixed cost on a job was **Rs 250 of
sundries**.

So doubling the order moved the rate by **twenty paise.** That is not how a
printing works actually behaves.

### What was missing

Their own **job card records a make-ready figure in a box — and no formula on
any tab ever charges it.** The hours spent setting the press, matching colour
and threading the laminator were written down and then priced at nothing.

That is the fixed cost. It is the same hour whether the run is 500 kg or 5,000.

### What the system does now

A setting called **`rateModel`** picks between two ways of recovering the works'
own time:

|                     | **PER_MINUTE** (the sheet) | **PER_DAY** (current)       |
| ------------------- | -------------------------- | --------------------------- |
| Crew                | Wages per minute × minutes | Included in the day charge  |
| Bank EMI            | Per minute × minutes       | Included in the day charge  |
| Make-ready          | Not charged at all         | **Charged, as days**        |
| Machine electricity | Per machine                | **Per machine — unchanged** |

Under **PER_DAY**:

```
running days  = total machine minutes ÷ minutes a machine-day (1,606)
occupied days = make-ready days (0.75) + running days
works day cost = occupied days × Rs 20,000 a day
```

And that **replaces** the per-minute crew and EMI rather than sitting on top of
them, which would bill the same people twice.

> **Machine electricity stays per-machine under both models.** That is
> deliberate, and it is the thing that keeps one laminator distinguishable from
> another — which was the client's other request.

### Why days come from minutes, not kilograms

The first version worked days out from kilograms. It could not explain why
**Amruta Family Tea took three days** when a job of similar weight took two.

Working it from the machines explains it exactly:

- **1.48× the printed metres** — a narrower web means more length for the same weight
- **2.97× the lamination metres** — three plies is two passes, not one
- **8 colours against 1**

Fitted against the works' own fourteen job sheets — their recorded days against
the machine minutes their metres and passes demand — this gives **R² 0.95**, and
puts Amruta at three days where kilograms alone said two. Mean error is a wash
against the kilogram model, but the **worst case halves**.

### What it does to the rate

- Between 1,000 kg and 2,000 kg the rate now moves about **Rs 9.50** — which is
  the "almost 10 rupees" the client described.
- It also **lifts the level**, by roughly **Rs 27 a kilogram at 1,000 kg** and
  much more on a small order.

> That second part is the uncomfortable half and it should be said plainly to
> the client: **it means the small jobs were being quoted under cost.** Not by a
> little. The old method simply never charged for setting up.

---

## 9. Colours, cylinders and stations

```
colours   = the inks named on the line
cylinders = one per colour
stations  = the cylinder count
```

They are one fact told three ways, so they move together.

### A special colour is anonymous

A new line starts with the four process colours — **Cyan, Magenta, Yellow,
Black** — each a **toggle**, not a delete: click to take it off, click to put it
back. Anything else is a **Special colour** chip.

The office adds one chip per special station rather than naming anything,
because **which colour it is gets settled at artwork, weeks after the price was
given.** So every special is priced at **the dearest costable ink on the rates
list**.

> Quote the cheapest and the works loses the difference on every job where it
> guessed low — on a document that has already gone out.

### Typing a cylinder count fills the process colours first

Type **7** and you get **CMYK plus three specials** — not seven specials. That
is the order the works fills a press in: the four colours it always carries,
then whatever the artwork turns out to need.

> This was a real bug. A line with no process colours read _"7 colours — so 7
> cylinders and 7 stations"_ with all seven chips saying **Special colour**, and
> every one of them priced at the dearest ink on the list. The count was right,
> the cylinders were right, only the ink was wrong — and nothing on the screen
> said so.

### The colours decide how the ink is costed

| The line          | Method                                                | Why                                        |
| ----------------- | ----------------------------------------------------- | ------------------------------------------ |
| **names colours** | Per colour — each on its own laydown, solids and rate | the Costing sheet's way                    |
| **names none**    | Flat — blended rate over the flat ink GSM             | there is nothing to price colour by colour |

The method follows the data rather than a setting. That is also what keeps every
quotation written before colours existed reading exactly as it did.

### What a cylinder costs

```
circumference = design height × repeats around
face          = film width × lanes across + 80 mm mounting
area          = circumference × face  → cm²
cost          = area × Rs 2.50/cm²
```

- **The 80 mm is the engraver's mounting margin** — a cylinder is wider than the
  film it carries and the whole face is paid for. On a 700 mm job at seven
  stations that is **Rs 8,400 of an Rs 81,900 charge**.
- **Repeats matter.** Left at 1, a 250 mm pouch asks for a 250 mm cylinder,
  which is below anything in the works' racks. The suggestion is read off the
  works' own records: of 347 jobs recording a cylinder, **84% have a
  circumference that is an exact multiple of the design height**, clustering
  around 480 — so the suggestion is the multiple closest to 490. Checked back,
  it reproduces the repeat the works actually chose on **85%** of them.
- **A repeat order pays no cylinder charge at all** — they are already in the
  works.

---

## 10. What making a pouch costs

**Per pouch, not per kilogram**, which is how the work is actually done:

| Setting                 | Default         | Applies to                                  |
| ----------------------- | --------------- | ------------------------------------------- |
| Pouch making            | Rs 0.25 / pouch | every style but a D punch                   |
| D punch                 | Rs 0.60 / pouch | a D punch, **instead of** making            |
| D punch, wide           | Rs 0.80 / pouch | a D punch over the width below              |
| A D punch is wide above | 450 mm          | the works' own cut-off                      |
| Zipper                  | Rs 3.60 / metre | standup zipper and zipper, across the mouth |

```
pouch making per kg = charge per pouch × pouches per kg
```

> **Why per pouch and not per kilogram:** across the nine jobs in the works' own
> pouch workbook, the same charge reads between **Rs 11 and Rs 64 a kilogram** —
> purely because a small pouch packs 130 to a kilo and a big one 14.
>
> The zipper crosses the **finished** mouth, not the flat film: a standup's
> bottom gusset lengthens the film without widening the mouth.

---

## 11. The margin

```
cost before margin = material + overheads + electricity
margin base        = the MATERIAL only          ← the works' method
margin amount      = base × margin %  (9%)
total cost         = cost before margin + margin amount
```

**The margin is taken on materials alone.** That is what the works' workbook
does. Every other figure is a cost they can point at and buy; the margin is on
what was bought and converted.

> It leaves the labour, the power, the transport and the packing **recovered at
> cost and earning nothing** — on the reference job, Rs 11,269 of effort for no
> return. There is a setting to earn on the whole cost instead. It is one click
> away and it is the works' decision, not ours.

---

## 12. The rate, assembled

```
base rate per kg     = total cost ÷ ORDER kg
station surcharge    = Rs 5.50 for the 6th station + Rs 7.50 for the 7th
pouch making per kg  = charge per pouch × pouches per kg   (0 on a roll)

RATE PER KG = base rate + station surcharge + pouch making
RATE EACH   = rate per kg ÷ pouches per kg
```

---

## 13. Quantities — why a quotation carries up to three

Setting a press takes the same hour whether it runs 500 kg or 5,000. **The whole
rate chain runs once per quantity**, so each column gets its own honest rate.

Every job on one quotation must be priced at the **same number** of quantities —
they are columns on one document, and a job with three where another has two
would leave a hole no total could describe.

### Kilograms and pieces are both boxes

An order taken as _"a lakh pouches at six-fifty"_ is keyed in exactly that way:

```
quantity kg = pouches typed ÷ pouches per kg
rate per kg = rate each typed × pouches per kg
```

and reaches the arithmetic as kilograms. Four decimals on the per-pouch rate,
because a pouch is often under ten rupees and two decimals would round a
half-paisa negotiation away.

### Two margins are shown, not one

Each quantity row reports **gross** and **net** — `37.3% gross · 8.0% net`.
Gross subtracts materials; net subtracts everything, including the press setup.

> The pair exists because one figure was the flattering one, and it flattered
> most exactly where it did most harm. Materials cost the same per kilogram at
> any volume, so a **short run at a higher rate showed the fattest margin on
> screen while actually earning least**. On a real quotation, 1,000 pouches read
> **71.9% gross** against 8,999 pouches' 37.3% — and net put both at **8%**.

---

## 14. Totals, GST and advance

```
material subtotal = Σ every line's amount
cylinder subtotal = Σ every line's cylinder cost
GST               = 18%, on both
material advance  = material WITH GST × 70%
cylinder advance  = cylinder WITH GST × 100%
```

> **The advance is taken on the GST-inclusive amounts**, confirmed with the
> client. Their spreadsheet printed pre-GST figures on the two advance rows but
> a GST-inclusive advance total, which did not reconcile. GST-inclusive is what
> they actually collect.

---

## 15. The four figures a quotation can set for itself

**Margin %, transport per kg, pouch making per kg, wastage %.**

They exist because the works varies them job to job: across their own seven old
quotations, margins of **5%, 9% and 10%**, transport at **Rs 5 and Rs 10**, and
**nothing charged for pouch making** on the two sold as reels — with five of the
seven written on the same day.

But varying one is the **rare** job, so the section is folded away at the bottom
of the Jobs step, above **Add another job**:

```
THIS QUOTATION'S COSTING
Margin 9% · Transport Rs. 6.80/kg · Wastage 7% · Pouch making Rs. 122.55/kg

[ ] Edit this quotation's costing
```

Ticking it opens the boxes **already filled in with the works' own figures**.
Two of those four are not read off a screen at all — they are worked out for
this document:

- **Wastage** from the styles on it (7% or 8%).
- **Pouch making** from the style and size actually typed, since the works
  charges per pouch and there is no per-kilogram figure to copy.

**Untouched means the works' figure, not a copy of it.** Anything still equal to
the master when the quotation is saved is sent blank — so reading the figures
and closing the section again leaves no trace, and the quotation goes on
following the Costing screen as it changes. Unticking clears all four, which is
how an override is taken back.

---

## 16. What is verified

### The works' own workbook, cell by cell

**"3. Anupriya.xlsx"** — 500 kg of 5 kg atta packaging, 23 March 2022 — ties out
**exactly**, down to **Rs 263.40 a kilogram and Rs 13.83 a pouch**, on the
Estimation sheet's own frame.

### Seven real quotations they actually sent

`npm run seed:old-quotations` rebuilds seven of the works' 2022 quotations from
their own sheets and compares:

**Seven of seven exact**, on both the rate per kilogram and the rate per pouch.

That is the guard that matters most. Every change made since — the day model,
the second laminator, the film-rate change, the transport and packing
corrections — has been checked against it, and all seven still reproduce to the
paisa. They reproduce because a quotation is priced **on its own date**: the
corrections were dated, so nothing already sent moved.

### The working downloads as a spreadsheet

Laid out like the works' own Estimation sheet — their headings, their row order,
their spelling — with the formulas **live**, so a different wage or film rate can
be tried in the copy and the total moves.

---

## 17. Does the quote cover the cost?

The two modules meet here. Every one of the works' fourteen finished job sheets
was turned back into the quotation the office _would have written_, and set
beside what the run actually cost.

**Ten of twelve comparable jobs would have been quoted at or above cost. Mean
gap +8.0%, worst −6.6%.**

Two Lokraja tabs are **set aside** from that average — they ran at 26% wastage,
so their cost says nothing about whether the _rate_ was close. They still print,
marked, with the reason.

That comparison caught two of the works' own settings being years out of date:

| Setting   | Was         | Their own spending                                    |
| --------- | ----------- | ----------------------------------------------------- |
| Transport | Rs 10.00/kg | median **Rs 6.80**, never above 7.00                  |
| Packing   | Rs 5.00/kg  | median **Rs 1.22**, never above 1.95 — four times out |

Correcting both took the gap from **+10.8% to +8.0%**.

> The **8% wastage allowance was deliberately left alone**, though their tabs run
> around 3%. An allowance is **commercial protection**, not a forecast — and
> Lokraja is the proof it is needed. Drop it to what a typical job wastes and the
> first bad run is quoted under cost.

---

## 18. How this replaces Excel

| In Excel                                                         | In the system                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| A new tab per job, copied from the last — including its mistakes | One method, every job                                                |
| Rates typed in from memory                                       | Rates come from the catalogue, **as at the quotation's date**        |
| An old tab re-prices itself if you touch a shared cell           | An old quotation keeps its own date and cannot drift                 |
| A pouch weight from a 1.1 / 1.2 fudge factor                     | Each ply at its own density — the factor was 9% to 27% out           |
| Doubling the order moves the rate 20 paise                       | The day charge makes it move about Rs 9.50                           |
| Two laminators indistinguishable                                 | The job takes one machine of each kind, at its own speed and power   |
| Cylinders not costed at all                                      | Circumference, face, mounting margin, engraver's rate                |
| One margin figure — the flattering one                           | Gross **and** net, so a short run cannot look like the good one      |
| Nothing connects the quote to what happened                      | Compared against the job sheets; the gap is reported                 |
| Change a figure and every old sheet silently moves               | Settings are **dated**; seven old quotations still reproduce exactly |

### The sentence to lead with

> **The method is yours and we did not change it. What we changed is that it is
> now applied the same way every time, on the right day's rates, and it can be
> checked.**

---

## 19. A worked example — the reference job

**500 kg · 700 × 600 mm · PET 12µ over W/O Poly 110µ · 7 stations · centre seal**

_On the Estimation sheet's own frame — this is the reconciliation figure._

**Material**

|                                       |               |
| ------------------------------------- | ------------- |
| Wastage 8% → consumed                 | 540 kg        |
| PET 12µ                               | 13,426.56     |
| W/O Poly 110µ                         | 72,810.14     |
| Ink — flat, 1.8 GSM at Rs 800 blended | 6,220.80      |
| Adhesive — flat, at Rs 400 blended    | 5,184.00      |
| **Material total**                    | **97,641.50** |

**Everything else**

|                                           |                |
| ----------------------------------------- | -------------- |
| Labour, transport, packing, sundries, EMI | 9,820.12       |
| Electricity                               | 1,448.91       |
| Margin — 9% of the **material**           | 8,787.74       |
| **Total cost**                            | **117,698.27** |

**The rate**

```
base rate     117,698.27 ÷ 500 kg   =  235.40
6th station                         +   5.50
7th station                         +   7.50
pouch making  0.25 × 19.05/kg       +  15.00
                                      ───────
RATE PER KG                         =  263.40
RATE EACH     263.40 ÷ 19.05        =   13.83
```

> Under the works' **current** PER_DAY setting this same job prices higher,
> because make-ready is now charged. The 263.40 above is the Estimation-sheet
> frame, kept as the reconciliation figure.

---

## 20. Questions the client will probably ask

**"Why is the rate higher than my spreadsheet says?"**
Because the spreadsheet never charged for setting up. Your job card records
make-ready in a box and no formula on any tab uses it. Adding it lifts a
1,000 kg job about Rs 27 a kilogram — which means those jobs were being quoted
under cost.

**"Will a bigger order finally come out cheaper?"**
Yes. About Rs 9.50 a kilogram between 1,000 and 2,000 kg, because make-ready is
the same hour either way and it now gets spread.

**"Can I still set the margin myself on a particular job?"**
Yes — margin, transport, pouch making and wastage, at the bottom of the Jobs
step. They open filled in with your own figures; change what you want. Anything
you don't touch goes on following the Costing screen.

**"If I change a rate today, do my old quotations change?"**
No. Every quotation is priced on its own date. All seven of your 2022 quotations
still reproduce exactly, and that is checked automatically.

**"What about my two laminators?"**
A job runs on one machine of each kind, at that machine's own speed and
horsepower. Machine electricity is per-machine whichever model is in use, which
is what keeps them distinguishable.

**"Why does a seven-colour job cost more than the ink alone?"**
Seven cylinders to engrave, seven stations drawing power, and a surcharge on the
6th and 7th. Stations, not colours — a station draws power whether or not its
ink is costed.

---

## 21. Still open — what is needed from the works

1. **Laminator 2's real figures** — speed, horsepower, loaded rate and setup
   time. It is currently a copy of Laminator 1.
2. **Rs 20,000 a day, and 0.75 days of make-ready.** Both were fitted from the
   works' own fourteen job sheets, not supplied by them. **Nothing about the day
   model is precise until they recognise these two numbers.** Both are on the
   Costing screen.
3. **Whether the eight spot inks get their own laydown.** If they do, the
   special-colour rate moves from **Rs 235 to Rs 510** — which moves every job
   quoting a special.
4. **A lamination wage.** The laminator runs 86 minutes on the reference job and
   the sheet pays nobody for it. Two roles were seeded and retired; restoring
   them is worth 48 paise a kilogram.
