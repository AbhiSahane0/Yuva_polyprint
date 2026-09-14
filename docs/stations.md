# Printing stations

_What a station is, what decides how many a job has, and what each one costs._

Related: [`formulas.md`](./formulas.md) · [`setup.md`](./setup.md) ·
[`old-quotation-check.md`](./old-quotation-check.md)

---

## 1. What a station is

One **printing unit** on the rotogravure press: one engraved cylinder, one ink
tray, one doctor blade, one impression roller, and its own drive motor. The web
runs through them in series and picks up one colour at each. An eight-station
press is eight of those in a row.

So a station is **a colour on the press** — physically occupied, inked and
turning.

It is deliberately **not** "how many inks were priced". The works' own sheet
counts seven stations on a job it prices four inks for, because the seventh unit
is threaded and running whether or not its ink appears in the costing.

## 2. Where the number comes from

The **Cylinders** box on the quotation line. One cylinder per station, so that
figure _is_ the station count.

| Situation                           | What fills it                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Repeat design**, picked from Jobs | The design's recorded cylinder count, automatically. **Charge cylinders** also switches off — they are already engraved |
| **New design, existing customer**   | Starts at **4**; the office overtypes it                                                                                |
| **New customer, new job**           | The same                                                                                                                |

**Nothing in the app infers it.** That `4` is a hard default in the form, not a
calculation — a starting position and nothing more.

## 3. The rule the works follows

**One cylinder per colour, and white counts as a colour.**

| The design register says                      | Cylinders |
| --------------------------------------------- | --------: |
| `CMYK`                                        |         4 |
| `CMYK & Brown`                                |         5 |
| `CMYK & White`                                |         5 |
| `CMYK Orange and White`                       |         6 |
| `Black, Brown, Magenta, Orange, Green, White` |         6 |
| `Cyan`                                        |         1 |

Counting the colours in the note reproduces the recorded cylinder figure on
**274 of 301 imported jobs (91%)**; the remainder are typing quirks — a note
that reads only "6", or "Blank". There is no hidden trade rule, no allowance and
no spare station. **Colours = cylinders = stations.**

## 4. What the works' own history says is normal

Across the 420 jobs imported from the client's register:

| Cylinders | Jobs |                                                   |
| --------: | ---: | ------------------------------------------------- |
|       1–3 |   51 | commodity and masala packs, flat shades           |
|         4 |   55 | plain CMYK                                        |
|     **5** |   79 | CMYK + white, or four flat shades + white         |
|     **6** |  125 | **most common** — CMYK + white + one brand colour |
|         7 |   38 |                                                   |
|         8 |   19 |                                                   |

Median **5**, most common **6**, mean **5.2**. 70% of the notes say CMYK, and
**49% explicitly mention White**.

The form's default of 4 therefore sits **below** both the median and the mode.

## 5. Deciding it at enquiry, with no artwork

The count does not come from an artwork file. It comes from three questions,
all answerable on the phone before anything is designed.

**1. Photographic, or flat shades?**
A pack carrying a photograph of the product needs the **CMYK** process set — 4.
A pack with a logo and two solid colours needs only those — 2 or 3.

**2. Is there a printed white?**
Half of all jobs, and the one people forget. Printing on **MET PET or clear
PET**, the pack shows metal or see-through behind the ink, so a white base coat
is laid first: **+1 station**. On white-opaque poly the film is already white
and no white station is needed.

**3. Any brand colour that must match exactly?**
A company's own red or green that CMYK cannot hit is a spot colour: **+1 each**.
This is what turns a 5 into a 6.

Add them up. That is the whole method, and it is the same one the register
records.

## 6. What each station costs

Three separate charges, and they are independent of each other.

### Electricity — the station motors

The press is **30 HP of main drive** plus a **12 HP motor per station**, and the
sheet does not switch them all on at once: they come in at the **3rd, 4th and
6th** colour. That is the `3,4,6` on the press's card in Costing.

| Stations | Press draws | Rs / running minute |
| -------- | ----------- | ------------------: |
| 1–2      | 30 HP       |                4.50 |
| 3        | 42 HP       |                6.30 |
| 4–5      | 54 HP       |                8.10 |
| 6, 7, 8  | 66 HP       |                9.90 |

Only three motors ever switch on, so a 7- and 8-station job draws the same 66 HP
as a 6-station one. Setup minutes draw nothing — `setupPowerFactor` is 0, since
a press being threaded is not running at its connected load.

### The per-kg surcharge, from the sixth station up

Flat additions to the rate per kilogram, cumulative: **6th +Rs 5.50 · 7th
+Rs 7.50 · 8th +Rs 9.00**. Five stations or fewer pay none.

### The cylinders themselves

One cylinder per station, on its own line of the document rather than in the
per-kg rate. On a 700 mm × 600 mm single-lane job that is **Rs 11,700 each**. A
design whose cylinders already exist is charged nothing.

Adding a station does not change the cylinder's size, only how many are cut — so
the face and circumference limits (450–1060 mm and 400–600 mm) are a question
about the design and the repeats, not about the station count.

### Together, on a 500 kg job of 254.78 running minutes

| Stations | Electricity/kg | Surcharge/kg |  Together | Cylinders |
| -------: | -------------: | -----------: | --------: | --------: |
|        2 |           2.29 |            — |  **2.29** |    23,400 |
|        4 |           4.13 |            — |  **4.13** |    46,800 |
|        5 |           4.13 |            — |  **4.13** |    58,500 |
|        6 |           5.04 |         5.50 | **10.54** |    70,200 |
|        7 |           5.04 |        13.00 | **18.04** |    81,900 |
|        8 |           5.04 |        22.00 | **27.04** |    93,600 |

None of it is marked up — margin is taken on materials only, so a station passes
through at cost. The electricity column scales with running minutes; the
surcharge column is the same on every job.

## 7. What getting it wrong costs

It runs one way: **under-quoting**. On the 500 kg job above —

| Quoted     | Actually printed | Shortfall                                       |
| ---------- | ---------------- | ----------------------------------------------- |
| 4 stations | 6                | ~Rs 5,200 on the rate + Rs 23,400 cylinders     |
| 4 stations | 7                | ~Rs 7,000 on the rate + **Rs 35,100 cylinders** |

The second is about **20% of the order value**, and the cylinder half is cash
the engraver charges whether or not the customer agreed to it.

**Quote the count from the brief, never from the default.** Where the customer
genuinely cannot say, quote what the pack type implies — for a printed laminated
food pouch on MET PET that is realistically **5 or 6**, not 4.

## 8. Where each figure is edited

|                               |                                |
| ----------------------------- | ------------------------------ |
| 30 HP, 12 HP/station, `3,4,6` | Costing → the press            |
| 6th / 7th / 8th surcharge     | Costing → overheads            |
| Cylinder rate per cm²         | Costing → overheads            |
| Stations on this job          | Quotation line → **Cylinders** |

The `3,4,6` is the one worth knowing about: it is the operator's statement of
when each motor is actually switched on. If the works rewires so a motor comes
on at the eighth too, it becomes `3,4,6,8` and every eight-station quotation
gets dearer — with no change to the code.
