# Every formula this system uses

What each figure on a quotation is worked out from, in order, with the cell it
answers to in the client's own workbook where there is one.

Written to be read by whoever has to defend a rate across a table, not only by
whoever maintains the code. Each section names the file it lives in so the two
can be checked against each other.

For **what has to be entered before any of this can run**, see
[`setup.md`](./setup.md). For **proof that this reproduces the works' own
quotations**, see [`old-quotation-check.md`](./old-quotation-check.md). For the
same ground **in plain words, without the cell references**, see
[`quotation-module.md`](./quotation-module.md) — and
[`job-sheet-module.md`](./job-sheet-module.md) for what a run actually cost.

The reference throughout is **"3. Anupriya.xlsx"**, 5 kg atta packaging,
23 March 2022 — the sheet the office reconciles against. It has two tabs,
**Estimation** and **Costing**, and they cost the same job two different ways.
Estimation is the one the works follows and its cells are quoted as `G63` and
so on; Costing's are marked as such.

---

## Contents

1. [How to read this](#1-how-to-read-this)
2. [The laminate](#2-the-laminate)
3. [The pouch](#3-the-pouch)
4. [The cylinder](#4-the-cylinder)
5. [The quotation line and its totals](#5-the-quotation-line-and-its-totals)
6. [The rate — what a kilogram costs to make](#6-the-rate--what-a-kilogram-costs-to-make)
7. [Margins](#7-margins)
8. [Material cost per kilogram](#8-material-cost-per-kilogram)
9. [Stock, purchase and units](#9-stock-purchase-and-units)
10. [Worked example, end to end](#10-worked-example-end-to-end)
11. [What is editable, and where](#11-what-is-editable-and-where)

---

## 1. How to read this

**Units.** Millimetres for film, microns for ply thickness, g/cm³ for density,
g/m² (GSM) for weight per square metre, kilograms for quantity, rupees for
money. A micron times a density is a GSM — that single conversion is what the
whole system turns on.

**Rounding is part of the arithmetic, not a display choice.** Where a figure is
rounded before being used again, this document says so, because the order
changes the answer. `pouchesPerKg` is rounded to 2 dp **before** being
multiplied by the quantity, which is what the client's sheet does and what makes
one line read 24,930 rather than 24,929.

**Where it lives.**

| Area                       | File                                        |
| -------------------------- | ------------------------------------------- |
| Pouch, cylinder, tier, GST | `packages/shared/src/lib/quotation-math.ts` |
| The rate costing           | `packages/shared/src/lib/rate-costing.ts`   |
| Material cost per kg       | `packages/shared/src/lib/material-cost.ts`  |
| Stock value and health     | `packages/shared/src/lib/inventory.ts`      |
| Purchase orders            | `packages/shared/src/lib/purchase.ts`       |
| Unit conversion            | `packages/shared/src/lib/units.ts`          |

All of it is in `packages/shared`, so the screen, the API and the PDF cannot
produce different numbers from the same inputs.

---

## 2. The laminate

### 2.1 One ply's weight

```
ply GSM = micron × density
```

12µ PET at 1.4 g/cm³ = **16.8 GSM**. Density is a property of the film and is
edited on the Rates screen beside its price.

A ply with **no density recorded cannot be weighed**, and the system refuses
rather than treating it as weightless — a quotation must never look cheaper to
make than it is.

### 2.2 The structure

```
substrate GSM = Σ (ply micron × ply density)        plies at 0µ are ignored
structure GSM = substrate GSM + ink GSM + adhesive GSM
```

`structureGsm()` in `quotation-math.ts`. Estimation `G15`.

A ply left at zero microns is a ply the structure does not have. The client's
sheet keeps a Met PET row on every job and leaves it empty; counted as a ply it
would book a second lamination pass and charge for a machine that never ran.

### 2.3 Ink GSM

Two answers, and the works uses the first:

```
stated    ink GSM = the Costing screen's figure          (1.8, Estimation G14)
derived   ink GSM = Σ each colour's laydown              (0.55 on a CMYK job)
```

Both are in the workbook and they disagree by three times. The **stated** figure
is what decides a pouch's weight there, so it is what decides it here.

### 2.4 Adhesive GSM

Worked out from the structure, not typed:

```
laminations   = number of plies − 1
coat GSM      = 3 if the thickest ply after the first is over 40µ, else 2
adhesive GSM  = coat GSM × laminations
```

`adhesiveGsmFor()` in `rate-costing.ts`. Estimation `E13`, whose own note reads
_"If 2nd/3rd layers thickness is less than 40 micron, use coating gsm 2"_.

The three numbers — 2, 3 and 40 — are all editable.

---

## 3. The pouch

### 3.1 The flat film one pouch is cut from

```
film width  = pouch width + left gusset + right gusset
film height = pouch height + bottom gusset
```

A gusset is depth the flat sheet has to carry: the sides widen it, the base
lengthens it. Everything downstream works from the **film**, not the finished
size — the weight because that film is what is bought, and the cylinder because
that film is what is printed.

On a plain pouch with no gusset, the film **is** the pouch.

### 3.2 What one pouch weighs

```
grams per pouch = film width × film height × structure GSM ÷ 1,000,000
pouches per kg  = 1000 ÷ grams per pouch          rounded to 2 dp
```

Estimation `J9` and `J10`.

**Fallback**, used only when a ply's film has no density on record:

```
micron        = every ply + 2µ adhesive         (flat, not per bond)
yield factor  = 1.1 for two plies, 1.2 for three or more
grams         = film width × film height × micron × yield factor ÷ 1,000,000
```

The yield factor stands a flat 1.1 in for the laminate's density. It is only
right when the film happens to average that: PET over white-opaque poly averages
0.985 and PET over MET PET averages 1.400, so it runs 9% light on one and 27%
heavy on the other. Real densities are always preferred.

**A roll has no pouches.** Film on a reel has not been converted into anything,
so `pouches per kg` is 0 — not a small number, not an estimate.

---

## 4. The cylinder

```
cylinder face          = film width × lanes + mounting margin
cylinder circumference = film height × repeat
cost per cylinder      = (face × circumference ÷ 100) × cylinder rate
total cylinder cost    = cost per cylinder × number of cylinders + transport
```

The `÷ 100` converts mm² to cm²; the **cylinder rate** is Rs 2.50 per cm² by
default. The **mounting margin** (80 mm by default) is face the engraver charges
for beyond the printed web — it is not in the client's workbook, which stops at
the film, and is editable on the Costing screen.

**What can be engraved.** The face must be **450 to 1060 mm** and the
circumference **400 to 600 mm**. Both are checked by `cylinderWarnings` and
shown in red under the figure, and neither blocks the quotation — an enquiry may
describe something the works cannot make, and the fix is the lanes or the
repeat.

Note 400–600 is narrow enough to leave a gap: a design from **301 to 399 mm**
tall is short of 400 at one repeat and past 600 at two, so no repeat fits it. 43
of the 395 imported jobs with a height sit there. The suggestion still answers
with the repeat nearest the preferred 490, and the warning says the result
cannot be cut.

`CYLINDER_FACE.MAX` (1060) is **not** `MAX_CYLINDER_FACE_MM` (800). The first is
what the engraver can cut; the second is what the works runs, and is what the
lane suggestion is built on.

**A design whose cylinders already exist is charged nothing**, transport
included, because there is nothing to engrave and nothing to deliver. The
per-cylinder figure is still shown, so the office can see what a new set would
have cost.

### 4.1 Suggested lanes and repeat

Suggestions only — both are editable on the line.

```
lanes  = floor((widest printable face − mounting margin) ÷ film width)   min 1
```

The widest printable face is 800 mm.

```
repeat = the whole number n, 1…12, that puts (film height × n) inside
         310–740 mm and closest to 490 mm
```

Those three figures are read off the works' own 347 imported jobs: the formula
reproduces the lanes they actually ran on 82% of them and the repeat on 85%.
The rest are jobs where two repeats both fitted and the works picked the other —
which cylinder was free that week, not arithmetic. That is exactly why the
suggestion stays editable.

---

## 5. The quotation line and its totals

### 5.1 One quantity on one line

A line is sold **by weight** or **by the piece**, and whichever is typed, the
other is derived.

Sold per kilogram:

```
total pouches = round(pouches per kg × quantity kg)
total amount  = quantity kg × rate per kg
```

Sold per pouch:

```
quantity kg   = pouches ÷ pouches per kg
total amount  = pouches × rate per pouch
rate per kg   = total amount ÷ quantity kg
```

Either way:

```
cost per pouch = total amount ÷ total pouches
```

**The form prices per kilogram**, so a line entered today takes the first pair.

That is not the same as asking for the order in kilograms. The Quantities panel
carries **both units as boxes** — `500 kg = 21,565 pouches` and
`Rs. 281.24 per kg = Rs. 6.5208 per pouch` — and typing into a pouch box
converts and writes back into its per-kilogram partner, which is the field the
line is actually stored and priced on:

```
quantity kg  = pouches typed ÷ pouches per kg          to 3 dp
rate per kg  = rate each typed × pouches per kg        to 4 dp
```

So an order taken as "a lakh pouches at six-fifty" is keyed in exactly that way
and reaches the arithmetic above as kilograms and rupees per kilogram. Four
decimals on the rate because a pouch is often under ten rupees, and two would
round a half-paisa negotiation away.

`cost per pouch` is what the customer's document prints under the per-kilogram
rate on any pouch job. The per-pouch pair is still computed and still stored,
and a line genuinely quoted `PER_POUCH` — one written before the form settled on
kilograms — still prices and prints from it.

### 5.2 Document totals

```
material subtotal = Σ every line's total amount
cylinder subtotal = Σ every line's total cylinder cost
grand subtotal    = material subtotal + cylinder subtotal

material with GST = material subtotal × (1 + GST%)
cylinder with GST = cylinder subtotal × (1 + GST%)
grand with GST    = grand subtotal    × (1 + GST%)
```

GST is 18%.

### 5.3 Advance

**Taken on the GST-inclusive amounts**, confirmed with the client — their
spreadsheet printed pre-GST figures on the two advance rows but a GST-inclusive
Advance total, which did not reconcile. GST-inclusive is what they actually
collect.

```
material advance = material with GST × material advance %      (70%)
cylinder advance = cylinder with GST × cylinder advance %      (100%)
total advance    = material advance + cylinder advance
```

---

## 6. The rate — what a kilogram costs to make

This is the chain that replaces the office typing a rate from memory. Every step
below is `costRate()` in `rate-costing.ts`, and it is run **once per quantity**,
because setting a press takes the same hour whether it runs 500 kg or 5,000 —
which is the whole reason a quotation carries tiers.

### 6.1 How much film is actually bought

```
wastage kg  = order kg × wastage %      8% on a reel, 7% on a pouch job,
                                        or the quotation's own figure
consumed kg = order kg + wastage kg                   (Estimation I6)
```

Note the divisor at the end is the **ordered** quantity, not the consumed one.
**Two figures, from two of the works' documents**, and **which one applies is
decided by the STYLE, not by whether the job is a pouch**:

|                  | covers                                    | wastage | ink GSM |
| ---------------- | ----------------------------------------- | ------: | ------: |
| Estimation sheet | centre seal, three side seal, spout, roll |      8% |     1.8 |
| Pouch workbook   | standup, standup zipper, zipper, D punch  |      7% |     1.2 |

That distinction is load-bearing. Every one of the seven 2022 quotations
verified to the paisa is a **centre seal** pouch — so a rule reading "any pouch"
would have moved all seven onto figures that never priced them. `isWorkbookPouch`
is where the list lives.

A quotation may still pin its own wastage, and the seven do, because the figure
that priced them belongs beside them rather than in a setting somebody may
reasonably change.

The wastage is already inside the cost; dividing by the consumed weight would
charge for it and then hand it back.

### 6.2 The web

```
web width mm = film width × lanes + trim            (trim 15 mm, Estimation B10)
```

### 6.3 Each ply: weight, length, cost

```
share of GSM = ply GSM ÷ structure GSM
ply kg       = share of GSM × consumed kg
ply metres   = ply kg × 1,000,000 ÷ (ply GSM × web width mm)
ply cost     = ply kg × ply rate per kg
film cost    = Σ every ply cost
```

Estimation `C32`/`C34` for the kilograms, `D32`/`D34` for the metres, `F32`/`F34`
for the cost.

**Running metres is what a machine's speed is measured against**: the kilograms
give an area at that ply's own GSM, and area over web width is a length. Every
ply runs the same length, which is a useful check on the arithmetic.

### 6.4 Ink — two methods

The workbook costs ink two ways and they disagree by 2× on the same job.

**Flat** (Estimation, and the default):

```
ink cost = (ink GSM ÷ structure GSM) × consumed kg × blended ink rate
```

Estimation `F37`. The blended rate is **Rs 800/kg** — a figure that already
carries the solvent, the dilution and the losses. It is deliberately **not** the
price on the invoice.

**Per colour** (Costing sheet):

```
printed area m² = first ply's kg × 1000 ÷ first ply's GSM
dry kg          = printed area × colour laydown ÷ 1000
wet kg          = dry kg × 100 ÷ solids %
ink cost        = wet kg × colour rate per kg

solvent kg      = wet kg × solvent parts ÷ (ink parts + solvent parts)
ethyl acetate   = solvent kg × ethyl acetate %
toluene         = solvent kg − ethyl acetate
solvent cost    = each at its own rate

colour cost     = ink cost + solvent cost
ink cost        = Σ every colour cost
```

Only the pigment stays on the film; the tin has to be bought at its **wet**
weight. Costing a laydown against the purchase rate understates ink three to
five times over. The press thins ink 100:80, and that mix is half ethyl acetate,
half toluene.

Here the purchase rates apply — black Rs 202, cyan Rs 217, magenta Rs 235,
yellow Rs 202 (Costing `J7`–`M7`).

> **The two rates are not alternatives.** Rs 800 blended and Rs 202 on the
> invoice are the same drum described two ways, and each method needs its own.
> Feeding the flat method a purchase rate understated ink by a quarter —
> Rs 10.14 a kilogram off the quoted rate once the margin it also lost is
> counted.

### 6.5 Adhesive — two methods

**Flat** (Estimation, and the default):

```
adhesive cost = (adhesive GSM ÷ structure GSM) × consumed kg × blended rate
```

Estimation `F36`. Blended rate **Rs 400/kg** — the made-up batch, not the drum.

**Per batch** (Costing sheet):

```
batch solids %  = from the dilution ratio      100:189:15 → 30%
                                               100:146:15 → 35%
                                               100:113:15 → 40%
                                               100:88:15  → 45%
                                               100:68:15  → 50%

batch kg        = (adhesive GSM ÷ substrate GSM) × consumed kg × 100 ÷ batch solids %

adhesive kg     = batch kg × first  part ÷ (sum of the three parts)
ethyl acetate   = batch kg × second part ÷ (sum of the three parts)
hardener        = batch kg × third  part ÷ (sum of the three parts)

adhesive cost   = each at its own rate      (Rs 165, Rs 125, Rs 365)
```

Note the divisor: adhesive is spread over the **substrate** GSM, not the whole
laminate. It does not stick to itself or to the ink.

### 6.6 Material cost

```
material cost = film cost + ink cost + adhesive cost
```

Estimation `F38`.

### 6.7 The machines

Printing runs the first ply. Lamination runs one pass per bond. Slitting runs
the printed length again. Pouch making is charged per pouch, not by the
minute.

**A job runs on one machine of each kind.** The works has two laminators, and
the loop charges a machine for the metres its KIND has to run — so passing both
would bill the job for a lamination pass it never made, quietly, on every
quotation, because nothing about the total says which machine it came from. A
job takes the machine it names in `machineChoice`, else the first of that kind
by the works' own sort order.

```
printing metres   = first ply's metres
slitting metres   = first ply's metres
lamination metres = first ply's metres × (plies − 1)

run minutes       = metres ÷ machine speed
occupied minutes  = run minutes + setup minutes
powered minutes   = run minutes + setup minutes × setup power factor

electricity = (horsepower × rate per HP-hour ÷ 60) × powered minutes
labour      = Σ (each wage on that machine, per minute) × occupied minutes
```

Estimation `H32`/`H34`/`H35` for the minutes, `K37` for the electricity total.

**Setup is charged for wages but not, by default, for power.** The sheet billed
the operator for the hour spent setting the press and billed nothing for the
press itself, which cannot be right — the machine is switched on. How much it
draws while being threaded is a different question and not one arithmetic can
answer, so `setupPowerFactor` is the works' answer to it. It ships at 0, which
is the sheet.

```
wage per minute = monthly salary ÷ (working days × hours per day × 60)
```

Estimation `F42` — 25,000 ÷ 26 ÷ 8 ÷ 60 = Rs 2.0032 a minute.

### 6.8 The works' own time — two models

This is the one place the system deliberately leaves the Estimation sheet, and
it is a setting: **`rateModel`**.

```
PER_MINUTE   the sheet: crew and bank charged per minute, make-ready not at all
PER_DAY      crew and bank charged by the DAY, make-ready included   ← current
```

Under `PER_DAY`:

```
running days   = total machine minutes ÷ machineMinutesPerDay   (1,606)
                 — or order kg ÷ kgPerDay (1,945) for a line with no structure
occupied days  = makeReadyDays (0.75) + running days
works day cost = occupied days × worksDayCost (Rs 20,000)
```

and the day charge **replaces** the per-minute crew and EMI rather than sitting
on top of them, which would bill the same people twice.

**Machine electricity is per-machine under both models.** That is what keeps one
laminator distinguishable from another.

> **Why this exists.** Everything in the sheet's method scales with the
> kilograms, so the only genuinely fixed cost on a job was Rs 250 of sundries and
> **doubling the order moved the rate twenty paise.** The works' own job card
> records a make-ready figure in a box that **no formula on any tab ever
> charges**. Restoring it makes 1,000 → 2,000 kg move about **Rs 9.50**, which is
> the "almost 10 rupees" the client described — and lifts the level about
> **Rs 27 a kilogram at 1,000 kg**, which says the small jobs were being quoted
> under cost.

> **Days come from the machines, not from the weight.** A kilogram-based fit
> could not explain why Amruta Family Tea took three days: 1.48× the printed
> metres (a narrower web), 2.97× the lamination metres (three plies is two
> passes) and 8 colours against 1. Fitted against the works' fourteen job sheets,
> minutes give R² 0.95 and halve the worst-case error.

> `worksDayCost` and `makeReadyDays` were **fitted from the works' own job
> sheets, not given by the works.** Both are on the Costing screen and nothing
> here is precise until they recognise them.

### 6.8a Everything else

```
transport = consumed kg × transport per kg          (Rs 6.80)
packing   = consumed kg × packing per kg            (Rs 1.22)
sundries  = a flat sum per job                      (Rs 250)

EMI per minute = monthly EMI ÷ (machine hours a month × 60)
EMI cost       = EMI per minute × minutes           PER_MINUTE only

overhead cost = charged labour + works day cost + transport + packing
              + sundries + EMI
```

Estimation `G48`–`G51`. Which minutes the EMI is spread over is a setting:
**run time** (the sheet) or **occupied** time, which includes setup.

> **Transport and packing were four years stale**, at Rs 10 and Rs 5. Against the
> works' own September 2026 spending they median **6.80** (never above 7.00) and
> **1.22** (never above 1.95 — four times out). Both were corrected **on a date**,
> so nothing already quoted moved: the seven 2022 quotations still reproduce
> exactly. It took the quote-against-cost gap from +10.8% to **+8.0%**.

### 6.9 Margin

```
cost before margin = material cost + overhead cost + electricity

margin base   = material cost only        ← the sheet
              | cost before margin        ← the alternative
margin amount = margin base × margin %    (the quotation's, else the works')
total cost    = cost before margin + margin amount
```

Estimation `G55` and `G56`.

> **The sheet takes its margin on materials alone**, which leaves the labour,
> the power, the transport and the packing recovered at cost and earning
> nothing — on the job above, Rs 11,269 of effort for no return. `MATERIAL_ONLY`
> is the default because it is what the sheet does and the office reconciles
> against that sheet. `TOTAL_COST` earns on the effort as well and is one
> setting away.
>
> It is also why **the margin per kilogram is the same at every quantity**:
> material cost per kilogram does not move with volume, so 9% of it does not
> either.
>
> Under `PER_MINUTE` that left almost nothing to move with the order size — a
> three-fold order shifted the rate about 38 paise, all of it the Rs 250 of
> sundries being spread wider. **Under `PER_DAY` the make-ready days are the
> fixed cost**, and they are what make a bigger order genuinely cheaper: about
> Rs 9.50 a kilogram between 1,000 and 2,000 kg. See §6.8.

### 6.10 The rate

```
base rate per kg = total cost ÷ ORDER kg

extra stations   = max(0, stations − 5)
station surcharge per kg = sum of the surcharges for the 6th, 7th, 8th
                           (Rs 5.50, Rs 7.50, Rs 0)

pouch expense per pouch  = making   (a D punch is made at its own flat rate)
                         + zipper   (width m × Rs/metre, zippered styles only)
pouch making per kg      = pouch expense × pouches per kg, 0 on a roll
                           — or the quotation's own Rs/kg, where it has one

RATE PER KG = base rate + station surcharge + pouch making
```

Estimation `G57` + `G59` + `G60` + `G62` = `G63`.

### 6.9a Which colours, and what an unknown one costs

The line names the inks it prints. A new one starts with the four process
colours and the office takes away what the job does not run — plenty of packs
are one colour, and four cylinders and four stations on a single-colour job is
money and press time that were never spent.

```
colours      = the inks named on the line
cylinders    = colours                    both ways — typing a bigger count
stations     = the cylinder count         grows the list, a smaller one shrinks it
special      = the dearest COSTABLE ink on the rates list, of any kind
```

The count and the colour list are one fact told twice, so they move together.

**Growing fills the missing process colours first, then adds specials** — the
order the works fills a press in: the four it always carries, then whatever the
artwork turns out to need. So typing 7 means **CMYK and three specials**, not
seven specials. Shrinking takes the specials off first, newest first, then
process colours off the end. One colour is the floor.

> That was a real fault, not a refinement. `resizeColours` only ever appended
> specials, because it was never told what the process palette was — right from a
> CMYK line, wrong from every other. A line with no process colours read
> **"7 colours — so 7 cylinders and 7 stations"** with all seven chips saying
> _Special colour_, every one priced at the dearest ink on the list. Two ways in,
> and the second bites: the office takes the process colours off, or **the count
> is typed before the rates list has arrived** to price them from, after which the
> seeding sees a non-empty strip and never runs.
>
> The cost of the fix: a deliberately deleted process colour comes back if the
> count is then raised. Typing a number is a coarse instruction about stations;
> taking a chip off is a precise one about ink, so the precise action stays on the
> chip.

**A special is priced at the dearest ink** because which colour it is gets
settled at artwork, weeks after the price was given. Every costable ink is in
the running, process and spot alike — preferring the spot colours would be the
more sophisticated rule and the wrong one. Quote the cheapest and the
works loses the difference on every job where it guessed low, on a document
already sent. Its laydown and solids come from that same ink, so the assumption
is one whole ink rather than the worst figure from each.

An ink with **no laydown** is not costable however dear — the blends are Rs 800
and Rs 400 a kilogram and would win every "dearest" contest, but they are a rate
for a whole laydown rather than a colour with one.

**The colours decide how the ink is costed:**

| the line      | ink method                                              | why                                        |
| ------------- | ------------------------------------------------------- | ------------------------------------------ |
| names colours | `PER_COLOUR` — each on its own laydown, solids and rate | the Costing sheet's way                    |
| names none    | `FLAT_GSM` — the blended rate over the flat ink GSM     | there is nothing to price colour by colour |

The method follows the data rather than a setting, which is also what keeps
every quotation written before colours existed reading exactly as it did: none
of them carries a colour list, so none of them moves. The seven verified 2022
quotations are among them.

### 6.10a What making a pouch costs

**Per pouch, not per kilogram**, which is what the works' own pouch workbook
(`costing_for_Standup.xlsx` — four sheets, one per style, nine costed jobs)
charges and how the work is actually done. Three figures compose it, all on the
Costing screen:

| Setting                     | Default | Applies to                       |
| --------------------------- | ------: | -------------------------------- |
| Pouch making, Rs/pouch      |    0.25 | every style but a D punch        |
| D punch, Rs/pouch           |    0.60 | a D punch, **instead of** making |
| D punch wide, Rs/pouch      |    0.80 | a D punch over the width below   |
| A D punch is wide above, mm |     450 | the works' own cut-off           |
| Zipper, Rs/metre            |    3.60 | Standup zipper, Zipper           |

```
standup        = 0.25
standup zipper = 0.25 + (width mm ÷ 1000) × 3.60
zipper         = 0.25 + (width mm ÷ 1000) × 3.60
D punch        = 0.60                             flat, up to 450 mm wide
D punch (wide) = 0.80                             flat, over 450 mm
roll           = 0
```

**It steps at 450 mm, and steps rather than scales**, because above that width
the punch is a different operation and not a bigger one. The workbook shows both
rates — 0.60 on a 190 mm pouch, 0.80 on a 485 mm one — without saying where the
step was; 450 is the works' own answer and sits between the two, so both still
reproduce. Setting the wide rate to 0 turns the band off and charges the one
rate.

**A D punch is not making plus a punch.** It is its own flat charge, which is
what the workbook states. The decomposition 0.25 + 0.35 gives the same answer
today and is a trap tomorrow: raise the making rate and the D punch would move
with it, which is not what was agreed.

The **finished pouch width** is what the zipper crosses, not the flat film
width: a standup's bottom gusset lengthens the sheet it is cut from without
widening the mouth.

The workbook's own figures are reproduced exactly — its standup pouches cost
0.25, its D punch 0.60, and `(width cm × 3.6) ÷ 100` is a 13 cm pouch paying
Rs 0.468 for 0.13 m of zipper at Rs 3.60 a metre. The workbook shows 3.80 on one
of its two zipper sheets; 3.60 is the rate.

**Why per pouch matters.** Across those nine jobs the same charge reads anywhere
from Rs 11 to Rs 64 a kilogram, purely because a small pouch packs 130 to a kilo
and a big one 14:

|              | Rs/pouch | pouches/kg | Rs/kg |
| ------------ | -------: | ---------: | ----: |
| Shamali Tea  |    0.494 |        130 | 64.22 |
| Agasti Ghee  |    0.250 |        203 | 50.75 |
| Humza Samosa |    0.800 |         14 | 11.20 |

A single rate per kilogram — which is what this was, at Rs 15 — cannot describe
that.

**One deliberate difference from the workbook.** Its standup-zipper sheet
charges the zipper alone, with nothing for making, so a zipper pouch is formed,
sealed and cut for free. Confirmed with the works that it should pay making as
well, so a 13 cm zipper pouch is 0.718 here where the sheet says 0.468.

**The quotation's own figure still wins**, and it is still stated per kilogram —
that is the unit it overrides, and it is what every quotation written before
this carries. The seven 2022 quotations rebuilt from the client's sheets all set
it, so they reproduce exactly as before.

A five-colour job pays no surcharge. Note the surcharge is charged on
**stations occupied**, not colours priced: the sheet counts seven stations on a
job it prices four inks for, because a station is paid for whether or not its
ink appears in the costing.

What a station is, what decides how many a job has when there is no artwork
yet, and the other two places the count spends money — the station motors and
the cylinder bill — are in [`stations.md`](./stations.md).

### 6.11 Per piece

```
piece weight g = film width × film height × structure GSM ÷ 1,000,000
pieces per kg  = 1000 ÷ piece weight
RATE PER PIECE = rate per kg ÷ pieces per kg
```

Estimation `G64`. Where the quotation has already counted its own pieces per
kilogram — allowing for gussets — **that count wins**, so the rate shown is the
rate the document ends up carrying.

---

## 7. Margins

Margin is read as a share of the **selling** rate, not as the mark-up on cost.
Nine per cent added to a cost is 8.26% of the price it produces, and quoting the
first as a margin overstates every job.

```
margin % = (rate per kg − cost per kg) ÷ rate per kg × 100
```

Two costs, so two margins:

```
material cost per kg = material cost ÷ order kg
full cost per kg     = cost before margin ÷ order kg
                     + station surcharge per kg
                     + pouch making per kg

gross % = margin against material cost per kg
net %   = margin against full cost per kg
```

The station surcharge and the pouch charge sit outside the cost build-up but
they are still costs. Treating the gap between rate and cost-before-margin as
profit would report a pouched job as half again as profitable as the same film
on a reel.

**Gross is the flattering figure and it flatters most where it does most harm.**
Materials cost the same per kilogram at any volume, so a short run at a higher
rate shows the fattest gross margin while actually earning least. On one real
quotation, 1,000 pouches read **71.9% gross** against 8,999 pouches' 37.3% —
and net put both at **8%**.

---

## 8. Material cost per kilogram

A simpler weighted average, used for the margin shown beside a rate rather than
for building one:

```
composite GSM = Σ ply GSM + ink GSM + adhesive GSM
cost per kg   = Σ (component GSM × component rate) ÷ composite GSM
share of each = component GSM ÷ composite GSM
```

`computeMaterialCostPerKg()` in `material-cost.ts`.

It **refuses to answer** — returning nothing rather than a number — when any
component has no rate, or any ply has no density. A missing rate understates the
cost, which is worse than showing none at all: a quotation must not look more
profitable than it is because a price was not keyed in that morning.

### 8.1 Which rate prices a ply

```
1. the rate agreed for this job, if there is one
2. otherwise the film's own rate — at WHATEVER gauge is quoted
3. nothing only when no film is chosen, or the film has no rate on record
```

**A typed rate is stored, not deduced.** `quotation_item_layers.rate_override`
holds it. It used to be inferred from the ply quoting a gauge the material does
not name, which was sound while an unstocked gauge was the only reason to type
one — and wrong once film prices turned out to be agreed job to job. The works'
own sheets carry PET at 185, 175 and 190, every one at 12µ and every one written
on the same day; at the stocked gauge such a rate was saved and then invisible,
so reopening the quotation and pressing Save replaced what was charged with the
catalogue price. Rows written before the column exists fall back to the old
inference, so nothing already saved moves.

**A film has one rate and it applies at every gauge.** The works pays near
enough the same for a kilogram of PET whether the reel is 12 micron or 15, so it
keeps one PET rate rather than one per thickness — and the same for MET PET, PE
and the rest. The gauge decides how many metres that kilogram covers, which is
the GSM and is carried elsewhere; it never decides what the kilogram costs.

> Step 2 briefly read "**only if** the gauge quoted is the gauge the film is
> stocked at", on the premise that `PET 12µm` and `PET 19µm` were two materials
> at two prices. They are not. The refusal left an ordinary 50µ sealant
> uncostable — material cost blank, margin a dash — until somebody typed a figure
> nobody had a reason to give.
>
> The caution behind it was sound: costing a 20µ PET at the 12µ price once
> reported an **87.7% margin** with an empty rate box beside it. It was the
> premise that was wrong.

**The rate box is filled in, not hinted at.** It arrives carrying the film's own
rate and is there to be typed over on the job agreed at something else. The
column beside it names the **list** rate and reports the distance when the two
differ, because once the box is editable and pre-filled nothing else on the
screen would catch 190 typed where 210 was meant.

---

## 9. Stock, purchase and units

```
stock value    = quantity × the rate PAID for that batch
                 (falling back to the current rate when a batch recorded none)

signed movement = +quantity for a receipt, −quantity for an issue

stock health   = OUT      when quantity ≤ 0
                 LOW      when quantity ≤ reorder level
                 HEALTHY  otherwise
                 UNSET    when no reorder level has been set
```

Valuing stock at **today's** rate answers "what would it cost to replace this",
which is a different question from "what is this worth" and not the one a stock
sheet asks — it makes the inventory figure jump every morning when rates are
keyed in.

```
purchase line total = quantity × rate agreed
line outstanding    = max(0, ordered − accepted − rejected)
order is delayed    = expected date is past and it is neither received
                      nor cancelled
```

Delay is computed, never stored. A stored flag needs a nightly job to maintain
and is wrong every hour in between.

```
quantity converted = value × source unit in base ÷ target unit in base
rate converted     = rate  × target unit in base ÷ source unit in base
```

A rate converts by the **inverse** of a quantity: Rs 205,000 per tonne is
Rs 205 per kilogram, not Rs 205,000,000.

---

## 10. Worked example, end to end

The Anupriya job, exactly as the workbook has it. Every figure below is produced
by the system and checked against the sheet by test.

**The job.** 500 kg ordered · film 700 × 600 mm · 1 lane · PET 12µ over W/O Poly
110µ · 7 printing stations · made into pouches.

```
STRUCTURE
  PET       12 × 1.4                                    =  16.80 GSM
  W/O Poly  110 × 0.94                                  = 103.40 GSM
  substrate                                             = 120.20 GSM
  ink (stated) + adhesive (110µ > 40µ, one bond → 3)    =   4.80 GSM
  structure GSM                                         = 125.00 GSM   G15

QUANTITY
  wastage   500 × 8%                                    =  40.000 kg   I5
  consumed  500 + 40                                    = 540.000 kg   I6
  web width 700 × 1 + 15                                = 715 mm

FILM
  PET   share 16.8 ÷ 125 = 0.1344  → 0.1344 × 540       =  72.576 kg   C32
        metres 72.576 × 1e6 ÷ (16.8 × 715)              = 6041.96 m    D32
        cost   72.576 × 185                             = 13,426.56    F32
  Poly  share 103.4 ÷ 125 = 0.8272 → 0.8272 × 540       = 446.688 kg   C34
        cost   446.688 × 163                            = 72,810.14    F34

INK AND ADHESIVE (flat method)
  ink       (1.8 ÷ 125) × 540 × 800                     =  6,220.80    F37
  adhesive  (3.0 ÷ 125) × 540 × 400                     =  5,184.00    F36

  MATERIAL COST                                         = 97,641.50    F38

MACHINES
  printing    6041.96 ÷ 65                              =  92.95 min   H32
  lamination  6041.96 × 1 pass ÷ 70                     =  86.31 min   H34
  slitting    6041.96 ÷ 80                              =  75.52 min   H35

  electricity printing    (66 × 9 ÷ 60) × 92.95         =    920.21
              lamination  (6 × 35 ÷ 60) × 86.31         =    302.09
              slitting    (3 × 60 ÷ 60) × 75.52         =    226.56
                                                          ─────────
                                                          1,448.86    K37 (1,448.91)

  labour      printing   (2.0032+1.0417+0.6410) × 152.95 =    563.76
              slitting   (0.9615+0.6410) × 105.52        =    169.10
                                                          ─────────
                                                            732.86    G42:G46

OVERHEADS
  transport 540 × 10                                    =  5,400.00    G48
  packing   540 × 5                                     =  2,700.00    G49
  sundries                                              =    250.00    G47
  EMI       (4166.66 ÷ 1440) × 254.78 run minutes       =    737.21    G50
                                                          ─────────
                                                          9,820.07     G51

THE RATE
  cost before margin  97,641.50 + 9,820.07 + 1,448.86   = 108,910.43
  margin              97,641.50 × 9%                    =   8,787.74   G55
  total cost                                            = 117,698.17   G56
  base rate           117,698.17 ÷ 500                  =     235.40   G57
  stations 6 and 7    5.50 + 7.50                       =      13.00   G59+G60
  pouch making                                          =      15.00   G62
                                                          ──────────
  RATE PER KG                                           =     263.40   G63

PER POUCH
  piece weight  700 × 600 × 125 ÷ 1e6                   =   52.50 g    J9
  pieces per kg 1000 ÷ 52.50                            =   19.05      J10
  RATE PER POUCH 263.40 ÷ 19.05                         =    13.83     G64

THE DOCUMENT
  material   500 × 263.40                               = 131,700.00
  cylinders  7 × ((700 × 1 + 80) × 600 ÷ 100) × 2.50    =  81,900.00
  subtotal                                              = 213,600.00
  with GST   × 1.18                                     = 252,048.00
  advance    155,406 × 70% + 96,642 × 100%              = 205,426.00
```

The only differences from the sheet are **5 paise on electricity** and **10
paise on total cost**. Both come from run minutes being rounded to 2 dp before
they are multiplied: the sheet works from 92.9532 minutes where this works from
92.95. The sheet's own electricity total is 1,448.91, shown in brackets above.

---

> **This worked example is the `PER_MINUTE` frame** — the Estimation sheet's own,
> which is what Rs 263.40 reconciles against. Under the works' current `PER_DAY`
> setting the same job prices higher, because make-ready is charged. See §6.8.

---

## 11. What is editable, and where

Nothing in the list below is baked into the code. As prices rise or the works
changes a machine, these are the numbers to move.

### Rates screen

| Figure             | Applies to     | What it decides                             |
| ------------------ | -------------- | ------------------------------------------- |
| Rate               | every material | Every cost above                            |
| **Density**        | films          | A ply's GSM, and so the pouch's weight      |
| **Solids %**       | ink, adhesive  | How much has to be bought for what stays    |
| **Laydown g/m²**   | inks           | How much ink goes on the film               |
| Process or special | inks           | Which colours the costing reaches for first |

Rates are an append-only history: a new figure is recorded against its date and
the old one stays readable, so a quotation already sent keeps the margin it was
made on.

### Costing screen

**Machines** — horsepower, rate per HP-hour, speed in m/min, setup minutes,
setup power factor.

**Wages** — role, which process it belongs to, monthly salary.

**Overheads and defaults** — working days a month, hours a day, transport per
kg, packing per kg, sundries per job, bank EMI and the hours it spreads over,
**the rate model and the three day figures it rests on**, **pouch making per
pouch, D punch per pouch and the width it steps at, zipper per metre**, the
6th/7th/8th station surcharges, trim, **cylinder mounting**, **wastage % and
wastage % on a pouch job**, **ink GSM and ink GSM on a pouch job**, margin %,
solvent per
100 of ink, ethyl acetate %.

> **Not on that screen, though the rate depends on them:** adhesive GSM, the
> adhesive coat and its 40µ step, the cylinder rate, GST and
> the two advance percentages. The API accepts every one; there is no input
> rendered. The last four are settable per quotation. See
> [the Costing screen README](../apps/web/src/features/costing/README.md#8-what-is-not-on-this-screen).

**Which material prices what** — the flat ink and flat adhesive blends, the
per-batch adhesive, the hardener, ethyl acetate, toluene.

**Method switches** — how ink is costed, how adhesive is costed, what the margin
is taken on, what the EMI is spread over. Each ships set to what the sheet does;
move one and the rate moves off the client's spreadsheet, deliberately.

### As at a date

**A quotation is costed on the figures in force on its own date**, not on
today's. Material rates have always carried a history; settings do too, so an
older job entered now is priced as it would have been then. The client's own
sheets change the blended ink rate from Rs 800 to Rs 600 and the bank EMI from
Rs 4,166.66 to Rs 10,000 between March and July 2022 — one figure each, changed
in between, not something that varies job to job.

Today reads the current value, and only a date in the past consults the record
of changes. Saving the Costing screen records the change against today: the
screen does not offer to rewrite what a figure was months ago, because that is
the basis of quotations already sent.

### Per quotation

**Margin %, transport per kg, pouch making per kg and wastage %** — the four the
client varies job to job. Their own seven old sheets carry margins of 5%, 9% and
10%, transport at Rs 5 and Rs 10, and pouch making at 0, 11.04 and 15, with
nothing charged on the jobs sold as reels.

Varying one is the **rare** job, so the four are **folded away** behind a
checkbox at the bottom of the Jobs step, under a line of what this quotation is
priced at. Ticking it opens them **already filled in** with the works' own
figures.

Two of the four are not read off the Costing screen — they are worked out for
this document, because the works holds no single figure for either:

```
wastage       from the STYLES on the document      7% or 8%
pouch making  perPouch × pouchesPerKg              what the rate actually carries
```

Either can fail to land on one figure — before a job has a size, on a document
whose jobs disagree, on one that makes no pouches — and the box then stays empty
and names what decides it instead.

**Untouched means the works' figure, not a copy of it.** Anything still equal to
the master on save is sent blank, so reading the figures and closing the section
leaves no trace and the quotation goes on following the Costing screen. An open
box also keeps following while the job below it is edited, until somebody types
in it — otherwise a figure filled in before a pouch was resized would look like
the works' own, no longer be equal to it, and survive as an override nobody
made.

Also cylinder rate, GST %, material advance %, cylinder advance % — and on each line,
the lanes, the repeat, the cylinder count, and a rate typed over the one the
costing worked out.

---

## Not in the workbook

Two things this system charges for that the client's sheet does not reach, so
there is no cell to reconcile them against:

- **Cylinders** — the whole of section 4. The workbook stops at the film.
- **The cylinder mounting margin**, 80 mm, inside that. On the job above it is
  Rs 8,400 of an Rs 81,900 cylinder charge, about 4% of the quotation.

And one the sheet omits that the works has chosen to omit too:

- **A lamination wage.** The laminator runs 86 minutes on the job above and the
  sheet pays nobody for it. Two roles were seeded for it and retired on
  10 September 2026, which is worth 48 paise a kilogram. They are on the Costing
  screen, greyed, with a Restore beside them.
