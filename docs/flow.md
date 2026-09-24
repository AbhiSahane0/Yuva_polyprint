# How a job moves through the system

From the day a customer asks for a price to the day the works knows what the run
actually cost.

This is written to be read aloud. If you are showing somebody the system for the
first time, start at the top and work down — every step says what it is for,
what it decides, and what it changes further along. Nothing here needs any
technical knowledge.

---

## The chain, in one picture

```
   RATES & COSTING          the figures every price is built from
          │
          ▼
      CUSTOMER  ──►  QUOTATION  ──►  the customer says yes
                                          │
                                          ▼
                                       ORDER          what they committed to
                                          │
                                          ▼
                                      JOB CARD        what the floor will do
                                          │
                         ┌────────────────┼────────────────┐
                         ▼                ▼                ▼
                     PRINTING        LAMINATION    SLITTING → POUCH MAKING
                         └────────────────┼────────────────┘
                                          ▼
                                     JOB SHEET        what it actually cost
                                          │
                                          ▼
                                      STOCK GOES DOWN
```

Two things are worth saying before any of the detail.

**Each step is fed by the one before it.** Nobody retypes the customer onto the
order, or the design onto the job card, or the quantity onto the job sheet. It
travels. That is the whole point — a number typed twice is a number that will
disagree with itself eventually.

**Nothing already agreed ever moves.** Rates, wages and overheads all carry the
date they apply from. Putting up the price of film today does not change what a
quotation said last month. This matters more than it sounds: it is what lets the
office change figures without being frightened of them.

---

# Part one — before the first job

These are set up once and then only corrected occasionally. A works that skips
them will still be able to raise a quotation, but the price will be wrong and
nothing will say so.

Do them in this order, because each needs the one before it.

## Step 1 — the materials and what they cost · **Rates**

Every film, ink, adhesive and solvent the works buys, with today's price.

Open **Rates**. Each row shows the last price, an empty box for the new one, and
the change appears as you type — put 225 over 210 and it says `+7.14%` before
you save. Leave a box blank and that material is simply not changed today.

Each film also carries its **density**, set when the material is added or
edited — the pencil on its row, not the price box. Density is what turns a
thickness into a weight. **A film with no density weighs nothing** as far as the
system is concerned, and a job using it is priced as though that layer were not
there. If a price looks far too low, this is the first thing to check.

> **Why it matters downstream:** a quotation is priced at the rates in force on
> the quotation's own date. Record a price late and older quotations stay as
> they were, which is correct — but a film that has never been priced at all
> costs nothing, silently.

## Step 2 — what the works costs to run · **Costing**

Three parts on one screen.

**Machines.** Each press, laminator and slitter: its power, its speed, how long
it takes to make ready. Speed is what turns a job's metres into minutes, and
minutes are what most of the cost is built from.

Where the works has **two machines of one kind and runs one of them**, mark that
one **Use this one**. It then carries a _Costed on this_ badge, and every rate of
that kind is built from its figures. Only one machine per process is ever
charged — a job is not billed for two laminators it never touched — so without
this the costing simply took whichever came first on the list, which is how an
old machine's speed can end up pricing every job.

**Wages.** Each role, which process it works on, and the monthly salary. The
system turns that into a cost per minute using the working month set further
down the screen.

Every wage carries the day it applies **from**. Take a lamination crew on today
and every rate quoted from today includes them — and nothing quoted before today
moves. Ending a role closes its window; taking it back on opens a new one. This
is why a wage row says "from the start" or "23-09-2026 onwards" underneath it.

**Overheads and defaults.** Electricity, transport, packing, the bank EMI, the
margin, the wastage allowance, and anything else this works pays for that the
list does not already cover. Set a charge to 0 to turn it off.

> **The one switch worth understanding:** _by the minute_ or _by the day_. By
> the minute charges each machine's crew and EMI for the minutes the job
> occupies them. By the day charges a flat figure for each day the job takes and
> **replaces** the per-minute crew and EMI — it does not add to them.

## Step 3 — who you sell to · **Customers**

Company, brand, GST number, address, contact. The brand is what appears on the
screens where there is one, because that is what the works calls them.

A customer's designs live under them — thickness, size, pouch style, how many
cylinders. A quotation raised against an existing design fills itself in from
that record.

## Step 4 — who works here · **Employees**

Name, what they do, which shift. Their role points at one of the wages from
Step 2, so nobody's pay is typed twice.

This is deliberately not a personnel system: no attendance, no leave, no
payroll. It exists so that the floor **picks** a name on a job card instead of
typing one — which is how the same person ends up recorded five different ways.

The screen also shows who is on a machine right now. That is not stored anywhere
and nobody has to keep it up to date: if a job card stage is running with
somebody's name on it, they are working, and that is the only thing that can
make it true.

## Step 5 — film in the building · **Purchase** and **Inventory**

Raise a purchase order on a supplier, and record the delivery when it arrives.
Accepting a delivery opens a **stock batch** — that is what puts film on the
shelf.

Film can also be taken straight in with **Receive material** on the Inventory
screen, for a delivery nobody raised an order for. Either way it is a batch, and
a batch is what stock is counted in.

The Inventory screen then shows, for every material:

|             |                                        |
| ----------- | -------------------------------------- |
| **On hand** | what is physically in the building     |
| **Free**    | what a new job could actually be given |

They differ by what open job cards have already claimed. This is the figure
everything downstream is measured against, and it is explained properly in Part
two.

## Step 6 — the printing cylinders · **Design & Cylinders** _(optional)_

Which designs already have a set engraved, and where those sets are. A design
that already has cylinders does not need charging for them again, and the
quotation asks that question.

---

# Part two — a job, start to end

Now the part that repeats for every job.

## Step 1 — price it · **Quotations → New quotation**

Four steps across the top: **Customer → Details → Jobs → Review**. You cannot
price a job before you know who it is for, so they are genuinely in order.

**Customer.** An existing company, or a new one. The quotation's **date** is set
here, and it decides what the job is priced at — the rates and overheads in
force on that day, not today's.

**Details.** Anything about this quotation as a whole.

**Jobs.** One block per job being quoted. Pick the design if the works already
has it, or describe a new one: pouch or roll, the size, and the layers — each
layer being a film and its thickness. Then up to three quantities, because the
customer usually wants to know what a bigger order does to the price.

The costing works itself out as you type, and can be opened up: what the film
costs, the ink, the adhesive, the machine time, the crew, the overheads, the
margin. Anything the works wants to override for this job alone — the margin,
transport, pouch making, the wastage allowance — can be set here without
touching the master figures.

**Review.** The document as the customer will see it. Save it.

A quotation starts as **Draft**. Nothing else in the system reacts to it yet.

## Step 2 — send it

**Sent** means it has gone out and the office is waiting. The system can email
the PDF, or you can send it yourself.

## Step 3 — the customer answers

On the quotation, record **Won** or **Lost**.

Lost asks briefly why, and stops there.

**Won is the moment the chain starts moving.** Winning a quotation raises an
**order** for each job on it, at the quantity the customer accepted, with the
customer, the design and the agreed rate carried across. Nobody types any of it
again.

## Step 4 — the order · **Orders**

The order is what the customer has committed to: the quantity, the rate agreed,
and the day it is wanted. It is the office's record, and the floor reads it too
— what is due and when is everybody's question.

An order moves **Confirmed → In production → Completed**, and it can be
**Cancelled** while nothing has been made. It does not move itself to In
production; starting work does that, in Step 6.

Orders for work taken over the phone, with no quotation behind them, can be
typed here directly.

## Step 5 — raise the job card · on the order, **Start production**

A job card is what the floor works from. It is raised **from the order**, never
on its own — a card with no order behind it is a run nobody asked for.

Two things happen the moment it is raised.

### The stages work themselves out

Nobody picks them. The system reads the structure the job was priced on:

| Stage                    | When it appears                                               |
| ------------------------ | ------------------------------------------------------------- |
| **Rotogravure printing** | unless the job prints nothing                                 |
| **Lamination**           | once per bond — a three-ply job gets **Lamination 1 and 2**   |
| **Slitting**             | always; everything comes off wider than it is sold            |
| **Pouch making**         | only where pouches are made; a reel is converted into nothing |

Because it reads the same structure the price was built from, the card and the
quotation cannot disagree about what the job involves.

A stage the job does not need can be marked **Not needed**, and one the system
guessed wrong about can be put back. A stage that does not apply stays on the
card marked _Skipped — not required_, rather than vanishing — a gap would read
as something nobody has got to yet.

### The film is claimed

The card works out how much of each film the run needs — the same arithmetic the
price was built from — and **claims** it.

A claim is not an issue. The film is still on the shelf and still counted as on
hand. What changes is what the **next** job sees:

```
free    =  on hand  −  what open job cards have already claimed
usable  =  free     −  anything on a reel too narrow to run THIS job
```

That second line is the one that surprises people. **Film can be slit down and
never widened**, so a job running at 715 mm cannot use a 340 mm reel however
many kilograms are on it. The card shows the width it needs under each film, and
says how much of the free stock is the right film in the wrong size:

```
FILM                      NEEDS        USABLE
LDPE Milky / Natural      781 kg       8,008 kg
on a reel 715 mm or wider              20,465 kg too narrow
```

Twenty-eight tonnes of LDPE free, eight of them able to run this job. That is a
real figure off the works' own stock, and it is a different problem from having
none — it is solved by buying differently rather than by buying more.

A job can therefore be short of a film the stock screen shows plenty of, for
either reason: the rest is promised to another job, or the rest is the wrong
size. The card says which.

### It claims particular rolls

The claim is not "781 kg of LDPE". It is **these rolls**, listed under each film
on the card:

```
LDPE Milky / Natural       452.241 kg     17,737.800 kg
on a reel 615 mm or wider                 10,765 kg too narrow
 [615 mm · 41.5 kg] [615 mm · 20.5 kg] [615 mm · 124.4 kg] [615 mm · 51.5 kg] …
```

That is what the floor fetches, and it is what stops two cards being promised
the same roll — what is left of a roll is what is on it less what other cards
hold **of that roll**.

The rolls are chosen **narrowest suitable first, then oldest**. Narrowest
because a 1040 mm roll spent on a 360 mm job is a wide roll the works no longer
has for a wide job, and wide rolls are the scarce ones. Oldest within a width
because film ages on a shelf. Hovering a roll shows its batch code.

> **A shortage does not stop the card being raised.** Raising it is how the
> floor finds out what is missing and how purchasing finds out what to order.
> The stop comes at the machine — Step 6.

## Step 6 — run it, stage by stage · **Production → the card**

This is the screen somebody stands at a machine with. One block per stage, in
the order the job meets them.

Each block asks for four things:

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| **Machine**  | only machines of that kind — a slitter is never offered for the press |
| **Operator** | picked from the employees, not typed                                  |
| **In, kg**   | what went onto the machine                                            |
| **Out, kg**  | what came off it                                                      |

And shows one:

**Waste** — the difference between the two. It is never typed, because a third
figure that can disagree with the two it comes from is one nobody can trust. It
shows a dash until there is an output, because waste is not a fact until both
weights exist. If it ever comes out **negative** — more off the machine than
went on — it is called out in amber, because one of the two weights is wrong.

### Starting a stage

Press **Start**.

**This is where a shortage stops the job.** The system checks the film is free
_now_, not when the card was raised — a claim made on Monday is not a guarantee
on Thursday. If it is short, the start is refused and the message names the
film, what the job needs, and what is free.

There is one way past it: **Run it anyway**, which asks for a reason in one
sentence and records it against the card with the name of whoever gave it and
the time. A works that knows the lorry is an hour away should not have to lie to
the system to get on with the job — but it should have to say so.

Starting a stage also **starts the card and moves the order to In production**.
The floor starts a stage, not three things.

### Finishing a stage hands the reel on

Press **Finish** when the stage is done, and the job moves by itself:

- the **next stage starts**, because that is where the reel now is
- its **In, kg is filled with what came off the last machine** — 629 kg off the
  press is 629 kg onto the laminator, and nobody retypes it

A stage marked _Not needed_ is stepped over, because the reel cannot be waiting
at a machine the job never goes near. The machine and the operator are left
blank on the new stage, because those are a different person at a different
machine, and they are the two things worth asking.

**The material check does not apply here.** It asks whether a job should
_begin_, and a job three stages in has begun — refusing the laminator would not
save a gram of film, it would strand a printed reel between two machines. The
check runs on the first machine the job reaches and nowhere else.

Finishing the last stage does **not** complete the card. The card sits at 100%
with **Completed** waiting to be pressed, because completing it releases the
job's claim on its film and that is worth one deliberate press.

### The stages themselves

**1 · Rotogravure printing.** The design is printed onto the first film. Weigh
the reel on, weigh the printed reel off. What is lost here is setting up — the
first few hundred metres while the colours come into register.

**2 · Lamination.** The printed film is bonded to the next layer with adhesive.

> **The number is the pass, not the machine.** This is the one thing on the card
> that gets misread, and it is worth saying plainly to anybody you show it to.
>
> A laminator bonds **two films at a time**. So a three-ply job has to go
> through twice:
>
> ```
> Lamination 1 · PET 12µm + MET PET 12µm     the first bond
> Lamination 2 · + LDPE Milky / Natural      that, bonded to the third ply
> ```
>
> **Both passes run on the same machine**, one after the other. The works having
> two laminators has nothing to do with it — a job that needs two passes needs
> them whether the works owns one machine or five.
>
> That is why each row names the films it bonds, and why a two-ply job says just
> **Lamination** with no number at all.

Each pass is its own run all the same: its own operator, its own weights, its
own waste. The works' own paper sheet names them Lamination 1 and Lamination 2
for the same reason.

**Which laminator?** The machine box on each row offers both, so the floor
records the one that actually ran it. For **pricing**, the works says once which
machine it runs — the one marked _Costed on this_ on the Costing screen — and
every quotation is built from that machine's speed. Without it the costing took
whichever machine came first on the list, which meant a works with an old
laminator and a new one priced every job on the old one.

**3 · Slitting.** The wide laminated reel is cut down to the width the job is
sold at. Everything is printed wider than it is sold, so this stage is on every
job.

**4 · Pouch making.** Only where the job is a pouch. The slit reel is formed,
sealed and cut into bags. A job sold on the reel skips this entirely.

Press **Finish** on each stage as it is done, and the next one picks up on its
own with the weight carried across. The progress bar on the card and in the list
is worked out from the stages — done, out of the ones that apply — so the two
screens can never disagree.

## Step 7 — the card is finished

When every stage is done, mark the card **Completed**.

**Completing the card does not complete the order.** For a customer, complete
means delivered, and nothing in the system knows about delivery yet. The order
stays In production until somebody says otherwise, which is honest.

## Step 8 — what it actually cost · **Job sheet**

The quotation said what the job _should_ cost. The job sheet says what it _did_.

On the finished card, press **Record what it cost**. That raises a job sheet
already pointed at this card — which matters, and Step 9 says why.

The sheet is laid out like the works' own printed form, with the same rows in
the same order: the films, the twelve colours, the solvents, the adhesive. For
each, what was issued and what came back. Then the time on the floor, the
labour, and what was finally packed.

It works out the cost a kilogram — the one figure the whole sheet exists to
produce, and what the office prices repeat work from. It also compares the
wastage the job actually lost against the allowance it was quoted at, and says
what the difference cost.

## Step 9 — take the material off stock

On the costed sheet, press **Take off stock**.

**This is the only thing in the entire system that reduces stock.** Not the
quotation, not the order, not the job card. Only the sheet, because only the
sheet knows what was actually weighed at the machine.

It does two things at once:

1. Writes the run's real consumption against the stock batches, oldest first.
2. **Releases the job card's claim.** The film has genuinely left the shelf now,
   so the claim that was standing in for it stops counting.

That pairing is what guarantees material is never deducted twice. A claim and an
issue can never both stand against the same film.

A posted sheet is closed. Its movements are in the ledger, and correcting it is
done with a stock adjustment rather than by editing history.

---

# The rules behind all of it

Four ideas explain most of the system's behaviour. They are worth knowing,
because they answer nearly every "why does it do that?"

### 1. Figures carry dates

Material rates, wages, overheads and the works' settings all record the day they
apply from. A quotation is costed with the figures in force on **its own date**.
Change a price today and nothing already quoted moves.

### 2. Anything that can be worked out is not stored

Waste, progress, whether an order is late, who is on a machine, how much stock
is free — none of it is kept anywhere. It is worked out from the facts each
time. A status somebody has to remember to change is wrong most of the time.

### 3. Stock moves exactly once

The job card **claims**. The job sheet **issues**. Only the second touches the
ledger.

### 4. Nothing is deleted once it has been used

A material on a quotation, a supplier with an order, an employee who has run a
stage, a machine a job was costed against — none of them can be deleted. They
are **retired** instead: off the screens, still on record, so the documents that
used them can still explain themselves.

---

# The screens, at a glance

| Screen                 | Answers                                              |
| ---------------------- | ---------------------------------------------------- |
| **Customers**          | Who we sell to, and what designs they have           |
| **Quotations**         | What we have offered, and what came of it            |
| **Orders**             | What customers have committed to, and when it is due |
| **Production**         | What is on the floor right now, and how far along    |
| **Employees**          | Who is here, and what they are on                    |
| **Job sheets**         | What each run actually cost                          |
| **Inventory**          | What we hold, what it is worth, what is running out  |
| **Purchase**           | What is on order and what has arrived                |
| **Rates**              | Today's raw material prices                          |
| **Costing**            | What the works costs to run                          |
| **Design & Cylinders** | Which designs have cylinders, and where they are     |

---

# Seeing it end to end

There is a demonstration set built into the system — ten jobs, spread the way a
real week is spread:

```bash
npm run seed:demo -w @yuva/api
```

| Stage            | What to look at                              |
| ---------------- | -------------------------------------------- |
| **Quoted**       | a quotation sent, nobody has answered        |
| **Ordered**      | won, the order on the books, nothing started |
| **On the floor** | printing done, lamination running            |
| **Finished**     | every stage done, costed, taken off stock    |

Walk Quotations → Orders → Production → Job sheets → Inventory in that order and
the whole chain reads in one sitting. Remove it again with:

```bash
npm run seed:demo -w @yuva/api -- --clear
```

---

# What is not built yet

So nobody goes looking for it:

- **Dispatch** — what left the building, and on whose lorry. This is why
  completing a job card does not complete the order.
- **Planning** — scheduling work across the machines before it starts.
- **Quality and waste analysis** — the figures are all recorded; the reporting
  on top of them is not built.
- **Reports and an overview screen.**
- **An operator view** — a stripped-back screen for a tablet at the machine.

And two gaps in the works' own data worth closing:

- There is **no pouch-making machine** on the Costing screen, so that stage's
  machine box has nothing to offer and pouch making is not costed by the minute.
- The **Pouch Operator** wage is a placeholder. It costs nothing until a
  pouch-making machine exists — but the day one is added, it starts pricing
  every pouch job.
