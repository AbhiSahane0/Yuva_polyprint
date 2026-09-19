# The Job Sheet module, explained

_Written to be read start to finish. No code, no jargon that is not explained
where it first appears. Everything here is what the system actually does — the
figures are from the works' own September 2026 workbook and from the checks that
run against it._

---

## 1. The one-sentence version

**A job sheet is the works' record of what one finished run actually cost** —
every drum issued to the floor, everything that came back, the power, the wages,
the transport — divided by the kilograms that were finally packed, to give one
number: **the cost per kilogram**.

That number is the point of the whole module. It is what the office prices
repeat work from, and it is the only way to ever find out whether a price they
quoted was right.

---

## 2. Why it exists — the two documents

The works already has two pieces of paper for every job, and they answer
different questions.

|                | **Quotation**                 | **Job sheet**                   |
| -------------- | ----------------------------- | ------------------------------- |
| **When**       | Before the job                | After the job                   |
| **Question**   | What should we charge?        | What did it actually cost?      |
| **Built from** | The design and the order size | The drums, the scales, the crew |
| **Accuracy**   | An estimate                   | A record                        |

The quotation is a **forecast**. The job sheet is the **result**.

And here is the thing that makes the pair valuable, and why it was worth
building both: **the gap between them is the only place an estimate is ever
caught being wrong.** A works that only writes quotations never finds out it is
under-pricing. A works that only fills in job sheets knows what happened but
cannot price the next job any better.

> **How to say this to the client:** "You already do both of these. The system
> doesn't change your method — it does your arithmetic, and it remembers. After
> twenty jobs it can tell you which kinds of work you are quoting too cheaply."

---

## 3. What the sheet looks like

### It is a fixed form, not a blank list

The screen is **twenty-one rows, always the same twenty-one, in the works' own
order**, with the works' own names on them:

**Printing section**

1. 12 PET Polyester
2. Ethyl Acetate
3. Toluene
4. MIBK
   5.–16. Twelve inks: Cyan, Magenta, Yellow, Black, White, Red, Medium, Orange,
   Dark Green, Gold, Pink, Violet

**Lamination section** 17. Met PET 18. LDPE Milky / Natural 19. Adhesive (NCO) 20. Hardener (OH) 21. Ethyl Acetate

A row this job did not use **stays on the screen showing zero**. It does not
disappear.

That sounds like a small decision. It is the most important one on the screen,
and it is worth explaining to the client in exactly these words:

> The person filling this in is standing at a machine with a drum in front of
> them, reading down a printed form they have used for years. If the form
> changes shape depending on the job, they have to _read_ it before they can
> fill it in. A form that is always the same is one they can fill in without
> looking up.

### The columns are the paper's columns

For each row: **issued · returned · mix out · mix back · rate · consumed ·
amount**.

That is exactly what the paper sheet has. Nothing was added, nothing renamed.

---

## 4. The heart of it — how consumption is worked out

This is the part the client will care most about, and the part most likely to be
got wrong by anyone rebuilding it. Take it slowly.

### The simple part

For most rows:

```
consumed = issued − returned
```

Ten kilos of PET go out, one comes back, nine were used. Nothing subtle.

### The mix drums

**Neither ink nor adhesive goes to the press as it was bought.** Both are mixed
first, and the works books the mixed drum back to its ingredients at a fixed
recipe:

| Printing mix  |          | Lamination mix |          |
| ------------- | -------- | -------------- | -------- |
| Pigment       | 40%      | Adhesive (NCO) | 40%      |
| Ethyl Acetate | 40%      | Hardener (OH)  | 5%       |
| Toluene       | 20%      | Ethyl Acetate  | 60%      |
| **Total**     | **100%** | **Total**      | **105%** |

So a row's real consumption is **what it drew neat, plus its share of the
drum**:

```
consumed = (issued − returned) + share% × (mix out − mix back)
```

> **The 105% is not a mistake.** The lamination recipe is the works' own figure
> and it has been left exactly as they have it. A recipe is a fact about a
> process, not a sum that has to come to a round number. Changing it to make it
> tidy would change every cost the works has ever calculated.

### The one distinction that is easy to get backwards

This is worth saying out loud to the client, because it is the difference
between a right number and a number that is wrong by a factor of seven.

**An ink carries its own drum.** Each colour is mixed separately, so Cyan takes
40% of the **Cyan** drum and nothing at all of anybody else's. On the screen, the
mix boxes sit **on the ink's own row**.

**A solvent draws from the pool.** All the ethyl acetate that went into every
drum that day is one figure, booked back once. On the screen the mix boxes for
the solvents sit at the **top of the section**, on the shared drum, and the
individual rows show a dash — that figure is not theirs to type.

> Get these the wrong way round and **a seven-colour job books seven times the
> solvent it used.** That is the kind of error that looks perfectly plausible on
> one sheet and is obviously absurd across a year of them. There is exactly one
> place in the system that makes this decision, and it has its own tests.

---

## 5. The person holding the drum can overrule the arithmetic

Two of the works' own fourteen September tabs have a **typed number sitting on
top of a formula**. On one of them, White ink was entered as 14.5 kg where the
formula said 23.52 kg — a difference of **Rs 2,164.80** on a Rs 65,000 job.

Whoever typed that was holding the drum. The formula was not.

So in the system, every consumption is computed **and every line can be typed
over**. When it is:

- the box turns **amber**
- it says **"was 23.520"** underneath it

The correction is visible on the page instead of vanishing behind the number
that replaced it.

> **Why this matters, in one line:** a system that cannot be corrected by the
> person holding the drum gets corrected somewhere else — in a private
> spreadsheet that nobody can see.

### Negative consumption is allowed, and it is real

A drum can come back **fuller than it went out**, because it was topped up from
an earlier job's leftovers. The works' September sheets have several — Dark
Green at **−3.2 kg** on one of them.

That is a genuine correction to the earlier job's cost. Forcing it to zero would
charge this job for ink it actually gave back. The system allows it. (When stock
is later adjusted, a negative line is skipped rather than inventing a delivery
that never happened.)

---

## 6. What sits on top of the material

Material is the biggest number on the sheet but it is not the whole cost. Seven
more things are added:

| Overhead        | How it is worked out                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| **Electricity** | A day's bill for the whole works, shared out between the machines — see below |
| **Salary**      | For each crew line: rate per day × how many people × how many days            |
| **Transport**   | Rupees per kilogram of **material brought in** — not of finished goods        |
| **Pouching**    | Pouched kilograms × a rate. Zero on a roll job                                |
| **Packaging**   | A lump sum the office types: cartons, tape, stretch film                      |
| **Bank EMI**    | Production days × a daily figure                                              |
| **Profit**      | A percentage of the **material** — see below                                  |

Then:

```
effective price = material + all seven overheads
cost per kilogram = effective price ÷ final output kg
```

**Every one of the seven can be settled by hand.** The works' own tabs type over
at least one on every single sheet, and two of them type the electricity figure
outright. The office knows things the model does not, and the system does not
argue.

---

## 7. Two things the system found in the works' own spreadsheet

These are worth raising with the client directly. Neither is a criticism — both
are the kind of thing that is invisible in Excel and obvious once the arithmetic
is written down in one place.

### 7a. The margin is taken on material only — and that is correct

At first this reads like an oversight in their spreadsheet. It is not one.

Every other figure on the sheet is a cost they can point at and buy. The margin
is taken on **what was bought and converted** — not on the electricity and the
wages, which are the cost of being open.

If the ten per cent were charged on the loaded cost instead, then across their
fourteen September jobs they would be recording **12% to 19% more profit than
they believe they are making.**

The system follows their method exactly.

### 7b. The electricity shares came to 120, not 100

A day's electricity is one bill for the whole works, divided between the
machines that ran.

Their spreadsheet splits it:

```
Printing 60  +  Lamination 20  +  Lamination 20  +  Slitting 10  +  Pouching 10  =  120
```

**That is 120%.** Every job costed that way carries **a sixth more electricity
than the day actually cost.** On a one-day Radhey Murmura run that is **Rs 900**
sitting inside a Rs 2.68 lakh job.

The works confirmed the total should be 100. So the defaults are **that same
weighting, rescaled**:

| Stage        | Share    |
| ------------ | -------- |
| Printing     | 50%      |
| Lamination 1 | 16.667%  |
| Lamination 2 | 16.667%  |
| Slitting     | 8.333%   |
| Pouching     | 8.333%   |
| **Total**    | **100%** |

Note carefully: **which machine draws what was never in question** — that is
their knowledge and it is kept. Only the total was wrong.

The amount per stage is:

```
stage amount = a day's bill × share% × days × shifts
```

- **`days` is what keeps it honest.** A stage that did not run is zero days and
  costs nothing — which is what pouching is on a roll job.
- **Shifts sit outside the 100.** A second shift is a second day's running on
  that machine. The shares divide _one day between machines_; they do not cap
  what a job can use. Pouching routinely runs two shifts.

---

## 8. The wastage check — why the sheet gets filled in at all

```
allowed = good laminate off the machine × the allowance (5%)
actual  = good laminate − what was finally packed
excess  = (actual − allowed) × this job's own cost per kilogram
```

The excess is shown **in rupees**, not as a percentage, because rupees is what
gets somebody's attention.

It can be **negative**, when a job beat its allowance — which is worth seeing
too.

Two real examples from the works' own sheets:

- **Lokraja Atta** ran at **26% wastage** against a 5% allowance. That job lost
  money on waste, not on price.
- **Samarth Atta** came out at **−0.65%** — meaning _more was packed than came
  off the laminator_. That is physically impossible, so one of the two weights
  on that sheet is wrong. The system does not correct it; it shows it.

> On the job sheet list, wastage over the allowance shows **red**, which is how
> a 26% run announces itself without anybody having to open it.

---

## 9. Everything moves as you type

The whole sheet re-calculates on **every keystroke**, using the very same
calculation the server uses when it saves. Type a corrected consumption and the
line amount, the material total, the transport (which follows the kilograms),
the margin and the cost per kilogram all move together.

This was wrong at first, and it showed the moment anybody used it: the money
only recalculated on save, so a corrected 30 kg on a line rated Rs 240 sat next
to an amount of Rs 8,890 left over from the previous save.

A screen whose entire job is _"type it in and see what it cost"_ has to answer
while you are typing.

---

## 10. The three states of a sheet

```
   OPEN  ──────►  COSTED  ──────►  CLOSED
   (editing)      (settled)        (stock taken off)
```

**Open** — being filled in. Everything editable.

**Cost this sheet** — settles it. The cost per kilogram is now the works'
answer for this job. It refuses a sheet with **no final output weight**, because
that is the figure everything is divided by.

**Take off stock** — the irreversible one, and it asks before doing it. It
issues every line against the oldest batch first, in one single transaction,
then **closes the sheet to editing** and says so in a green strip.

Why irreversible? Un-posting would mean reversing real stock movements, and a
sheet that could be posted twice would take the same material off stock twice.
Correcting it afterwards is a **stock adjustment**, which is a separate, visible
action — not a quiet edit.

> A line with no material behind it in the catalogue is flagged **amber**: it
> still costs at whatever rate is typed, but posting will skip it. The screen
> says so rather than pretending.

---

## 11. A sheet keeps its own copy of everything

This is a quiet decision with large consequences, and it is worth explaining.

When a sheet is saved, it stores **its own copy** of the rates, the overhead
figures and the stage shares. It does not go and read today's settings when you
open it later.

Why:

- Electricity was **Rs 4,000 a day** on their March tabs and **Rs 6,000 a day**
  on the September ones.
- PET was **Rs 149** on one job and **Rs 170** two months later.

A sheet is the record of what the works decided _that week_. **A record that
re-prices itself when somebody edits a setting is not a record of anything.**

For the same reason, line rates come from the materials catalogue **as at the
day of the run**, not as at today. Pricing an August run at November's PET rate
would make every old sheet disagree with the paper it was copied from.

---

## 12. How this replaces Excel

The honest version: **the method is not replaced — the method is theirs and it
is kept exactly.** What is replaced is the spreadsheet as the _place_ the method
lives.

| In Excel                                                                 | In the system                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A formula can be overwritten by a typed number and nobody can tell       | A typed number turns the box **amber** and shows what the formula said |
| Shares that add to 120 sit there for years, invisible                    | The total is held at 100 by a test that fails if it moves              |
| Solvent booked per colour would multiply silently                        | One place decides own-drum vs pooled, and it is tested                 |
| Each job is a new tab, copied from the last one — including its mistakes | One form, one calculation, every job                                   |
| Rates are typed in by hand each time                                     | Rates come from the catalogue as at the day of the run                 |
| Editing an old tab silently changes what it says happened                | An old sheet keeps its own figures and cannot drift                    |
| Stock is a separate spreadsheet, updated by memory                       | "Take off stock" writes real movements, once, against real batches     |
| Wastage has to be noticed                                                | Over the allowance shows red on the list                               |
| Nothing connects the quote to the outcome                                | The system compares them and reports the gap                           |
| Fourteen tabs, fourteen chances to break a formula                       | One calculation, 101 automated checks against their own numbers        |

### The single strongest sentence for the client

> **The arithmetic is yours. We did not change it. What we changed is that it
> can no longer be silently wrong.**

---

## 13. How we know it is right

This is the part that should give the client confidence, and it is the part
worth being precise about.

All **fourteen tabs** of their September 2026 workbook were entered the way the
office would enter them — what was issued, what came back, the mixed drums, the
crew, the days, the rates typed that week — and the cost per kilogram the system
produced was compared to the one the spreadsheet printed.

### Fourteen of fourteen, exact.

On both the cost per kilogram **and** the material cost.

And the check is honest about what it did and did not verify. It states plainly
that material, wastage, wages, transport, pouching, margin and the final
division are all **computed from the raw issue and return figures**; electricity
is computed on the eight tabs that carry the stage block and **taken as typed**
on the six older ones, which state a flat figure with no workings behind it.

All fourteen are kept permanently as a **golden master** — a locked set of
automated checks. To show how tight that is: **a 1% error in a single mix share
fails 57 of the 101 checks.** Nobody can change the calculation by accident.

### It also found something the works should see

One tab — `Copy of Radhey Bhadan 200g` — **has an empty profit row.** That job
was costed at **Rs 303.28 a kilogram** with no margin at all, where the usual ten
per cent would make it **Rs 323.14**.

The system follows the sheet rather than quietly correcting it, and reports the
gap — because the sheet is the record of what was actually charged.

---

## 14. What it connects to

The job sheet is not an island. It sits in the middle of four other things:

```
      Rates catalogue                Costing settings
      (what things cost,             (electricity/day, wages,
       dated)                         transport, shares)
            │                                │
            └────────────┬───────────────────┘
                         ▼
                   ┌───────────┐
    Quotation ───► │ JOB SHEET │ ───► Stock (issued, FIFO, once)
   (the forecast)  └───────────┘
                         │
                         ▼
              Cost per kg — the answer
                         │
                         ▼
         Compared back against the quotation
```

### The comparison — the commercially important part

Every one of the works' fourteen finished jobs was turned back into the
quotation the office _would have written_ for it, priced at today's catalogue,
and set beside what the job actually cost.

**Ten of twelve comparable jobs would have been quoted at or above cost. Mean
gap +8.0%, worst −6.6%.**

(Two Lokraja tabs are set aside from that average — they ran at 26% wastage, so
their cost says nothing about whether the _rate_ was close. They still appear in
the report, marked, with the reason. Hiding them would be wrong; averaging them
in would bury what every other job is telling you.)

That comparison also caught two of the works' own settings being years out of
date:

| Setting   | Was         | What their tabs actually show                         |
| --------- | ----------- | ----------------------------------------------------- |
| Transport | Rs 10.00/kg | median **Rs 6.80**, never above 7.00                  |
| Packing   | Rs 5.00/kg  | median **Rs 1.22**, never above 1.95 — four times out |

Correcting both — on a date, so nothing already quoted moved — took the gap from
**+10.8% to +8.0%**.

> **The quotation's 8% wastage allowance was deliberately left alone**, even
> though their tabs run around 3%. An allowance is **commercial protection**, not a forecast.
> Lokraja is the proof it is needed: drop it to what a typical job wastes, and
> the first bad run is quoted under cost. That is the works' decision to make,
> not a number to tune down to make an average look better.

---

## 15. A worked example, end to end

A simplified two-colour job, to show the shape of the calculation.

**Material**

| Row              | Issued | Returned | Mix out | Mix back | Share | Consumed       | Rate | Amount        |
| ---------------- | ------ | -------- | ------- | -------- | ----- | -------------- | ---- | ------------- |
| 12 PET Polyester | 210    | 12       | —       | —        | —     | 198.000        | 185  | 36,630.00     |
| Ethyl Acetate    | 20     | 4        | 30      | 5        | 40%   | 26.000         | 95   | 2,470.00      |
| Toluene          | 10     | 2        | 30      | 5        | 20%   | 13.000         | 88   | 1,144.00      |
| Cyan             | 8      | 1        | 12      | 2        | 40%   | 11.000         | 610  | 6,710.00      |
| Black            | 9      | 2        | 14      | 3        | 40%   | 11.400         | 610  | 6,954.00      |
|                  |        |          |         |          |       | **259.400 kg** |      | **53,908.00** |

Reading one line: **Ethyl Acetate** drew 20 kg neat and gave 4 back, so 16 kg
neat. The pooled printing drum had 30 kg out and 5 kg back = 25 kg, and ethyl is
40% of the recipe, so 10 kg more. Total **26 kg**.

Reading another: **Cyan** drew 8 − 1 = 7 kg neat, plus 40% of its _own_ drum
(12 − 2 = 10 kg) = 4 kg. Total **11 kg**. Black's drum is separate and Cyan
takes nothing from it.

**Overheads**

|                                                                           |               |
| ------------------------------------------------------------------------- | ------------- |
| Electricity — Rs 6,000/day × (50% printing × 1 day + 16.667% lam × 1 day) | 4,000.00      |
| Salary — 2 operators × Rs 600 × 1 day, 3 helpers × Rs 400 × 1 day         | 2,400.00      |
| Transport — 259.40 kg × Rs 6.80                                           | 1,763.92      |
| Pouching — 0 (sold as a reel)                                             | 0.00          |
| Packaging — typed                                                         | 1,500.00      |
| Bank EMI — 1 day × Rs 2,000                                               | 2,000.00      |
| **Profit — 10% of the material only** (53,908 × 10%)                      | **5,390.80**  |
|                                                                           | **17,054.72** |

**The answer**

```
effective price  =  53,908.00 + 17,054.72  =  70,962.72
final output     =  240 kg packed
cost per kilogram = 70,962.72 ÷ 240        =  Rs 295.68
```

**The wastage check**

```
off the laminator  250 kg
packed             240 kg
actual waste        10 kg   (4.17% of what was packed)
allowed             12.5 kg (5%)
excess            −2.5 kg × 295.68  =  −Rs 739.20   ← beat the allowance
```

---

## 16. Questions the client will probably ask

**"Do we have to change how we work?"**
No. The form is your form, the rows are your rows, in your order, with your
names. The recipes are yours, including the 105%. The method is yours.

**"What if the calculation is wrong for a particular job?"**
Every consumption line and all seven overheads can be typed over. The system
shows what it calculated next to what you typed, so the correction is on the
record instead of hidden.

**"What happens to our old sheets?"**
Nothing. All fourteen September tabs were entered and reproduced exactly. They
are kept as the permanent test that the calculation has not drifted.

**"Can we still see how a figure was arrived at?"**
Yes — that is the main difference from the spreadsheet. Every figure shows its
parts, and a typed-over one shows what it replaced.

**"What if we change the electricity rate?"**
Old sheets do not move. Each sheet keeps its own copy of the rates and figures
it was costed with, so it stays a record of that week.

---

## 17. Still open — what is needed from the works

These are the things where the system is currently using a figure that was
**worked out from the works' own data rather than given by the works**. They
should be confirmed before the numbers are treated as final:

1. **Machine 2's figures.** Laminator 2 is currently a copy of Laminator 1 — its
   real speed, horsepower, loaded rate and setup time are recorded nowhere.
2. **Rs 20,000 for a day of the works**, and **0.75 days of make-ready.** Both
   were fitted from the fourteen job sheets, not supplied. They are editable on
   the Costing screen, and nothing is precise until the works recognises them.
3. **Whether the eight spot inks get their own laydown.** If they do, the
   special-colour rate moves from Rs 235 to Rs 510.
4. **The two impossible weights** — the Samarth Atta sheet packs more than came
   off the laminator, so one of its two figures is wrong.
