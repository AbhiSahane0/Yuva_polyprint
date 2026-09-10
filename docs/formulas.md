# Every formula this system uses

What each figure on a quotation is worked out from, in order, with the cell it
answers to in the client's own workbook where there is one.

Written to be read by whoever has to defend a rate across a table, not only by
whoever maintains the code. Each section names the file it lives in so the two
can be checked against each other.

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
wastage kg  = order kg × wastage %                    (8%, Estimation J5)
consumed kg = order kg + wastage kg                   (Estimation I6)
```

Note the divisor at the end is the **ordered** quantity, not the consumed one.
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
the printed length again. Pouch making is charged per kilogram, not by the
minute.

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

### 6.8 Everything else

```
transport = consumed kg × transport per kg          (Rs 10)
packing   = consumed kg × packing per kg            (Rs 5)
sundries  = a flat sum per job                      (Rs 250)

EMI per minute = monthly EMI ÷ (machine hours a month × 60)
EMI cost       = EMI per minute × minutes

overhead cost = labour + transport + packing + sundries + EMI
```

Estimation `G48`–`G51`. Which minutes the EMI is spread over is a setting:
**run time** (the sheet) or **occupied** time, which includes setup.

### 6.9 Margin

```
cost before margin = material cost + overhead cost + electricity

margin base   = material cost only        ← the sheet
              | cost before margin        ← the alternative
margin amount = margin base × margin %                  (9%)
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
> either. A three-fold order moves the rate about 38 paise, all of it from the
> setup being spread wider.

### 6.10 The rate

```
base rate per kg = total cost ÷ ORDER kg

extra stations   = max(0, stations − 5)
station surcharge per kg = sum of the surcharges for the 6th, 7th, 8th
                           (Rs 5.50, Rs 7.50, Rs 0)

pouch making per kg      = Rs 15 on a pouch job, 0 on a roll

RATE PER KG = base rate + station surcharge + pouch making
```

Estimation `G57` + `G59` + `G60` + `G62` = `G63`.

A five-colour job pays no surcharge. Note the surcharge is charged on
**stations occupied**, not colours priced: the sheet counts seven stations on a
job it prices four inks for, because a station is paid for whether or not its
ink appears in the costing.

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
1. the rate the office typed on the line, if there is one
2. otherwise the film's own rate — but only if the gauge quoted is the
   gauge the film is stocked and priced at
3. otherwise nothing, and the line reads as uncostable
```

`PET 12µm` and `PET 19µm` are two materials at two prices. Quote a 20µ PET and
neither rate is right, so the line asks rather than silently costing it at the
12µ price. A film named without a gauge — `PP Woven`, sold by GSM — is priced at
its rate whatever thickness is quoted, because there is nothing to disagree
with.

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
pouch making per kg, the 6th/7th/8th station surcharges, trim, **cylinder
mounting**, wastage %, margin %, solvent per 100 of ink, ethyl acetate %.

**Which material prices what** — the flat ink and flat adhesive blends, the
per-batch adhesive, the hardener, ethyl acetate, toluene.

**Method switches** — how ink is costed, how adhesive is costed, what the margin
is taken on, what the EMI is spread over. Each ships set to what the sheet does;
move one and the rate moves off the client's spreadsheet, deliberately.

### Per quotation

Cylinder rate, GST %, material advance %, cylinder advance % — and on each line,
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
