# Before the first quotation

What has to be on record before the system can price a job — in the order it has
to go in, with the figures from the works' own estimation sheet as the example.

Written for somebody starting with an empty database. Roughly ninety minutes of
typing, once.

The arithmetic behind every figure here is set out in
[`formulas.md`](./formulas.md).

---

## The order is not a suggestion

Each thing below is priced using the one before it. A film cannot be priced
before the film exists; a rate cannot be worked out before the press it runs on
is on record. Work down the list and nothing will be missing at the end.

```
1. Machines → 2. Wages → 3. Films → 4. Inks → 5. Adhesive & solvent
             → 6. Overheads → QUOTATION
```

| Stage | What                 | Where          | How many entries      |
| ----- | -------------------- | -------------- | --------------------- |
| 1     | Machines             | Costing screen | 3                     |
| 2     | Wages                | Costing screen | 5                     |
| 3     | Films                | Rates screen   | about 6               |
| 4     | Inks                 | Rates screen   | 4                     |
| 5     | Adhesive and solvent | Rates screen   | 6                     |
| 6     | Overheads            | Costing screen | none — a read-through |

Stage 6 is not data entry. Every setting already holds the works' own figure;
the job there is to check them against what the works actually spends.

---

## 1. The machines

**Costing screen.**

Three machines, because a laminate touches three. Each needs its connected load,
what the electricity board charges for that load, how fast it runs, and how long
it takes to set before it runs.

| Machine           | Process    |  HP | Rs / HP-hour | Speed    | Setup  |
| ----------------- | ---------- | --: | -----------: | -------- | ------ |
| Rotogravure press | Printing   |  30 |         9.00 | 65 m/min | 60 min |
| Laminator         | Lamination |   6 |        35.00 | 70 m/min | 30 min |
| Slitter           | Slitting   |   3 |        60.00 | 80 m/min | 30 min |

**The press's 30 HP is the main drive alone.** Its three 12 HP station motors
go in beside it — `Each station adds 12`, `Motors come on at colour 3,4,6` —
because the press does not draw its whole load on every job: two colours draws
30 HP, seven draws 66.

There is a fourth figure, **setup power**, which asks how much load a machine
draws while it is being threaded rather than running. It starts at **zero**,
which is what the estimation sheet assumes — the operator is paid for that hour
but the press is not billed for it.

---

## 2. The wages

**Costing screen.**

A monthly salary and which machine that person stands at. The system turns it
into a rate per minute using the working month from stage 6, and charges it for
the whole time the machine is occupied — running _and_ being set.

| Role               | Works on | Monthly | Per minute |
| ------------------ | -------- | ------: | ---------: |
| Printing Operator  | Printing |  25,000 |     2.0032 |
| Printing Assistant | Printing |  13,000 |     1.0417 |
| Printing Helper    | Printing |   8,000 |     0.6410 |
| Slitting Operator  | Slitting |  12,000 |     0.9615 |
| Slitting Helper    | Slitting |   8,000 |     0.6410 |

> **The `3,4,6` on the press is when its station motors switch on.** The press
> draws 30 HP on its own and 12 HP more at the third, fourth and sixth colour,
> so a two-colour job is not charged a full press. See
> [`stations.md`](./stations.md) for what a station is and how the count for a
> job is decided.

> **Retiring is asked about, and a retired name can be added back.** Taking a
> machine or a wage out of the costing drops the rate on every quotation costed
> afterwards, so it asks first. The row stays, greyed, with a Restore beside it —
> and typing the same name again brings that row back with whatever figures you
> just entered, rather than refusing it.

> **There is no lamination wage here, and that is deliberate.** The estimation
> sheet has no line for one, so following it means the laminator runs unattended
> on paper. In fact somebody stands there for about 86 minutes on a 500 kg job.
> Adding an operator and a helper puts the rate up by roughly **48 paise a
> kilogram**. Add them if that is right for the works — the decision is on the
> Costing screen, not in the code.

---

## 3. The films

**Rates screen → Add a material.**

Every film the works buys, with its **density** and its price. Density is the
figure people forget, and it is the one that decides how many pouches come out
of a kilogram — a micron of PET weighs half as much again as a micron of poly.

**Name the film with its gauge.** `PET 12µm` and `PET 19µm` are two materials at
two prices, and the name is what the system reads the thickness from. A film
named without one — `PP Woven`, sold by GSM — is priced at its rate whatever
thickness is quoted.

| Film           | Density g/cm³ | Rs / kg | Where it sits                          |
| -------------- | ------------: | ------: | -------------------------------------- |
| PET 12µm       |          1.40 |     185 | Printed outer ply, on almost every job |
| MET PET 12µm   |          1.40 |     180 | Metallised barrier, middle ply         |
| W/O Poly 110µm |          0.94 |     163 | White-opaque sealing ply               |
| PE 60µm        |          0.94 |     190 | Plain sealing ply                      |

**Only the films the works actually quotes.** The catalogue shipped with eleven —
BOPP, foil, POF, PP woven, PVC/PETG and three more gauges — and none of them
appears on a single one of the client's own quotations, so they were deleted
rather than left as eight rows of noise on a screen the office reads every
morning. **Add a material** puts one back in a few seconds when a job needs it,
and the density examples above are the ones worth having to hand: PET 1.40,
poly 0.94, BOPP 0.91, foil 2.70.

> **Deleting is for a mistake, and it always asks.** A name typed wrong, a film
> added and thought better of — the bin on each Rates row, and on each Inventory
> row too. A material on a **quotation** or a **purchase order** is refused and
> says which, because those have to stay able to say what they were priced on;
> take that one off the price list instead. A material **holding stock** is
> deleted from Inventory, where the dialog names the quantity and batch count
> that go with it. Suppliers work the same way on the Purchase screen: one
> nobody has ordered from goes, one with orders is retired.

**Rates keep their history.** When a price rises, type the new one — the old
figure stays on record against its date, so a quotation already sent keeps the
margin it was made on.

---

## 4. The inks

**Rates screen → Add a material.**

Each colour needs two figures beyond its price. **Laydown** is how many grams of
dry ink go on a square metre. **Solids** is how much of the tin stays there — the
rest evaporates and still has to be bought.

| Ink           | Kind    | Laydown g/m² | Solids | Rs / kg |
| ------------- | ------- | -----------: | -----: | ------: |
| Ink — Cyan    | Process |         0.14 |  19.5% |     217 |
| Ink — Magenta | Process |         0.13 |  19.5% |     235 |
| Ink — Yellow  | Process |         0.13 |  19.5% |     202 |
| Ink — Black   | Process |         0.15 |    23% |     202 |

At 23% solids the works buys about **4.3 kg of liquid for every kilogram that
stays on the film**. That is why costing a laydown against the purchase price
understates ink three to five times over.

---

## 5. Adhesive and solvent

**Rates screen → Add a material.**

Here is the one thing in this document that looks like a mistake and is not.
**The same drum has two prices**, because the works' own workbook costs a job two
ways and only one of them buys the drum directly.

| Material                        | Rs / kg | Solids | What it is                                                                              |
| ------------------------------- | ------: | -----: | --------------------------------------------------------------------------------------- |
| Ink — Blended (Estimation)      |     800 |      — | Not a tin you buy. One rate covering the whole ink laydown, solvent and losses included |
| Adhesive — Blended (Estimation) |     400 |      — | The same idea: the made-up batch, not the drum                                          |
| Adhesive — PU                   |     165 |    80% | What the drum actually costs                                                            |
| Adhesive — Hardener             |     365 |    75% | Third part of the batch                                                                 |
| Solvent — Ethyl Acetate         |     125 |      — | Thinner, and part of the adhesive batch                                                 |
| Solvent — Toluene               |      95 |      — | The other half of the press mix                                                         |

**Which of the two gets used is a setting, not a guess.** The works runs the
_flat_ method, so the two blended rates are what price every quotation, and the
four below them sit ready for the day somebody switches to the detailed method on
the Costing screen. Both are right; they are answers to different questions.

---

## 6. The overheads

**Costing screen.**

Already filled in with the works' own figures, so this stage is a **read-through,
not a data-entry job**. Check each one against what the works actually spends and
move whatever has drifted.

| Figure                  | Set to          | What it decides                                    |
| ----------------------- | --------------- | -------------------------------------------------- |
| Working days a month    | 26              | Turns a salary into a rate per minute              |
| Hours a day             | 8               | The shift, for the same reason                     |
| Wastage                 | 8%              | Film spoiled setting up and running                |
| Margin                  | 9%              | Added to cost — set per quotation too              |
| Trim                    | 15 mm           | Added to the web width                             |
| Transport               | Rs 10 / kg      | On the quantity consumed — per quotation too       |
| Packing                 | Rs 5 / kg       | On the quantity consumed                           |
| Sundries                | Rs 250 / job    | A flat sum the works does not itemise              |
| Bank EMI                | Rs 4,166.66     | Spread over 24 machine hours a month               |
| Pouch making            | Rs 15 / kg      | Nothing on a roll — per quotation too              |
| 6th / 7th / 8th station | 5.50 / 7.50 / 0 | Surcharge past five colours                        |
| Ink GSM                 | 1.8             | What the laminate is weighed with                  |
| Adhesive coat           | 2 or 3          | 3 above 40µ, 2 below, per bond                     |
| Cylinder rate           | Rs 2.50 / cm²   | What the engraver charges                          |
| Cylinder mounting       | 80 mm           | Face beyond the web, also charged for              |
| GST                     | 18%             | On material and cylinders alike                    |
| Advance                 | 70% / 100%      | Material and cylinders, on the GST-inclusive value |

> **Three of these are set per quotation when a job is not the ordinary case.**
> Margin, transport and pouch making each have a box on the Jobs step; left
> blank they follow the figures here. The client's own seven old sheets set all
> three by hand — margins of 5%, 9% and 10%, transport at Rs 5 and Rs 10, and
> nothing charged for pouch making on the jobs sold as reels.

> **The margin is taken on materials only.** That is what the workbook does, and
> it is why the margin per kilogram does not change between 500 kg and 5,000 kg —
> material cost per kilogram is the same at any volume. Only the press setup gets
> spread wider, which moves the rate about 38 paise. There is a setting to earn
> margin on the whole cost instead, if that is ever wanted.

---

## What goes wrong quietly

Most gaps announce themselves: the rate box refuses and names what is missing.
**Three do not.** They produce a number that looks entirely normal and is too
low.

| If this is missing         | What happens                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **No laminator on record** | Lamination costs nothing. The job is still quoted, just without the machine that laminates it. Same for the slitter. |
| **No wage for a process**  | That machine runs with nobody paid to stand at it. This is exactly what the estimation sheet does with lamination.   |
| **A film with no density** | The pouch is weighed with a stand-in figure instead. On PET over poly that is about 9% out; on foil it is far worse. |

A fourth is worth listing even though it _is_ caught, because it is the easiest
to miss when setting up and the largest: **a blended rate left unpriced**. The
rate refuses and names it.

### The check that catches all of them

Once everything is entered, price the works' own Anupriya job — **500 kg,
700 × 600 mm, PET 12µ over W/O Poly 110µ, seven stations**. It should come out at
**Rs 263.40 a kilogram** and **Rs 13.83 a pouch**. If it does, every figure above
is in the right box.

---

## Then, the quotation itself

Everything above is entered once. This is what happens on every job afterwards,
and it is the only part the office repeats.

1. **The customer.** Pick an existing company or type a new one. A new company is
   added to the customer list as the quotation saves, so the next enquiry finds
   it.

2. **The job.** Name it, say whether it is a roll or a pouch, and which pouch
   style. Then the finished size — and the gusset depths if it stands.

3. **The structure.** Choose each ply from the film list and give its thickness.
   The rate and density come with the film; nothing is typed twice.

4. **Colours and cylinders.** How many stations the job occupies. The lanes and
   the repeat are suggested from the size and can be overridden — and a repeat
   order on an existing design is quoted with no cylinder charge at all.

5. **The quantities.** One, two or three. Each one has **both units side by
   side** — `500 kg = 21,565 pouches` — so an order taken as "five hundred kilos"
   and one taken as "a lakh pouches" are both typed in as they were said, and the
   other half fills itself in. Three quantities is how a customer sees what a
   bigger order is worth.

6. **The rate arrives on its own.** No button to press. Change the film or the
   quantity and it moves with them. Type over it and what you typed stays until
   something genuinely changes the cost.

   The rate is a pair too — `Rs. 281.24 per kg = Rs. 6.5208 per pouch` — so a
   customer haggling in the unit they buy ("make it six-fifty and we'll take
   it") is answered by typing six-fifty. Underneath sits what the order comes to
   and what one pouch weighs.

7. **Check the working, then send.** The ⓘ beside the rate opens the full
   calculation — every ply, every machine's minutes, the chain from material cost
   to the price — and downloads as a spreadsheet laid out like the works' own
   sheet, with live formulas.

---

## Seeding it instead of typing it

Two scripts do stages 1 to 5 in one go, for a database starting empty:

```bash
npm run seed:materials -w @yuva/api      # the film, ink and adhesive catalogue
npm run seed:costing -w @yuva/api        # machines, wages, ink laydowns and solids
npm run seed:excel-rates -w @yuva/api    # the workbook's own rates, and the two blends
```

`seed:materials` and `seed:costing` never overwrite a figure already on record.
`seed:excel-rates` **does** — that is its purpose — but rates are append-only, so
the previous figure stays on the Rates screen against its own date.

Every figure they load is from a **March 2022** sheet. Check them against a
recent invoice before a real quotation goes out on them.
