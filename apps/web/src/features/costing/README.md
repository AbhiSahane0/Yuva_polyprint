# The Costing screen, explained

_What every figure on `/costing` is, what it means, and what it moves. Written
to be read by whoever has to keep these numbers true — no code, and a plain
explanation of each one._

Companions: [`quotation-module.md`](../../../../../docs/quotation-module.md) for
how a price is built from these, [`formulas.md`](../../../../../docs/formulas.md)
for the exact arithmetic, and [`setup.md`](../../../../../docs/setup.md) for the
order to enter them in the first time.

---

## 1. What this screen is

**It describes what the works IS, not what a job is.**

Everything on a quotation is built from here. Kilograms become running metres,
metres become minutes at a machine's speed, and minutes become rupees at these
wages and these tariffs.

> **A figure three years stale here makes every quotation raised afterwards
> wrong by the same amount, and nobody would see it.** That is the entire reason
> this is a screen the office can open rather than a number buried in the code.
> It has already happened twice: transport sat at Rs 10 a kilogram when the
> works was paying 6.80, and packing at Rs 5 when they were paying 1.22 — four
> times out, on every quotation, for years.

Only somebody with **rates** permission can change anything. Everyone else sees
the same figures, greyed.

The screen has four parts: **Machines**, **Wages**, **The works' own
overheads**, and **Overheads and defaults**.

---

## 2. Machines

One row per machine the works runs. A job is costed on **one machine of each
kind** — the one it names, or the first on this list.

| Field                        | What it means                              | Why it matters                                                     |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| **Name**                     | What the works calls it                    | Which machine a job names                                          |
| **Stage**                    | Printing, Lamination, Slitting or Pouching | Decides **which metres it runs** — see below                       |
| **Connected load**           | Horsepower, the machine's fixed draw       | Electricity                                                        |
| **Each station adds**        | Extra HP per inked printing station        | A seven-colour job draws more than a two-colour one                |
| **Motors come on at colour** | e.g. `3,4,6`                               | Which colour switches each station motor on                        |
| **Rate per HP-hour**         | Rupees per horsepower-hour                 | The tariff, with losses and standing charges in it                 |
| **Speed**                    | Metres a minute                            | Turns metres into **minutes**, which is where most cost comes from |
| **Setup**                    | Minutes to make it ready                   | Charged for wages on every job                                     |
| **Load while setting up**    | 0 to 1, share of full load                 | See below                                                          |

### Which metres each stage runs

```
Printing     the first ply's metres
Slitting     the first ply's metres again
Lamination   the first ply's metres × (plies − 1)   — one pass per bond
Pouching     charged per pouch, not by the minute
```

A three-ply job laminates **twice**. That is why it takes longer than a two-ply
job of the same weight, and it is the single biggest reason two jobs of equal
kilograms cost different amounts.

### The works' machines today

| Machine           | Stage      | Load  | Per station | Steps   | Tariff      | Speed    | Setup  |
| ----------------- | ---------- | ----- | ----------- | ------- | ----------- | -------- | ------ |
| Rotogravure press | Printing   | 30 HP | 12 HP       | 3, 4, 6 | Rs 9/HP-hr  | 65 m/min | 60 min |
| Laminator 1       | Lamination | 6 HP  | —           | —       | Rs 35/HP-hr | 70 m/min | 30 min |
| Laminator 2       | Lamination | 6 HP  | —           | —       | Rs 35/HP-hr | 70 m/min | 30 min |
| Slitter           | Slitting   | 3 HP  | —           | —       | Rs 60/HP-hr | 80 m/min | 30 min |

> **Laminator 2 is a copy of Laminator 1.** Its real speed, horsepower, tariff
> and setup time are recorded nowhere. Until the works gives them, choosing
> between the two changes nothing — which is the opposite of what they asked
> for.

### "Motors come on at colour"

The press is a 30 HP drive with 12 HP station motors that switch on as colours
are added. `3,4,6` means the 3rd, 4th and 6th colour each bring one on:

```
2 colours  →  30 HP
3 colours  →  42 HP
4 colours  →  54 HP
7 colours  →  66 HP
```

> The works' own sheet implies the 3rd, 5th and 7th, and two of its four
> references disagree with the other two — the readings differ at four colours
> and at six. `3,4,6` is what the operator confirmed. It is editable because a
> rewired press is a fact about the works, not about the software.

Note it counts **stations**, not priced colours. A station draws power whether
or not its ink appears in the costing.

### "Load while setting up"

```
0     the machine draws nothing while being threaded   ← the works' sheet
1     it draws its full connected load
0.3   somewhere in between
```

> Their sheet charges the **operator** for the hour spent setting the press and
> charges **nothing for the press**, which cannot be right — it is switched on.
> How much it actually draws while being threaded is not a question arithmetic
> can answer, so this is the works' answer to it. It ships at **0**, which is
> the sheet, so nothing moved when the setting was added.

---

## 3. Wages

| Field              | What it means                             |
| ------------------ | ----------------------------------------- |
| **Role**           | What the works calls the job              |
| **Works on**       | Which machine's minutes they are paid for |
| **Monthly salary** | Rupees a month                            |

```
rate per minute = monthly salary ÷ (working days × hours a day × 60)
```

Rs 25,000 over a 26 × 8 month is **Rs 2.0032 a minute**.

Everyone assigned to a machine is paid for that machine's **occupied** minutes —
running plus setup.

### The works' wages today

| Role                  | Works on   | Monthly               |
| --------------------- | ---------- | --------------------- |
| Printing Operator     | Printing   | Rs 25,000             |
| Printing Assistant    | Printing   | Rs 13,000             |
| Printing Helper       | Printing   | Rs 8,000              |
| Slitting Operator     | Slitting   | Rs 12,000             |
| Slitting Helper       | Slitting   | Rs 8,000              |
| _Lamination Operator_ | Lamination | _Rs 18,000 — retired_ |
| _Lamination Helper_   | Lamination | _Rs 8,000 — retired_  |

> **Nobody is paid for lamination.** The laminator runs 86 minutes on the works'
> reference job and their sheet pays nobody for it. The two roles were seeded
> and then retired to match, which is worth **48 paise a kilogram**. They are
> still on this screen, greyed, with a **Restore** beside them.

### Retiring, not deleting

A machine or a wage is **retired**, never deleted — the quotations costed with
it are still on file, and deleting the row would make them impossible to
explain.

> **Retiring asks first; restoring does not.** Taking a machine or a wage out of
> the costing moves every rate costed afterwards, and it moves it **down** — the
> job looks cheaper to make than it is, at once and without a word. Putting one
> back is the harmless direction, and a confirmation dialog in front of a safe
> action only teaches the office to click through dialogs.

Use **Show retired** to see them and bring one back.

---

## 3a. The works' own overheads

Everything in §4 below is a figure this system knows **by name** — `transportPerKg`
is multiplied by the kilograms because the code says so. This section is the
opposite: rows the works adds for itself, for anything the fixed list does not
cover.

| Field       | What it means                                                     |
| ----------- | ----------------------------------------------------------------- |
| **Name**    | What the works calls it. "Machine maintenance", "Effluent charge" |
| **Charged** | The basis — see below. **This is the part that matters**          |
| **Amount**  | Rupees, or a percentage where the basis is one                    |

### The basis, because nothing else could work it out

A row reading "Maintenance 5000" is three orders of magnitude apart read per job
and read per kilogram. So the basis travels with the figure:

| Charged                         | Multiplies                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Rupees a kilogram**           | The kilograms **consumed** — the order plus its wastage, the same weight transport and packing use |
| **Rupees a job, flat**          | Nothing. Added once, whatever the order size                                                       |
| **Rupees a pouch**              | The pouches on the order. **Nothing on a roll**, which is made into nothing                        |
| **Rupees a day**                | Make-ready plus running days — under **both** rate models                                          |
| **% of the material cost**      | Film, ink and adhesive only                                                                        |
| **% of the cost before margin** | Everything else on the job, **and not the other custom overheads**                                 |

Three of those need a word:

**Per day works under both rate models.** The days are arithmetic; only the
_crew_ charge is conditional on the model. A rented compressor is paid for by
the day whether or not the works recovers its own people that way, and it would
be a trap for the figure to come silently to nothing because a switch elsewhere
is set to per-minute.

**Percentage of the total is not taken on itself, or on the others.** Including
them would be circular — the total contains the percentage being worked out from
it. Two overheads at 5% each come to exactly twice one of them, not 5% of a
figure that already has 5% in it.

**They sit outside the margin**, exactly as transport and packing do. A charge
the works _earns_ on is a margin, and there is a setting for that in §6.

### Adding one, and ending one

**It applies from the day you add it — not from the beginning of time.** A
quotation written last year is costed on last year's figures, so it cannot pick
up an overhead that did not exist then. That is what lets the works add a charge
on a Tuesday afternoon without disturbing a single document already sent.

**Changing the amount keeps what it used to be.** The row is closed today and a
new one opened, the same way a material rate keeps its history — a quotation
written last month must go on repricing at the figure it was written under. The
name is not priced, so correcting a spelling changes the row in place.

**"End it" is not a delete.** It stops being charged from today; the row stays
on record with the dates it ran, under **Show retired**. Repricing a quotation
written while it was live still picks it up, which is the same rule a retired
machine follows.

> A negative amount is allowed. A works that gives a standing rebate on a line
> of work has recorded a real thing, and refusing it would send them to type a
> smaller figure somewhere nobody can see what they did.

---

## 4. Overheads and defaults

Everything else a rate is built from. Grouped below by what they do; on screen
they are one grid.

### 4a. The working month

| Setting              | Now | What it means                                 |
| -------------------- | --- | --------------------------------------------- |
| Working days a month | 26  | Turns a monthly salary into a rate per minute |
| Hours a day          | 8   | The shift, for the same reason                |

Change either and **every wage on the screen above re-prices**, because a
salary is only money per minute once you know how many minutes a month has.

### 4b. The works' own time — the day model

**This is the most consequential group on the screen.** It decides whether a
bigger order is cheaper.

| Setting                            | Now            | What it means                                                                                        |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| **The works' own time is charged** | **By the day** | Per machine minute (the workbook) or by the day the job occupies the works                           |
| A day of the works, Rs             | 20,000         | The whole crew and the bank. **Not** electricity                                                     |
| Make-ready, days                   | 0.75           | The same whatever the order — this is what makes a big order cheaper                                 |
| Machine minutes a day              | 1,606          | Printing, lamination and slitting run at once, so one day absorbs several machines' worth of minutes |
| Kilograms a day                    | 1,945          | Fallback only, for a line with no costed structure                                                   |

```
running days   = total machine minutes ÷ 1,606
occupied days  = 0.75 + running days
works day cost = occupied days × Rs 20,000
```

**By the day replaces the per-minute wages and EMI** — it does not sit on top of
them, which would bill the same people twice. Machine **electricity** is charged
per machine either way, which is what keeps two laminators distinguishable.

> **Why this exists.** In the works' own method everything scales with the
> kilograms, so the only fixed cost on a job was Rs 250 of sundries and
> **doubling the order moved the rate twenty paise.** Their job card records a
> make-ready figure in a box that **no formula on any tab ever charges.** Adding
> it makes 1,000 → 2,000 kg move about **Rs 9.50**, and lifts a 1,000 kg job
> about **Rs 27 a kilogram** — which says the small jobs were being quoted under
> cost.

> **Rs 20,000 and 0.75 days were fitted from the works' own fourteen job sheets,
> not given by the works.** Nothing here is precise until they recognise those
> two numbers. Setting the model back to **By the machine minute** returns the
> whole system to their spreadsheet exactly.

### 4c. Charged on the kilograms

| Setting               | Now      | What it means                                                          |
| --------------------- | -------- | ---------------------------------------------------------------------- |
| Transport, Rs/kg      | 6.80     | On the quantity **consumed** — material brought in, not goods sent out |
| Packing, Rs/kg        | 1.22     | On the quantity consumed                                               |
| Sundries, Rs/job      | 250      | A flat sum the works does not itemise                                  |
| Bank EMI, Rs/month    | 4,166.66 | Recovered across machine time                                          |
| Machine hours a month | 24       | What the EMI is spread over                                            |

> Transport and packing were **Rs 10 and Rs 5** until September 2026. Against
> the works' own spending they median **6.80** (never above 7.00) and **1.22**
> (never above 1.95). Both were corrected **on a date**, so nothing already
> quoted moved.

### 4d. Making a pouch

Charged **per pouch**, because per kilogram cannot say it: across the works'
nine costed pouches the same charge reads between **Rs 11 and Rs 64 a
kilogram**, purely because a small pouch packs 130 to a kilo and a big one 14.

| Setting                     | Now  | Applies to                                                  |
| --------------------------- | ---- | ----------------------------------------------------------- |
| Pouch making, Rs/pouch      | 0.25 | Every style except a D punch                                |
| D punch, Rs/pouch           | 0.60 | A D punch — **instead of** making, not as well              |
| D punch, wide, Rs/pouch     | 0.80 | A D punch over the width below                              |
| A D punch is wide above, mm | 450  | The width at which the rate steps                           |
| Zipper, Rs/metre            | 3.60 | Across the pouch's **mouth**, on a zipper or standup zipper |

> The zipper crosses the **finished** mouth, not the flat film — a standup's
> bottom gusset lengthens the film without widening the mouth.

### 4e. Stations past five

| Setting            | Now  | What it means                      |
| ------------------ | ---- | ---------------------------------- |
| 6th station, Rs/kg | 5.50 | Added when a job runs six stations |
| 7th station, Rs/kg | 7.50 | And again at seven                 |
| 8th station, Rs/kg | 0    | Nothing charged yet                |

They **accumulate**: a seven-station job pays 5.50 + 7.50 = **Rs 13 a
kilogram**. The works' own figures, and the reason the count on a line is real
money.

### 4f. Geometry

| Setting               | Now | What it means                                                            |
| --------------------- | --- | ------------------------------------------------------------------------ |
| Trim, mm              | 15  | Edge trim added to the web width                                         |
| Cylinder mounting, mm | 80  | Cylinder face beyond the printed web that the engraver still charges for |

> The mounting margin is **not** in the works' workbook, which stops at the
> film. On a 700 mm job at seven stations it is **Rs 8,400 of an Rs 81,900
> cylinder charge** — about 4% of the quotation. It was a hardcoded `+ 80` with
> nothing on any screen to show it.

### 4g. Wastage and margin

| Setting                  | Now | What it means                                                       |
| ------------------------ | --- | ------------------------------------------------------------------- |
| Wastage %                | 8   | Film spoiled setting up and running — the Estimation sheet's figure |
| Wastage % on a pouch job | 7   | The pouch workbook's figure                                         |
| Margin %                 | 9   | Added to cost, **not** taken off the rate                           |

**Which wastage applies is decided by the STYLE, not by "is it a pouch":**

```
7%   standup, standup zipper, zipper, D punch      the pouch workbook
8%   centre seal, three side seal, spout, roll     the Estimation sheet
```

> That distinction is load-bearing. All seven of the works' 2022 quotations that
> this system reproduces to the paisa are **centre seal** pouches. A rule reading
> "any pouch" would have moved every one of them onto figures that never priced
> them.

> **The allowance is commercial protection, not a forecast.** The works' own
> September tabs run around 3%. It is deliberately left at 8, because dropping
> it to what a typical job wastes means the first bad run is quoted under cost —
> and they have had a run at 26%.

### 4h. Ink and solvent

| Setting                | Now | What it means                                                    |
| ---------------------- | --- | ---------------------------------------------------------------- |
| Ink GSM                | 1.8 | What a laminate is weighed with — the Estimation sheet's figure  |
| Ink GSM on a pouch job | 1.2 | The pouch workbook weighs with less                              |
| Solvent per 100 of ink | 80  | How much thinner the press adds — 100 parts ink to 80 of solvent |
| Ethyl acetate %        | 50  | Of that solvent. The rest is toluene                             |

> **Ink GSM decides what a pouch weighs**, so it moves the count per kilogram
> and therefore the price each — as well as what the ink costs. Which of the two
> applies is decided by the **style**, exactly as the wastage is: the pouch
> workbook's 1.2 on a standup, zipper or D punch, the Estimation sheet's 1.8 on
> everything else.

---

## 5. Which material prices what

Six dropdowns, each pointing at a row on the Rates screen. Under each one the
screen shows the rate it currently resolves to, or says the row is unpriced.

| Setting                          | Now                             |
| -------------------------------- | ------------------------------- |
| Ink — flat method rate           | Ink — Blended (Estimation)      |
| Adhesive — flat method rate      | Adhesive — Blended (Estimation) |
| Adhesive — per-batch method rate | Adhesive — PU                   |
| Hardener rate                    | Adhesive — Hardener             |
| Ethyl acetate rate               | Solvent — Ethyl Acetate         |
| Toluene rate                     | Solvent — Toluene               |

> **Why these are named here rather than in the code.** They used to be
> hardcoded strings — `'Ethyl Acetate'` against a catalogue row actually called
> `"Solvent — Ethyl Acetate"` — so **every lookup missed and the solvent cost
> nothing on every quotation.** Naming them on a screen makes a mismatch
> visible: the box goes red and says "not on the rate list".

> **Ink and adhesive are named twice on purpose.** The flat method costs the
> whole laydown at one blended rate — Rs 800/kg for ink, Rs 400/kg for adhesive,
> figures that already carry the solvent and the dilution. The per-batch method
> buys the same adhesive at Rs 165 and prices its thinner and hardener
> separately. **One row cannot hold both**, and pointing the flat method at a
> purchase rate understated ink by a quarter — Rs 10.14 a kilogram off the
> quoted rate.

### The adhesive batch and split

| Setting        | Now                    | What it means                                 |
| -------------- | ---------------------- | --------------------------------------------- |
| Adhesive batch | 100:146:15 — 35% solid | adhesive : ethyl acetate : hardener           |
| Adhesive split | 100:189:15             | How the batch is divided into its three parts |

Five dilutions are offered, 30% to 50% solid. The workbook takes the **solids**
from the first and the **split** from the second, which is why they are two
boxes and not one.

---

## 6. The five method switches

Each is a place where the works' workbook does something one way and an
accountant might do it another. **Every one ships set to the workbook**, because
that is the document a quotation is checked against.

| Switch                             | Now               | The alternative                  |
| ---------------------------------- | ----------------- | -------------------------------- |
| **Ink is costed**                  | By GSM × one rate | Per colour, wet, with solvent    |
| **Adhesive is costed**             | By GSM × one rate | As a diluted batch, part by part |
| **EMI is spread over**             | Running time      | Running **and setup** time       |
| **The works' own time is charged** | **By the day**    | By the machine minute            |
| **Margin is taken on**             | Materials only    | The whole cost                   |

Notes on two of them:

**Ink, per colour vs flat.** The workbook costs ink both ways and the two
disagree by **2×** on the same job. Per colour is more accurate — it works out
each colour's laydown, grosses it up for solids because only the pigment stays
on the film, and prices the thinner. The flat method is what the works' headline
figure is built from.

**Margin on materials only.** This is the one that looks like an oversight and
is not. Every other figure is a cost the works can point at and buy; the margin
is taken on what was bought and converted. It leaves the labour, the power, the
transport and the packing **recovered at cost and earning nothing** — on the
reference job, Rs 11,269 of effort for no return. Switching to the whole cost
earns on the effort too. It is one click, and it is the works' decision.

**The works' own time** is covered in §4b — it is the switch that decides
whether a bigger order is cheaper.

---

## 7. Saving, and what happens to old quotations

**Nothing already quoted moves.** This is the most important behaviour on the
screen and it is invisible.

Saving records each changed figure against **today's date**. A quotation is
costed on the figures in force **on its own date**, so:

- A quotation dated March 2022 still prices at March 2022's transport, packing,
  ink rate and EMI.
- A quotation dated today picks up what you just saved.

> The works' own sheets change the blended ink rate from **Rs 800 to Rs 600**
> and the bank EMI from **Rs 4,166.66 to Rs 10,000** between March and July 2022. Both are one-off changes on a date, not figures that vary job to job —
> and the seven 2022 quotations this system reproduces to the paisa depend on
> being priced at the right one.

The screen **does not offer to rewrite what a figure was months ago**, on
purpose: that is the basis of quotations already sent.

To check nothing has broken after an edit:

```bash
npm run seed:old-quotations -w @yuva/api
```

**Seven of seven exact** means the change did what you meant and nothing else.

---

## 8. What is NOT on this screen

Honest gap, recorded so nobody hunts for these. The API accepts all of them —
there is simply no input rendered.

| Setting                       | Now                     | What it decides                                                             |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| Adhesive GSM                  | 2.5                     | The flat method's adhesive coat                                             |
| Adhesive coat, thin / thick   | 2 / 3                   | The per-bond coat, and which ply counts as thick                            |
| Thick ply above, µ            | 40                      | Where that step falls                                                       |
| Cylinder rate, Rs/cm²         | 2.50                    | What the engraver charges                                                   |
| GST %                         | 18                      | On material and cylinders                                                   |
| Material / cylinder advance % | 70 / 100                | Taken on the GST-inclusive value                                            |
| Ink material (flat preview)   | Ink — Black             | Used by the form's live material cost                                       |
| Default PET / MET PET         | PET 12µm / MET PET 12µm | Seed defaults                                                               |
| Job sheet defaults (seven)    | —                       | Electricity/day, transport, pouching, EMI/day, profit %, wastage %, yield % |

**Cylinder rate, GST and the two advances can still be set per quotation**, so a
one-off is not blocked.

> **Ink GSM used to head this list** and no longer does. It decides what a pouch
> weighs, so it moves the price of every pouch — and only the pouch variant had
> a box, which read as though 1.8 were a constant rather than the Estimation
> sheet's figure. Both are now in §4h.

---

## 9. Still owed by the works

1. **Laminator 2's real figures** — speed, horsepower, tariff, setup.
2. **Rs 20,000 a day and 0.75 days of make-ready.** Fitted, not given. Every
   rate in the system now rests on them.
3. **Whether the eight spot inks get their own laydown.** If they do, the
   special-colour rate moves from **Rs 235 to Rs 510**.
4. **A lamination wage** — currently nobody is paid for it, matching their
   sheet. Restoring the two retired roles is worth 48 paise a kilogram.

---

## 10. Every figure, at a glance

| Setting                        | Now                                     |
| ------------------------------ | --------------------------------------- |
| Working days a month           | 26                                      |
| Hours a day                    | 8                                       |
| The works' own time is charged | By the day                              |
| A day of the works             | Rs 20,000                               |
| Make-ready                     | 0.75 days                               |
| Machine minutes a day          | 1,606                                   |
| Kilograms a day                | 1,945                                   |
| Transport                      | Rs 6.80/kg                              |
| Packing                        | Rs 1.22/kg                              |
| Sundries                       | Rs 250/job                              |
| Bank EMI                       | Rs 4,166.66/month over 24 machine hours |
| EMI is spread over             | Running time                            |
| Pouch making                   | Rs 0.25/pouch                           |
| D punch                        | Rs 0.60/pouch, Rs 0.80 above 450 mm     |
| Zipper                         | Rs 3.60/metre                           |
| 6th / 7th / 8th station        | Rs 5.50 / 7.50 / 0 per kg               |
| Trim                           | 15 mm                                   |
| Cylinder mounting              | 80 mm                                   |
| Wastage                        | 8%, or 7% on a workbook pouch           |
| Margin                         | 9%, on materials only                   |
| Ink GSM                        | 1.8, or 1.2 on a workbook pouch         |
| Solvent per 100 of ink         | 80, half ethyl acetate                  |
| Ink is costed                  | By GSM × one rate                       |
| Adhesive is costed             | By GSM × one rate                       |
| Adhesive batch / split         | 100:146:15 (35% solid) / 100:189:15     |
