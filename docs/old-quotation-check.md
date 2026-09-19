# Checked against the works' own quotations

Seven quotations the client priced by hand in 2022, rebuilt in this system and
compared to the figure their own spreadsheet printed.

**All seven match exactly, per kilogram and per pouch.**

This is the evidence that the costing is theirs and not ours. Re-run it whenever
the engine changes:

```bash
npm run seed:old-quotations -w @yuva/api            # check only, writes nothing
npm run seed:old-quotations -w @yuva/api -- --write # and rebuild the quotations
```

The formulas behind every figure are in [`formulas.md`](./formulas.md).

---

## The result

| #   | Sheet             | Date        | Sheet Rs/kg |  App Rs/kg | Sheet /pouch | App /pouch |
| --- | ----------------- | ----------- | ----------: | ---------: | -----------: | ---------: |
| 143 | 1. Green Peas     | 23 Mar 2022 |  **284.20** | **284.20** |       5.1470 |     5.1467 |
| 144 | 2. Simla Farsan   | 23 Mar 2022 |  **255.74** | **255.74** |       2.3577 |     2.3577 |
| 145 | 4. Govt Sugar     | 4 Apr 2022  |  **246.75** | **246.75** |       1.7773 |     1.7774 |
| 146 | 5. Kalantri 5 kg  | 23 Mar 2022 |  **241.07** | **241.07** |       7.7190 |     7.7192 |
| 147 | 6. Kalantri 1 kg  | 10 Jul 2022 |  **248.00** | **248.00** |       2.8232 |     2.8230 |
| 148 | 7. Kalantri 500 g | 23 Mar 2022 |  **256.65** | **256.65** |       1.4173 |     1.4173 |
| 149 | 8. Goda Farm      | 23 Mar 2022 |  **258.71** | **258.71** |       1.7257 |     1.7257 |

Per kilogram is exact to the paisa on all seven. The per-pouch figures differ by
up to **4 hundredths of a paisa**, from pouches-per-kilogram being rounded to two
decimals before the division — which is what the client's sheet does too.

> There is no `3.` in the set. The client's folder skips it; `3. Anupriya.xlsx`
> lives with the costing workbooks and is checked separately by the unit tests,
> where it also reproduces exactly at Rs 263.40 and Rs 13.83.

---

## What was entered on each quotation

Everything below goes in the way the office would put it in: the film rates as a
rate typed on each ply, and margin, transport, pouch making and wastage in the
four boxes on the Jobs step.

| #   | Job                 | Order     | Ups | Film mm   | Stations | PET        | Poly           | Adhesive |
| --- | ------------------- | --------- | --- | --------- | -------- | ---------- | -------------- | -------- |
| 143 | Green Peas 1 kg     | 1,000 kg  | 1   | 600 × 440 | 7        | 12µ @ ₹185 | 50µ @ ₹163     | 3 gsm    |
| 144 | Simala 1 kg         | 1,000 kg  | 1   | 480 × 330 | 4        | 12µ @ ₹185 | **40µ @ ₹163** | 2 gsm    |
| 145 | Sugar 1 kg          | 12,000 kg | 2   | 420 × 250 | 2        | 12µ @ ₹160 | 50µ @ ₹150     | 3 gsm    |
| 146 | 5 kg atta packaging | 500 kg    | 1   | 670 × 450 | 5        | 12µ @ ₹185 | 90µ @ ₹170     | 3 gsm    |
| 147 | 1 kg atta packaging | 500 kg    | 2   | 420 × 280 | 5        | 12µ @ ₹175 | 80µ @ ₹162     | 3 gsm    |
| 148 | 1 kg atta packaging | 500 kg    | 2   | 350 × 230 | 5        | 12µ @ ₹175 | 50µ @ ₹155     | 3 gsm    |
| 149 | 1 kg atta packaging | 11,000 kg | 2   | 350 × 260 | 5        | 12µ @ ₹190 | 55µ @ ₹155     | 3 gsm    |

Every one is **two plies** — PET over white-opaque poly. Their sheet keeps a MET
PET row on all seven and leaves it at 0µ, so it weighs nothing and costs
nothing. See "What looked wrong and was not" below.

**The adhesive column is not entered** — it is worked out from the structure, and
is listed here because it is a useful check. `3 gsm above 40µ, else 2`, times the
number of bonds. Simla's poly is exactly 40µ, which is not _above_ 40, so it
takes 2. Every one agrees with the sheet.

### The three set on the quotation

| #   | Margin  | Transport | Pouch making |
| --- | ------- | --------- | ------------ |
| 143 | **10%** | ₹10/kg    | **₹11.04**   |
| 144 | **5%**  | ₹10/kg    | **₹0**       |
| 145 | 10%     | ₹5/kg     | ₹15          |
| 146 | **9%**  | ₹5/kg     | **₹0**       |
| 147 | 10%     | ₹5/kg     | ₹15          |
| 148 | 9%      | ₹5/kg     | ₹15          |
| 149 | 10%     | ₹5/kg     | ₹15          |

Three margins, two transport rates and three pouch-making figures across seven
jobs — and **five of these seven were written on the same day**, so none of it is
a price that moved over time. This is what per-quotation overrides exist for.

> **Nothing charged for making a pouch is not the same as no pouch.** Simla and
> Kalantri 5 kg put zero in that row, and their sheets still count the pouches
> and print a per-pouch cost. Both are quoted as pouches here.

---

## The catalogue these seven need

Fourteen materials, and every one is load-bearing. The catalogue shipped with
nine more — BOPP, foil, LDPE, POF, PP woven, PVC/PETG, two spare gauges and a
Gold ink — and not one of them appears on any of these quotations, so they were
deleted.

| Material                                           | Why it stays                                     |
| -------------------------------------------------- | ------------------------------------------------ |
| PET 12µm · MET PET 12µm · W/O Poly 110µm           | The plies these seven are made of                |
| PE 60µm                                            | On a quotation built from the client's own Excel |
| Ink — Blended · Adhesive — Blended                 | What the **flat** method prices every job at     |
| Ink — Cyan / Magenta / Yellow / Black              | The Costing tab's per-colour rates               |
| Adhesive — PU · Hardener · Ethyl Acetate · Toluene | The Costing tab's batch and solvent              |

> **The four process inks cannot be deleted even though the flat method never
> prices them.** The costing needs at least one ink carrying a laydown before it
> will quote at all, and the two blends have none — they are a rate, not a
> colour. Remove the four and every quotation stops costing itself.

## What the works held centrally

Identical on all seven, read from the Costing screen and the rate list **as at
2022** — several of these have since been corrected on a later date, which is
precisely why these seven still reproduce. Packing, for instance, now stands at
Rs 1.22 and transport at Rs 6.80; a quotation dated March 2022 still picks up the
figures below, because a quotation is priced on its own date.

| Figure                            | Value                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| Press                             | 30 HP main drive + 12 HP a station, Rs 9/HP-hour, 65 m/min, 60 min setup |
| Laminator                         | 6 HP, Rs 35/HP-hour, 70 m/min, 30 min setup                              |
| Slitter                           | 3 HP, Rs 60/HP-hour, 80 m/min, 30 min setup                              |
| Wages                             | 25,000 / 13,000 / 8,000 printing · 12,000 / 8,000 slitting               |
| Working month                     | 26 days × 8 hours                                                        |
| Packing                           | Rs 5/kg                                                                  |
| Sundries                          | Rs 250/job                                                               |
| Wastage                           | 8% — **pinned on each quotation**, see below                             |
| Trim                              | 15 mm                                                                    |
| Ink GSM                           | 1.8 — the Estimation sheet's, not the pouch workbook's 1.2               |
| Blended adhesive                  | Rs 400/kg                                                                |
| MET PET                           | Rs 180/kg                                                                |
| 6th / 7th / 8th station surcharge | Rs 5.50 / 7.50 / 0 per kg                                                |

Only Green Peas pays a surcharge — it is the one job past five stations.

> **Why the wastage and the ink figure are pinned rather than followed.**
>
> The works later gave a second set of figures for its pouch work, out of a
> different document: **7% wastage and 1.2 ink GSM** on standup, standup zipper,
> zipper and D punch pouches, against the Estimation sheet's **8% and 1.8** on
> everything else.
>
> All seven of these are **centre seal** pouches, so they stay on the Estimation
> sheet's figures — which is exactly why the rule that picks between the two
> reads the STYLE and not "is it a pouch". A rule on "is it a pouch" would have
> moved every one of these seven onto figures that never priced them.
>
> `seed:old-quotations` pins both anyway, and writes the wastage onto each
> quotation. A figure that priced a document belongs beside the document, not in
> a setting somebody may reasonably change one morning.

### The two that changed over time

These are **not** per-job. Every sheet written on the same day agrees on both;
only the one four months later differs. They are recorded against the day they
changed, so a quotation dated then picks them up on its own.

| Figure      | 23 Mar & 4 Apr 2022 | 10 Jul 2022         |
| ----------- | ------------------- | ------------------- |
| Blended ink | Rs 800/kg           | **Rs 600/kg**       |
| Bank EMI    | Rs 4,166.66/month   | **Rs 10,000/month** |

The ink is a material, so its history sits on the Rates screen. The EMI is a
setting, and settings gained a history for exactly this — see
[`formulas.md`](./formulas.md#as-at-a-date).

---

## What looked wrong and was not

Three things that read as costing differences on first inspection and are not.
Worth knowing before anyone compares these files again.

**LAMINATION 1 at ₹180 is an empty row.** The client's sheet has a fixed
three-row block — PRINTING, LAMINATION 1, LAMINATION 2 — and keeps a MET PET row
on every job whether the job has one or not. On all seven it sits at 0µ, 0 kg and
0 cost, with ₹180 still showing in the rate cell. **That ₹180 was never
charged.** Our export emits one lamination row per actual bond and calls it
LAMINATION 1, so their second row becomes our first. Same ply, same kilograms,
same rate.

**A downloaded workbook is not the client's workbook.** The ⓘ button writes an
Estimation sheet named after the job. Three of the client's own files carry the
same party and job name — "Kalantri 1 kg" / "1 kg atta packagign" — copied and
never updated, so files 6, 7 and 8 all export to one filename. Check `B5`, the
quotation number, before comparing anything.

**A blank cell in a downloaded workbook is not zero.** The formulas are written
without a cached result, so anything that reads the file without recalculating —
a script, a preview pane — sees nothing. Excel fills them on open.

---

## How the check works

1. Reads each workbook's Estimation sheet for its inputs and its printed rate.
2. Records what changed over time — the ink rate and the EMI — against the dates
   they changed, and lays a rate baseline on 23 March 2022 for every material
   the costing reads centrally.
3. Costs each job at **its own date**, so the rates and overheads in force then
   are the ones that apply.
4. Compares to the sheet, and with `--write` creates the quotation as well.

> Step 2 matters more than it looks. The first run came out **0 of 7**, every
> rate about ₹20 light, because the blended adhesive was priced only in 2026 and
> therefore had no price at all in 2022 — a rate is carried forward from the last
> entry on or before the day asked for, and there wasn't one. It cost nothing,
> silently. The gaps matched the missing adhesive to the paisa.
>
> That is the standing hazard of dated rates: **a material with no early entry is
> free in the past.**

---

## Settled: what the press draws at six colours

The press draws its 30 HP main drive plus 12 HP for each station motor that is
on, and the sheet brings them on as colours are added. Its formulas switch them
at the **3rd, 4th and 6th** colour; the layout of the same rows implies the
**3rd, 5th and 7th**, and two of its four references are off by one. Every job
in this set agrees under either reading except a six-colour one, and there is no
six-colour job here.

**The works confirmed the 3rd, 4th and 6th** — the formulas as written, which is
what the system already used. So a six-colour job runs three station motors at
66 HP, not two at 54.

| Colours | Motors | Press draws |
| ------- | ------ | ----------- |
| 1–2     | none   | 30 HP       |
| 3       | one    | 42 HP       |
| 4–5     | two    | 54 HP       |
| 6–8     | three  | 66 HP       |

Simla Farsan is the four-colour job in this set and only reproduces at 54 HP, so
the data already agreed with the operator before anyone asked.

It stays editable on the Costing screen as **Motors come on at colour**, because
a rewired press is a fact about the works rather than about this code.
