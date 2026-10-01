# How a job moves through the system

From the day a customer asks for a price to the day the goods leave the
building — and the works knows what the run actually cost.

This is written to be read aloud. If you are showing somebody the system for the
first time, start at the top and work down — every step says what it is for,
what it decides, and what it changes further along. Nothing here needs any
technical knowledge.

---

## What is in here

| Part                                                                 | What it covers                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [The chain, in one picture](#the-chain-in-one-picture)               | the whole thing on one screen                                              |
| [The Overview screen](#overview)                                     | the same thing live, and the page you land on                              |
| [Part one — before the first job](#part-one--before-the-first-job)   | the seven things set up once                                               |
| [Part two — a job, start to end](#part-two--a-job-start-to-end)      | the eleven steps a job actually takes                                      |
| [Part three — watching it happen](#part-three--watching-it-happen)   | the three screens that watch rather than move                              |
| [Every screen, and what it is for](#every-screen-and-what-it-is-for) | each one in turn: what it answers, what it needs, what it feeds            |
| [How the screens feed each other](#how-the-screens-feed-each-other)  | what travels, what is worked out, and what moves when you change something |
| [The rules behind all of it](#the-rules-behind-all-of-it)            | four ideas that explain most of the behaviour                              |
| [Seeing it end to end](#seeing-it-end-to-end)                        | the demonstration set                                                      |
| [What is not built yet](#what-is-not-built-yet)                      | so nobody goes looking                                                     |
| [Deliberately not built](#deliberately-not-built)                    | and so nobody proposes it again                                            |

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
                                      PLANNING        can it run, and when —
                                          │             and on which machine
                                          ▼
                                      JOB CARD        what the floor will do
                                          │             + claims the film, ink
                                          │               and adhesive it needs
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
                                          │
                                          ▼
                                      DISPATCH        it leaves the building,
                                                      and the order is complete
```

Three screens watch that chain rather than move it along: the **machine
screen** the floor works from, **Quality & waste**, and **Machines**. Part
three covers them.

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

## Step 4 — the designs themselves · **Designs**

Every product the works has on its books, in one searchable list: the code,
the name, what it is made of, whose it is, how often it has been priced and
whether it has cylinders or artwork.

A design normally needs no attention here at all — it belongs to a customer
and is edited on that customer's page, or created inside the quotation wizard
while somebody is pricing it. **This screen exists for the ones that have
nobody's name on them.**

Four hundred-odd designs came across from the works' old sheets and about
seventy of them arrived with no customer: the sheet never said, or the name
was written somewhere the importer could not read. A design belonging to
nobody appears on nobody's page, so until this screen there was no way to find
them at all.

So they sort to the top, under **Needs a customer**. Pick one, say whose it
is, and it moves onto that customer's page and is edited there like every
other design from then on. Assigning is the only thing this screen changes —
a second editor here would be a second place for the same measurements to
drift apart.

Worth doing early, because a design with no customer cannot be quoted: the
wizard starts from a customer and works down to their designs.

---

## Step 5 — who works here · **Employees**

Name, what they do, which shift. Their role points at one of the wages from
Step 2, so nobody's pay is typed twice.

This is deliberately not a personnel system: no attendance, no leave, no
payroll. It exists so that the floor **picks** a name on a job card instead of
typing one — which is how the same person ends up recorded five different ways.

On a job card the operator box lists the people whose role belongs to that
machine first, under **On this machine**, and everybody else under **Anyone
else**. Nobody is hidden: the day the slitting man covers the press is exactly
the day worth recording.

The screen also shows who is on a machine right now. That is not stored anywhere
and nobody has to keep it up to date: if a job card stage is running with
somebody's name on it, they are working, and that is the only thing that can
make it true.

## Step 6 — film in the building · **Purchase** and **Inventory**

Raise a purchase order on a supplier, and record the delivery when it arrives.
Accepting a delivery opens a **stock batch** — that is what puts film on the
shelf.

Film can also be taken straight in with **Receive material** on the Inventory
screen, for a delivery nobody raised an order for. Either way it is a batch, and
a batch is what stock is counted in.

A film delivery records **how wide the reel runs** and **its gauge**. Part two
says why that matters more than it sounds.

The works' existing stock register loads in one go — 363 reels and 38.6 tonnes
off their own September workbook:

```bash
npm run import:stock -w @yuva/api -- --file "Stock Record September Month 2026.xlsx"
```

The Inventory screen then shows, for every material:

|             |                                        |
| ----------- | -------------------------------------- |
| **On hand** | what is physically in the building     |
| **Free**    | what a new job could actually be given |

They differ by what open job cards have already claimed. This is the figure
everything downstream is measured against, and it is explained properly in Part
two. **Free below zero** means more has been promised to job cards than the
works holds — it is shown in red rather than hidden behind a nought, because a
works that finds that out at the machine finds out too late.

## Step 7 — the printing cylinders · **Design & Cylinders** _(optional)_

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
production; starting work does that, in Step 7.

Orders for work taken over the phone, with no quotation behind them, can be
typed here directly.

## Step 5 — the gate before the floor · **Planning**

Between an order and a job card there is a decision nothing used to record:
**when it runs, and on what machine.** The order carries a due date, which is
the customer's. The job card carries stages, which are the floor's. Neither of
them said which press a job was booked onto next Tuesday.

### Can it run?

The board asks the job card's own material question **early** — before a card
exists. The check is the same one, reels and all: every ply, every ink, the
adhesive, and a reel too narrow counted as no use whatever it weighs. Until
now the only way to find out an order could not be made was to raise the card
and be refused.

Nothing is reserved. A plan is not a claim — holding film for a job nobody has
scheduled would starve the one actually on the machine, and the claim would
never be released because there is no card to release it.

Four figures across the top, and only one of them changes what anybody does
this morning:

| Figure                | What it means                                         |
| --------------------- | ----------------------------------------------------- |
| **Short of material** | cannot run. Sorts above everything, whatever its date |
| **Ready to schedule** | film in hand, nobody has dated it                     |
| **Scheduled**         | booked onto a day, and usually a machine              |
| **Landing late**      | the plan finishes after the day it was promised       |

### When, and on what?

Click any order not yet on the floor. Two fields, and they are independent:
the works often knows the week before it knows the press, and sometimes gives
a job to a press before the day is settled.

As the date is typed it works out **the day the job comes off** — make-ready
plus running, on the works' own fitted figures — and if that falls after the
customer's date it says so **before it is saved**, and by how many days. A
planning screen that only tells you afterwards has already let it happen.

> The estimate is the kilogram fallback, not the real model. Costing drives
> days off machine _minutes_, because a 750 mm web at eight colours is not the
> same job as a 990 mm web at one even when they weigh the same — but minutes
> need a costed structure and a chosen machine, and planning asks before either
> is settled. Good enough to catch an order that cannot make its date; not good
> enough to promise an hour.

### A shortage outranks a plan

An order can still be dated while it is short — "Tuesday, press 1, film
arriving Monday" is a real plan, and a system that refuses to write it down is
one the works keeps on paper instead. The board goes on showing it in red, and
the job card will still refuse to start until the film is in.

### What each machine has coming

Underneath, a card per machine: what is booked on it, in date order, with the
days it adds up to. The board above says what each order is waiting for; this
says what each machine is in for, which is what stops three jobs being booked
onto the same Tuesday.

### Planning ends where the floor begins

Once a job card is raised the order drops off the board. The card has real
stages, a real claim on the film and a real operator, and a date typed here
afterwards would be a second opinion about a job already running.

---

## Step 6 — raise the job card · on the order, **Start production**

A job card is what the floor works from. It is raised **from the order**, never
on its own — a card with no order behind it is a run nobody asked for.

Two things happen the moment it is raised.

### The stages work themselves out

Nobody picks them. The system reads the structure the job was priced on:

| Stage                    | When it appears                                                   |
| ------------------------ | ----------------------------------------------------------------- |
| **Rotogravure printing** | unless the job prints nothing                                     |
| **Lamination**           | once per bond — see below, the number is the pass not the machine |
| **Slitting**             | always; everything comes off wider than it is sold                |
| **Pouch making**         | only where pouches are made; a reel is converted into nothing     |

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

### It claims the ink and the adhesive too

Not only film. A card holds everything the run takes off the shelf, worked out
the same way the price was:

|                                   |                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Each ink**                      | at its **wet** weight — the laydown is what stays on the film once dry, but the tin is bought wet, so an ink at 23% solids is claimed four times heavier than it looks |
| **The solvents**                  | ink is thinned 100:80, and the adhesive let down 100:146:15 — so ethyl acetate is the biggest consumable after film                                                    |
| **The adhesive and its hardener** | spread over the **films**, not the whole laminate: it goes between the plies, not over itself or the ink                                                               |

A five-colour job — CMYK plus a spot on the fifth station — holds five ink
drums. **A spot colour nobody has chosen the ink for yet** still counts its
solvent, because the works mixes something, but holds no drum: there is nothing
to hold. Once somebody names the ink, it is claimed like any other.

Ink and adhesive come in drums, so **no width is asked of them**. The chip under
each names the drum instead of a width.

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
> The stop comes at the machine — Step 7.

### The panel folds away

All of this lives in one **Material** panel above the stages, and it starts
**folded** — a card with three films, five inks and the solvents runs to a dozen
rows, and the floor opens this screen to fill in a stage. The header still says
the state: the badge, and how many materials are behind the fold.

A job that is **short with nobody having said why** opens itself. The panel is
then the reason the job will not start, and the way past it is a button inside
it.

## Step 7 — run it, stage by stage · **Production → the card**

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

## Step 8 — the card is finished

When every stage is done, mark the card **Completed**.

**Completing the card does not complete the order.** For a customer, complete
means delivered, and that is Dispatch's to say — Step 11. The order stays In
production until a delivery note settles the last of it, and then it completes
itself.

## Step 9 — what it actually cost · **Job sheet**

The quotation said what the job _should_ cost. The job sheet says what it _did_.

On the finished card, press **Record what it cost**. That raises a job sheet
already pointed at this card — which matters, and Step 10 says why.

The sheet is laid out like the works' own printed form, with the same rows in
the same order: the films, the twelve colours, the solvents, the adhesive. For
each, what was issued and what came back. Then the time on the floor, the
labour, and what was finally packed.

It works out the cost a kilogram — the one figure the whole sheet exists to
produce, and what the office prices repeat work from. It also compares the
wastage the job actually lost against the allowance it was quoted at, and says
what the difference cost.

## Step 10 — take the material off stock

On the costed sheet, press **Take off stock**.

**Nothing else in a job's life reduces stock.** Not the quotation, not the
order, not the job card — only the sheet, because only the sheet knows what
was actually weighed at the machine. (Film arriving on a delivery, and a
stocktake correction typed on the Inventory screen, are the other two ways
stock moves; neither belongs to a job.)

It does two things at once:

1. Writes the run's real consumption against the stock batches, oldest first.
2. **Releases the job card's claim.** The film has genuinely left the shelf now,
   so the claim that was standing in for it stops counting.

That pairing is what guarantees material is never deducted twice. A claim and an
issue can never both stand against the same film.

A posted sheet is closed. Its movements are in the ledger, and correcting it is
done with a stock adjustment rather than by editing history.

---

## Step 11 — it goes out · **Dispatch**

This is the step that finishes an order, and until it existed nothing did: a job
card could be complete, costed and off stock while the order it was for still
read **In production**, because for a customer complete means _delivered_ and
nothing knew about delivery.

### The godown

The Dispatch screen opens on **what is waiting to go**, and nothing in that list
is stored anywhere. It is what the finished job cards made, less what has already
gone out:

| Column            | Where it comes from                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Ordered**       | what the customer committed to                                                                                        |
| **Made**          | the finished cards' real output — the job sheet's packed weight, or the card's own quantity until the sheet is costed |
| **Gone**          | every dispatch note already sent                                                                                      |
| **In the godown** | made less gone. What is physically standing on the floor                                                              |

An order appears here the moment a card against it is finished, and drops off on
its own once everything has gone. There is no "ready to dispatch" tick box,
deliberately — that is the box somebody forgets, after which the screen is wrong
and the floor stops believing it.

### One note is one lorry

Press **New note** and it asks, in the order the job is actually done: who it is
going to, what is going, and which lorry.

**One note is one lorry, and one customer.** A vehicle taking three jobs to the
same customer is one delivery, one consignment note and one signature, with a
line for each order aboard. Three separate notes would mean typing the same lorry
number three times and handing over three challans for one drop. Two customers
is two notes, because each signs for their own goods.

### The reels are listed, and they are the total

Under each line, the reels go in one row each — the number written on the reel,
its weight, its width. **The line's weight is their sum**, shown rather than
asked for. A typed total sitting above rows that add up to something else is a
challan the works and the customer read two different ways, and there is no
settling it afterwards.

A customer who weighs the load back and finds it twelve kilos light can then be
told _which reel_. Where the office has only a total on a scrap of paper, they
type the total and list no reels — that still works.

### A draft is not a delivery

Saving gives you a **draft**, and a draft counts for nothing anywhere: no order
is credited, and the godown still shows the goods standing on the floor. Only
**Dispatch it** settles anything, and it asks for the lorry's number then — the
vehicle usually turns up after the paperwork is written.

Two clerks can both have a draft against the same 500 kg. The check happens
inside the same transaction as the posting, so the second one to send is refused
against what the first one actually took.

### Sending the last of an order completes it

When a note is sent, every order it finishes becomes **Completed**, stamped with
the day. Part deliveries leave the order open with the balance against it.

An order is judged on the basis it was taken at: **weight for a reel job, bags
for a pouch job**. A pouch order can have every kilogram delivered and still be
open, because a thousand bags short is a thousand bags short.

A run that made less than was ordered can never complete itself — 947 kg against
a 1,000 kg order leaves 53 kg pending forever, and closing that short is the
office's decision to make on the order, not something arithmetic should do
quietly.

### Sending more than was made

Refused, and it says which order and by how much. Physically it cannot happen, so
it means one of two things: a mistake, or a run that packed more than its card
planned and has not been costed yet — 512 kg against a 500 kg card, with the job
sheet still on somebody's desk.

The lorry does not wait for the office, so the refusal takes a reason and then
goes. The reason is recorded on the note with the name of whoever gave it.

### A lorry that comes back

A delivery turned back at the customer's gate is a real afternoon. **Cancel** the
note and the goods return to the godown — and if that note was what completed the
order, the order goes back to **In production** with its completion date cleared.
An order completed against a delivery that never happened is the one wrong figure
nobody finds until the customer rings.

A note that has already gone cannot be edited or deleted, only cancelled with a
reason. It is the record of a lorry that went.

### Dispatch moves no stock

Worth saying plainly, because it looks like it should. The material left the
shelf when the **job sheet** was posted, which is the only thing in the system
that reduces stock. A lorry leaving is not a stock movement, and deducting it
here would take every delivered job off twice.

---

# Part three — watching it happen

The eleven steps above are a job's life, in order. These three screens are not
steps in it: they watch the same job from the floor's side, and any of them can
be open at any point in Part two.

## The tablet at the machine · **Machine screen**

Everything in Step 7 can also be done from a tablet at the machine, and that
is where it is meant to be done. `/floor` is a different screen for a
different person: no sidebar, four big buttons and one job on it.

**It is not in the office sidebar, on purpose.** A tablet screen is reached by
bookmarking `/floor` on the tablet itself. Clicking it from a desk dropped the
whole app into a full-screen takeover with no way back, which is nobody's
intention — and if the works never puts a screen on the floor, this step is
one to skip. Production covers the same ground from the office.

### Setting a tablet up

Asked twice, once each:

1. **Which machine is this?** The tablet remembers, and from then on shows only
   the work at that machine.
2. **Who is on the machine?** That machine's own people are offered first —
   the press's operators on the press's tablet — and the rest of the works
   below them. One tap, and "Not you?" changes it at the start of a shift.

The name matters because it is the one thing the office was guessing at. A
stage used to be signed by whoever a supervisor remembered on Friday; now it is
signed by whoever pressed the button.

### What it shows

One job: the order, the design, the customer, which stage and how far down the
card it is, and four figures — ordered, on the machine, came off, waste. Under
it, what is next at this machine, so an operator can see the shape of their
shift without asking.

**Only work the reel has actually reached.** A stage whose predecessor has not
finished is never offered, so the lamination tablet cannot start a job that has
not been printed. A stage the office has assigned to Laminator 1 does not
appear on Laminator 2 — somebody chose, and a tablet quietly overriding that is
how two machines start the same job. A stage with no machine yet goes to
whichever machine of the right kind reaches it first.

### The four buttons

| Button           | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| **Start job**    | records the weight going on, the operator and the machine     |
| **Complete job** | records what came off, and hands the reel to the next machine |
| **Pause**        | stops the job, and asks why                                   |
| **Problem**      | the same, and reads as a problem rather than a break          |

Start and Complete are the **same write the office screen makes** — so the
material re-check still happens at the moment film goes on a machine, the card
still starts itself, and the reel is still handed on with its weight. A tablet
that recorded jobs its own way would drift from the job card within a month,
and the job card is the document the works is paid against. A job whose film is
not in is refused here too, in the same words.

### Why a machine is standing idle

This is the part nothing else recorded. A stage already says when it started,
when it finished and what it weighed; none of it could say why the press has
been quiet since eleven.

Pause and Problem both stop the job and both insist on a reason, and each one
is **logged rather than stored** — a shift holds four stoppages, and the fourth
overwriting the third is how a works loses its own day. The card reads **On
hold** on the office Production screen the moment the operator presses it,
with no phone call, and the reason is on the tablet for whoever comes on next
shift. **Start again** puts it back to running, and that is logged too.

A held job cannot be started or finished until somebody restarts it. Held means
held.

> This log is where Quality & Waste will read from when it is built. It is not
> that module: there is no severity and there are no categories, because
> inventing a vocabulary the works has not asked for is how a screen ends up
> with a dropdown nobody uses honestly.

---

## What went wrong, and where it went · **Quality & waste**

Two questions on one screen, and they are deliberately **different numbers**.

### Waste is read, not recorded

Every stage has said what went on and what came off since the job card was
built. Nothing new is entered here; the screen groups what the floor has been
typing all along.

**By process**, because that is the question it answers. A works losing 6% at
lamination and 1% everywhere else has a laminator problem, and no amount of
looking at individual jobs says so. The percentage is what to compare between
stages — the weight only tells you which stage runs the most film.

**By day**, for the last fortnight, with the quiet days drawn as noughts. A
trend with the empty days left out is not a trend; it is a list of busy days
drawn as though they were consecutive.

### A rejection is not waste

Waste is material lost **at the machine**. A rejection is finished film that
was made, weighed, and then failed at the checking table.

They are never added together. The material left the shelf once and was lost
once — counting a rejection as waste as well would make a works that scrapped
40 kg look as though it had lost 80, on the one screen built to tell it
otherwise.

A rejection has exactly one consequence, and it is not on this screen: **the
godown cannot send it.** Record 62.5 kg rejected and Dispatch's "in the
godown" drops by 62.5 kg the same moment, because that film is still in the
building and still cannot go on a lorry.

> Closing the issue does **not** give the film back. The scrap is a fact about
> the film, not about the paperwork chasing it. If it turns out to be fine
> after all, the honest way to say so is to put the rejected weight back to
> nought — and the godown figure returns with it.

### An issue has a life

Raised from the machine when the operator presses **Problem**, or here when it
is found afterwards. Either way it is a state rather than an event: it has a
severity, somebody answerable for it, and it stays on the list until it is
closed.

| Field             | Why it is there                                                 |
| ----------------- | --------------------------------------------------------------- |
| **How bad**       | High, medium, low — chosen at the machine by whoever can see it |
| **On it**         | an issue nobody owns is one nobody closes                       |
| **Rejected**      | finished film that cannot be sent. Usually nought               |
| **What was done** | required to close it                                            |

Three statuses, and the middle one earns its place: "being looked at" is a
different thing from nobody having picked it up, and a list where both read as
Open is a list the works stops believing. Both count as open.

**Closing takes a note.** "Resolved" on its own teaches nobody anything, and
the same defect comes back in March with nothing on file about what was done
in September. A closed issue can be reopened — the fix did not hold — rather
than raising a second one about the same defect and losing the history.

Worst first, and the oldest of those above the newest: an issue open a week
outranks one raised this morning, because it is the one being ignored.

---

## Where each machine is · **Machines**

Almost nothing on this screen is stored, and that is the point of it.

What is **on** a machine is the stage running on it. **Who** is on it is that
stage's operator. **Made today** and **waste** are the stages that finished on
it today. **Stood today** is the pauses and problems the machine screen has
been recording all along — which is what those reasons were being kept for.
None of it is a figure anybody maintains, so none of it can go stale.

### The one stored fact

A machine being down. And even that has no flag: **a maintenance record with
no end is the machine being down.** A status somebody has to remember to clear
is a status that is wrong, and the press would read "under maintenance" for a
fortnight after it came back.

Two kinds, because the works only distinguishes two: a **service** somebody
chose to do, and a **breakdown** nobody chose. Putting one down insists on a
reason; bringing it back asks what was done, but does not insist — a breakdown
that cleared itself is a real afternoon, and refusing the record would leave
the machine reading Down on every screen while it runs.

**It does not insist the job comes off first.** A press does not break down
politely between stages. The job stays where it is and the machine reads Down,
which is the truth; a system that demanded the stage be finished first is one
the fitter works around.

**Down sorts first**, because it is the only card asking for anything.

### What being down actually does

| Screen             | What happens                                                   |
| ------------------ | -------------------------------------------------------------- |
| **Machine screen** | the machine leaves the picker; a tablet already on it says why |
| **Machine screen** | no job can be started on it, in the same words                 |
| **Planning**       | the row says the machine is down — but still lets you book it  |

Planning warns and does not block, deliberately: **you schedule around a
service**, and that is the whole point of knowing about one. The warning only
ever says "right now", because nothing schedules maintenance ahead and a claim
about next Tuesday would be invented.

Maintenance counts towards the time a machine has stood, alongside the floor's
own stoppages. A downtime figure that counted the fitter but not the four
pauses — or the other way round — would flatter the works exactly where it
should not.

### What this screen is not

It does not edit the machines. Their names, speeds, horsepower and what they
cost to run stay on the **Costing** screen, because that is what they are for.
This one says where they are, not what they cost.

And nothing is scheduled ahead: no intervals, no next-service dates. Those
would need a figure per machine that the works has not given us, and an
interval nobody set becomes a red flag everybody learns to ignore.

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

# Every screen, and what it is for

Nineteen screens. For each: what it answers, what has to exist before it is
any use, and what it feeds further down the line.

Grouped the way the sidebar groups them — eighteen are on it, and the
nineteenth, the machine screen, is deliberately not.

---

## Overview

### Overview

**Answers** — where is everything, and what needs me today.
**Needs first** — nothing of its own. It is a reading of the other screens.
**Feeds** — nothing. It writes nothing at all, so it is safe to leave open.

The page signing in lands on. Three bands, in the order the questions get
asked: **the chain** across the top — quoted, on the books, scheduled, on the
floor, in the godown, gone this month — then **what needs attention**, worst
first, each line a link straight to the screen that fixes it, then **the floor
itself**, laid out by stage.

It owns no figures. The godown figure is Dispatch's, the waste figure is
Quality's, the machine states are Machines'. An overview that worked out its
own version of any of them would drift from the screen it summarises, and then
somebody has to check both, every time, forever.

Nothing on it is a rate, a margin or a cost — counts, weights, and what is
riding on the floor. It refetches every thirty seconds, because it is a screen
people leave open on a desk.

---

## Commercial

### Customers

**Answers** — who we sell to, and what designs they have.
**Needs first** — nothing. This is where a works starts.
**Feeds** — every quotation, and through it every order, job card and invoice
line. A customer's designs are what the quotation wizard offers.

Company, brand, GST number, address, contact. The brand is what the office
actually calls them, so it is what the screens show; the company name is what
a bill has to carry.

### Designs

**Answers** — every product on the books, and which of them nobody has
claimed.
**Needs first** — Customers, for a design to belong to somebody.
**Feeds** — the quotation wizard, which starts from a customer and offers
their designs.

The list nothing else provides, and a worklist for the seventy-odd designs
that came off the old sheets with no customer. Assigning one is all it writes.

### Quotations

**Answers** — what we have offered, at what price, and what came of it.
**Needs first** — Rates and Costing, or the price is wrong and nothing says
so. A customer and a design.
**Feeds** — orders, and through them the job card's bill of materials. **The
quotation is the only place a job's structure is recorded**, which is why a
job typed straight into Orders can never have its film worked out.

Priced at up to three quantities at once. Costed on the figures in force on
**its own date**, so putting up the price of film today does not move a
quotation sent last month.

### Orders

**Answers** — what the customer committed to, at what price, and when it is
wanted.
**Needs first** — a won quotation, or the office typing one for repeat work.
**Feeds** — Planning, job cards, and Dispatch.

One order per quotation **line**, not per quotation: three jobs on one
quotation are made, finished and delivered separately, and one order holding
all three could never say that two are done and one is late.

### Dispatch

**Answers** — what has left the building, on whose lorry, and what is still
standing in the godown.
**Needs first** — a finished job card, so there is something to send.
**Feeds** — the order's status. Sending the last of an order is what completes
it.

One note is one lorry and one customer, with a line per order aboard and a row
per reel beneath it.

---

## Materials

### Inventory

**Answers** — what the works holds, what it is worth, and what is running out.
**Needs first** — Rates, for a material to exist at all.
**Feeds** — every job card's material check, and the job sheet that finally
takes stock down.

**The single source of truth for stock.** Where a thing is sitting is a free
text note on the batch, not a managed list — see _Deliberately not built_.

### Purchase

**Answers** — what is on order, with whom, and what has arrived.
**Needs first** — Rates and a supplier.
**Feeds** — Inventory. Accepting a delivery is one of the two ways stock comes
into existence, and it goes through the inventory service rather than writing
batches itself.

### Rates

**Answers** — what every material costs today, and what it cost on any past
day.
**Needs first** — nothing.
**Feeds** — every quotation and every job sheet.

Rates carry the date they apply from. Nothing already quoted moves when one
changes.

### Costing

**Answers** — what the works itself costs to run: machines, wages, overheads
and the settings behind every price.
**Needs first** — nothing.
**Feeds** — every quotation. A machine speed or a wage moves the price of
every job quoted afterwards, which is why changing anything here needs the
rates permission.

---

## Production

### Planning

**Answers** — can it run, when does it run, and on which machine.
**Needs first** — a confirmed order.
**Feeds** — nothing automatically. It is a note of intent: it reserves no film
and raises no card.

Asks the job card's own material question **before** a card exists, so nobody
finds out a job cannot be made by trying to make it.

### Production

**Answers** — what is on the floor right now and how far along.
**Needs first** — an order. The film, unless somebody allows it to run short.
**Feeds** — the job sheet, and the godown once a card finishes.

The job card **claims** film; it never takes it off the shelf.

### Machine screen

**Answers** — for one operator at one machine: what am I running, and what do
I press.
**Needs first** — a machine, a job that has reached it, and a name to tap.
**Feeds** — exactly what the Production screen feeds, because it is the same
write through the same service.

Not in the sidebar: bookmark `/floor` on the tablet. If no screen ever goes on
the floor, skip it — Production covers the same ground from the office.

### Design & Cylinders

**Answers** — which designs have an engraved set, where each cylinder is, and
what state it is in.
**Needs first** — a design.
**Feeds** — the cylinder charge on a quotation, and the artwork a job prints
from.

### Job sheets

**Answers** — what a run actually consumed and what it actually cost a
kilogram.
**Needs first** — a finished job card.
**Feeds** — **stock.** Posting a sheet is the only thing in the entire system
that reduces it.

The quotation said what a job _should_ cost. This says what it _did_, on the
works' own printed form.

### Quality & waste

**Answers** — where material is being lost, and what is still wrong.
**Needs first** — finished stages to read waste from.
**Feeds** — Dispatch. A rejection is finished film that cannot be sent, and
the godown counts it out.

Waste and rejections are **different numbers and never added together**.

---

## Resources

### Machines

**Answers** — where each machine is, what is on it, and why one is standing.
**Needs first** — machines on the Costing screen.
**Feeds** — the machine screen, which will not start a job on a machine that
is down, and Planning, which warns but still lets you book around a service.

Almost nothing here is stored. The one stored fact is a machine being down —
and a record with no end **is** the machine being down.

### Employees

**Answers** — who is here, what they do, and what they are on right now.
**Needs first** — the wages on the Costing screen, for a role to point at.
**Feeds** — the operator box on every job card and machine screen.

Deliberately not a personnel system: no attendance, no leave, no payroll.

---

## Administration

### Users

**Answers** — who can sign in, and which sections each of them sees.
**Needs first** — nothing.
**Feeds** — what every other screen will let somebody do. Administrators see
everything; everybody else sees the sections ticked for them.

Hiding a section is a courtesy, not the lock. The server refuses the same
things independently.

---

# How the screens feed each other

Two ideas cover almost all of it.

## Nothing is typed twice

A fact is entered once and travels. Nobody retypes the customer onto the
order, the design onto the job card, or the quantity onto the job sheet.

```
   Customer ──► Quotation ──► Order ──► Job card ──► Job sheet ──► Dispatch
                    │                      │
                    │                      └─► claims film from Inventory
                    └─► priced from Rates + Costing, as at its own date
```

The one place this breaks is deliberate: **an order typed straight into
Orders, with no quotation behind it, has no structure** — so the job card
cannot work out what film it needs and says so, rather than guessing.

## Most of what you see is worked out, not stored

If a figure can be calculated from something else, it is — every time it is
shown. Nothing on this list is a field anybody maintains, and none of it can
go stale:

| Figure                       | Worked out from                                               |
| ---------------------------- | ------------------------------------------------------------- |
| How far a job card has got   | its stages that are done                                      |
| Whether an order is late     | its due date against today                                    |
| What is free in stock        | on hand, less what open job cards have claimed                |
| What a job is short of       | what it needs, against what is free and wide enough           |
| Who is on a machine          | the stage running on it                                       |
| What is in the godown        | what finished cards made, less what has gone, less rejections |
| Whether a machine is down    | a maintenance record with no end                              |
| How long a machine has stood | the pauses, problems and repairs recorded on it               |
| Waste at a stage             | what went on, less what came off                              |

## Change this, and this follows

| If you change…                      | …this moves                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A material rate                     | quotations raised **from now on**. Nothing already quoted                                                                                           |
| A machine speed, wage or overhead   | the same — from now on only                                                                                                                         |
| A costing setting (margin, wastage) | the same. Which is why it needs the rates permission                                                                                                |
| Win a quotation                     | one order per line, plus a design record for any line that did not already have one. Both idempotent: winning twice creates nothing the second time |
| Raise a job card                    | film, ink and adhesive are **claimed** — free stock drops, the shelf does not                                                                       |
| Start a stage                       | the card starts, and the order moves to In production                                                                                               |
| Finish a stage                      | the reel passes to the next machine with its weight                                                                                                 |
| Post a job sheet                    | **stock comes down**, and the card's claim is released                                                                                              |
| Record a rejection                  | the godown has that much less to send                                                                                                               |
| Put a machine down                  | it leaves the floor's picker; Planning warns but still books it                                                                                     |
| Send a dispatch note                | every order it finishes becomes Completed                                                                                                           |
| Cancel a sent note                  | the goods come back, and a completed order reopens                                                                                                  |

## The one rule about stock

**A job's material comes off the shelf exactly once, and only the job sheet
does it.**

- A **job card claims** film. This is a promise, not a movement — the shelf is
  untouched, and another job simply cannot promise the same roll.
- A **job sheet issues** it. Posting a sheet releases the claim at the same
  moment, in the same transaction, so a claim and an issue can never both
  stand against the same film.

Everything else in a job's life that touches material — Planning's check, the
machine screen's refusal, Quality's rejection, Dispatch's godown figure —
**reads** and never writes.

Two things outside a job's life also move stock, and both are meant to:

| Where                     | What it does                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Purchase**, on delivery | opens a batch — this is how film arrives                                                                                                 |
| **Inventory**, by hand    | receive, issue, adjust or transfer, for the things a job sheet cannot explain: a stocktake correction, film lent to another job, a spill |

Both go through the one inventory service that owns the ledger — Purchase
does not write batches itself — so however stock moves, it is written the same
way and the batch always agrees with its own movements. There is a check for
exactly that: `npm run audit -w @yuva/api`.

---

---

# Seeing it end to end

There is a demonstration set built into the system — ten jobs, spread the way a
real week is spread:

```bash
npm run seed:demo -w @yuva/api
```

| Stage              | What to look at                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Quoted**         | a quotation sent, nobody has answered                                                                          |
| **Ordered**        | won, on the books, booked onto a press — and one of the two cannot make its date                               |
| **On the floor**   | printing done, lamination running — one issue open against it and one closed                                   |
| **Serviced**       | one laminator down four hours and back, with what was done                                                     |
| **Finished**       | every stage done, costed, taken off stock                                                                      |
| **Part delivered** | half of it gone on a lorry, listed reel by reel, with the balance still in the godown and a draft note waiting |
| **Short of film**  | a card raised and refusing to start, because the poly it needs is genuinely not stocked                        |

Walk Quotations → Orders → Planning → Production → Job sheets → Dispatch →
Inventory in that order and the chain reads in one sitting; Machines and
Quality & waste can be looked at from anywhere along it. Remove it again with:

```bash
npm run seed:demo -w @yuva/api -- --clear
```

---

# What is not built yet

So nobody goes looking for it:

- **Capacity scheduling.** Planning records the day and the machine somebody
  chose; it does not work out the sequence, and it will happily let two jobs be
  booked onto one press on one day. The machine load card shows that happening
  rather than preventing it, which is the honest half of the job.
- **Reports** — the report cards, the exports and the profitability figures. The Overview answers the daily "where is everything"; this would be the month-end reading of it.
- **Reserving by roll on the job sheet.** The card earmarks particular rolls;
  the sheet still issues by weight, oldest first, and does not check that the
  roll it took is the roll that was held.
- **A GST tax invoice.** Dispatch raises a delivery challan, which is what goes
  with the goods. Billing is its own document and needs groundwork the system
  does not have yet: the works' own GSTIN and registered address, an HSN code
  per product, place of supply, and the CGST/SGST against IGST split. The e-way
  bill above ₹50,000 sits on top of that again.
- **A pouch count on the job sheet.** The works weighs what it packs, so nothing
  records how many bags a run actually made. Dispatch infers it from the weight
  — ordered count against ordered weight — which is why a pouch order's godown
  figure is an estimate. Nothing is blocked on it: the over-production check is
  on weight alone.

---

# Deliberately not built

Different from the list above: these were considered and turned down, so they
do not get proposed again every six months.

### A Warehouse module

The wireframe has one — a zone map of Raw Material Storage, Ink & Chemical
Storage, Roll Storage and Finished Goods, each showing what is in it.

**Inventory is the source of truth for stock, and a second screen over the same
rows would be a second answer to "how much have we got".** Where a thing is
sitting is already on the batch: `location` is free text on every stock batch —
"Warehouse A", "A-01" — typed when the delivery is booked in, and shown on the
Inventory screens.

That field is free text on purpose, and the reason is the reason there is no
module: the works has **one building**. A managed list of zones is a list
somebody has to maintain, and a location table nobody maintains is worse than a
field somebody types — it goes stale, and then the screen is confidently wrong
about where the film is.

If the works ever takes a second building, the thing to add is a filter and a
grouping on the Inventory screen, not a module.

---

And two gaps in the works' own data worth closing:

- There is **no pouch-making machine** on the Costing screen, so that stage's
  machine box has nothing to offer and pouch making is not costed by the minute.
- The **Pouch Operator** wage is a placeholder. It costs nothing until a
  pouch-making machine exists — but the day one is added, it starts pricing
  every pouch job.
- **PP Film and Nylon Poly** came in with the stock register — 3,254 kg of them
  — and have **no rate and no density**. Nothing can be quoted on either until
  both are set, and a film with no density is priced as though that ply weighed
  nothing.
- The **new laminator's real speed**. Both are entered at 70 m/min, and
  Laminator 2 is the one marked _Costed on this_, so every quotation is built
  from that figure — whatever it truly runs at.
