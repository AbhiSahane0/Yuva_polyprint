# The five jobs on the system, and how each one got where it is

Everything on the screens right now was put there by one script, and that
script does nothing by hand: it prices through the costing engine, wins a
quotation the way the office wins one, raises the card, starts the run, costs
the sheet and loads the lorry — each through the same code the buttons call.
If any of it were wrong, the script would not have finished.

Read this with the system open beside you. Every figure below is on a screen.

---

## The five, at a glance

| Quotation | Customer           | What it is                            | Quantity         | Rate             | Where it has got to                    |
| --------- | ------------------ | ------------------------------------- | ---------------- | ---------------- | -------------------------------------- |
| **#119**  | Samant Foods       | Chitra Wafers — **printed reel**      | 1,000 / 2,000 kg | ₹313 / ₹305 a kg | **Draft.** Priced, not sent            |
| **#120**  | Vedant Fertilizers | Nutrilex — **flat bottom**            | 400 kg           | ₹307 a kg        | **Sent.** Waiting on an answer         |
| **#121**  | Paradise Juice     | Green Peas — **centre seal, D punch** | 650 kg           | ₹333 a kg        | **Won** → card raised, film held       |
| **#122**  | Gulve Patil Foods  | Mauli Bhell — **three side seal**     | 750 kg           | ₹327 a kg        | **Won** → on the laminator now         |
| **#123**  | Sarthak Sonpapdi   | Sonpapadi Mango — **standup zipper**  | 1,000 kg         | ₹566 a kg        | **Won** → made, costed, half delivered |

Five different things on purpose: a reel, a flat bottom, a centre seal with a
punched handle, a plain three side seal and a standup zipper. They are priced
differently because they are made differently, and the two ends of the system
— what it costs and what it is worth — both turn on that.

---

## Why the zipper job looks dear

₹566 a kilogram against ₹327 for the Mauli Bhell is the figure somebody will
query first, so it is worth answering before it is asked.

The Sonpapadi pouch is **small** — 300 × 210 mm, two up — so a kilogram of it
is **205 pouches**. The Mauli Bhell is 420 × 260 and one up: **111 pouches** a
kilogram. The zipper is charged by the metre across the mouth, ₹3.60 a metre,
which on a 300 mm mouth is about ₹1.08 **a pouch** — and 205 of those is ₹221
on every kilogram.

Per pouch, which is how the customer buys them, the two are almost the same:

|                  | Sonpapadi (zipper) | Mauli Bhell (plain) |
| ---------------- | ------------------ | ------------------- |
| A kilogram is    | 205 pouches        | 111 pouches         |
| Rate a kilogram  | ₹565.91            | ₹327.33             |
| **Cost a pouch** | **₹2.76**          | **₹2.96**           |

Nothing is wrong. A small pouch with a zipper is dear by weight and ordinary
by the piece, and the quotation shows both.

---

## Job by job, and what each left behind

### #119 · Chitra Wafers — a printed reel, still a draft

Quoted at two quantities because the customer asked what a bigger run would
cost: **₹313 a kg at 1,000 kg, ₹305 at 2,000**. The longer run is cheaper
because the make-ready is spread over more kilograms — it is priced twice, not
discounted once.

It is a **reel**, so it has no pouch style, no pouch making charge and no pouch
count anywhere. Nothing downstream exists: no order, no card, no run. This is
what the system looks like before anybody has committed to anything.

> **Where to look:** Quotations → #119. Open it and the preview is the PDF the
> customer would receive.

### #120 · Nutrilex — a flat bottom bag, sent and waiting

Out on **1 October**, no answer yet. A flat bottom is the dearest style to make
and the one customers take longest on, which is why it is the one left hanging.

The Overview counts it: _100% of answered quotations won · 1 still out_.

### #121 · Green Peas — won, carded, waiting for the press

The customer said yes on **25 September**. Three things happened, in this
order, and each is its own record:

1. **Order #1** — what they committed to: 650 kg, due **22 October**.
2. **Job card 1** — the instruction. Work order **WO-0001**, the structure, the
   weights to draw, the metres, the hours. Printed and signed before anybody
   touches a machine.
3. **Production run #1** — raised, and this is what **claims the film**. Its
   stages are all still Pending.

Nothing has run. The film is held against this job and the Inventory screen
counts it as committed rather than free.

> **Where to look:** Orders → #1 shows the card and the run side by side. Job
> cards → 1 is the paper itself; **Print card** gives you the A4 sheet.

### #122 · Mauli Bhell — on the laminator this morning

Won **19 September**, carded as **WO-0002**, and the run is part way through:

| Stage                   |                       |
| ----------------------- | --------------------- |
| Rotogravure printing    | **Done** — 790 kg off |
| Lamination              | **Running** now       |
| Slitting · Pouch making | Pending               |

There is an **open quality issue** against it — delamination on the outer edge,
third and fourth reel, marked High and still open. Nothing has been rejected,
so no weight has moved; it is a problem somebody is on.

The card is signed by the people actually running it: operated by Rahul Patil,
approved by A. K. Hase.

> **Where to look:** Production → run #2, and Quality & waste for the issue.

### #123 · Sonpapadi Mango — the whole journey

This is the one to walk end to end. Quoted **9 September**, won on the 12th,
and every step since has left a record:

1. **Order #3** — 1,000 kg, due 12 October.
2. **Job card 3** — WO-0003, printed and signed.
3. **Production run #3** — all five stages done, losing a little at each:
   printing took 1,080 kg in and gave 1,053 out, then 1,027, 1,001, 976, and
   **952 kg** off the pouch machine.
4. **Job sheet 851** — what it actually cost. 360 kg each of PET, Met PET and
   the high-clarity LDPE, the inks and solvents against their drums, the
   overheads, the labour: **923 kg out at ₹269.90 a kilogram**, 3.14% wasted.
   Posting it took the film **off stock**, oldest batch first.

   Look at the third film row: it says **LDPE Natural High Clarity (NAT-HC)**,
   not the generic "LDPE" the works' printed form has. The sheet works out
   which of the dozen LDPE grades this job ran — from the plies it was priced
   on — and binds that one, at the rate in force on the sheet's own date. The
   other two rows keep the works' own wording, because the works buys one PET
   and one metallised PET and their form can name them. Where a sheet has no
   job behind it to read, the row asks: **"which film?"**, with the catalogue
   behind it.

5. **Dispatch note #1** — half of it gone: 461.5 kg on three reels, by Sai
   Roadlines on MH 15 AB 1234, LR-5521.
6. **Dispatch note #2** — the balance, loaded but **not sent**. A draft counts
   for nothing anywhere until somebody presses Dispatch.

The order stays open because only half has gone. The godown shows 461.5 kg
still standing against it.

> **Compare the two ends:** quoted at **₹565.91** a kilogram, cost **₹269.90**.
> That gap is the margin, the pouch making and the overheads the quotation
> charges for — and the job sheet is the only place the works ever finds out
> whether the estimate was right.

---

## The two documents people confuse

They are different records, written at different moments by different people.

|         | **Job card**                        | **Job sheet**                    |
| ------- | ----------------------------------- | -------------------------------- |
| Written | **before** the run                  | **after** each stage             |
| By      | the office                          | the person who ran it            |
| Says    | what to make and what it will take  | what it actually took            |
| Carries | film, sizes, weights, metres, hours | ink and film issued and returned |
| Ends up | printed and signed by three people  | costed, and posted off stock     |
| Screen  | Job cards                           | Job sheets                       |

A **production run** is a third thing again: the floor's record of which stage
has reached where, on which machine, with whom. The card tells it what to do;
the sheet says what it consumed.

---

## What the Overview adds up to

Everything on that page is counted from the records above — nothing is stored:

- **Order book ₹10.28 L**, 3 open orders, 2,400 kg
- **Delivered this month ₹2.83 L**, 462 kg
- **5,799 kg** off the machines over the fortnight, **2.49% waste**
- **On time 100%** — one delivery, and it made its date
- Needs attention: _1 serious quality issue is open · 1 order is made and
  waiting to go · 72 designs belong to nobody_

The 72 designs with no customer are real, not demonstration data: they came off
the works' own sheets with nobody's name against them, and the Designs screen
is where they get claimed.

---

## What is real and what is demonstration

| Kept, and real                     | Put there for the demonstration          |
| ---------------------------------- | ---------------------------------------- |
| 71 customers                       | 5 quotations                             |
| 419 designs                        | 3 orders, 3 job cards, 3 production runs |
| 40 materials and their dated rates | 1 job sheet, 2 dispatch notes            |
| The costing figures and settings   | 17 stock batches (`DEMO-…`)              |
| 4 machines, 4 people               | 1 quality issue, 1 machine service       |
| Every sign-in                      |                                          |

The customers, designs and rates are the works' own, imported from their
spreadsheets. The demonstration never invents a customer or a design — it uses
theirs, which is why the screens read like their works and not like a sample.

---

## Running it again

```bash
npm run seed:demo -w @yuva/api -- --wipe
```

`--wipe` empties every transaction first — quotations, orders, cards, runs,
sheets, challans, stock and its movements — and keeps everything the works
would otherwise have to type in again: customers, designs, rates, costing,
machines, people, cylinders and sign-ins. Then it builds the five jobs above.

Without `--wipe` it adds the five on top of whatever is there. To remove only
what it made and leave real work alone:

```bash
npm run seed:demo -w @yuva/api -- --clear
```

**It runs against whatever `DATABASE_URL` points at.** On a developer machine
that is the local database. Point it at the deployed one only when you mean to.

---

## Where this does not go

One thing in the chain above is **not** settled, and the demonstration does
not pretend otherwise:

- **The production run's In kg / Out kg.** The works does not record a weight
  in and a weight out at every stage, so what those boxes should hold — or
  whether they should be there at all — is a question for the client. The
  module is untouched until that is answered.

The other one is closed. The job sheet's poly row used to arrive naming a
retired film — costing nothing, and unable to come off stock when the sheet
was posted. It now binds the grade the job was actually priced on, and where
that cannot be worked out the office picks it on the row itself. See the note
under sheet 851 above.
