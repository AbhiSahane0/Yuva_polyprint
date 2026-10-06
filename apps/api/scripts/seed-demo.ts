/**
 * **Ten jobs, spread the way a real week is spread.**
 *
 * Not fixtures. Every row below is produced by the same services the screens
 * call — a quotation is costed by the costing engine, winning it raises the
 * order, raising a card derives its stages from the structure, starting one
 * checks the film is free, and the finished job's sheet posts what it actually
 * took off stock. If any of that breaks, this script breaks, which is most of
 * why it is worth having.
 *
 * The spread itself is `PLAN`, below — two quotations nobody has answered, one
 * lost, two on the books with one of them already late, three at different
 * points on the floor, one finished and costed, and one the works has not got
 * the film for. On top of that it services a laminator, raises two quality
 * issues, and sends half of the finished job on a lorry with a draft note
 * behind it.
 *
 * It uses the works' REAL customers and designs, so the screens read as they
 * would in use, and it creates no customer and no design of its own. Everything
 * it does create is marked, and `--clear` removes exactly that and nothing else:
 *
 *   npm run seed:demo -w @yuva/api
 *   npm run seed:demo -w @yuva/api -- --clear
 */
import {
  adhesiveGsmFor,
  costRate,
  createQuotationSchema,
  parseStationSteps,
  receiveStockSchema,
  type CostingInput,
} from '@yuva/shared';
import { prisma } from '../src/lib/prisma.js';
import { createQuotation, recordOutcome } from '../src/modules/quotations/quotation.service.js';
import { getMasterData } from '../src/modules/costing/costing.service.js';
import { getSettings } from '../src/modules/settings/settings.service.js';
import {
  createProduction,
  updateProduction,
  updateStage,
} from '../src/modules/production/production.service.js';
import { createEmployee } from '../src/modules/employees/employee.service.js';
import {
  createDispatch,
  postDispatch,
  readyToSend,
} from '../src/modules/dispatch/dispatch.service.js';
import { planOrder } from '../src/modules/planning/planning.service.js';
import { raiseIssue, updateIssue } from '../src/modules/quality/quality.service.js';
import { receiveStock } from '../src/modules/inventory/inventory.service.js';
import {
  costSheet,
  createJobSheet,
  postToStock,
  updateJobSheet,
} from '../src/modules/job-sheets/job-sheet.service.js';

/** What marks a row as this script's. Searched for by `--clear`. */
const MARK = '[demo]';
const BATCH_PREFIX = 'DEMO-';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * What the works would quote this at.
 *
 * Priced by the engine the wizard prices with, against the master as it stands
 * — not a number picked to look plausible. If the costing changes, these change
 * with it, which is the point of a demo built out of the real thing.
 */
async function quoteRate(input: {
  kg: number;
  widthMm: number;
  heightMm: number;
  ups: number;
  cylinders: number;
  layers: { name: string; micron: number; density: number; ratePerKg: number }[];
}): Promise<number> {
  const settings = await getSettings();
  const master = await getMasterData();
  const rates = new Map(
    (
      await prisma.material.findMany({
        select: {
          name: true,
          rates: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { rate: true } },
        },
      })
    ).map((m) => [m.name, Number(m.rates[0]?.rate ?? 0)] as const),
  );
  const priceOf = (name: string) => rates.get(name) ?? 0;

  const costing: CostingInput = {
    job: {
      orderQtyKg: input.kg,
      filmWidthMm: input.widthMm,
      filmHeightMm: input.heightMm,
      ups: input.ups,
      stationCount: input.cylinders,
      layers: input.layers,
      wastagePercent: settings.pouchWastagePercent,
      trimMm: settings.defaultTrimMm,
      inkGsmOverride: settings.pouchInkGsm,
      colours: [],
      flatInk: { ratePerKg: priceOf(settings.defaultFlatInkMaterial) },
      adhesive: {
        gsm: adhesiveGsmFor({
          pouchType: input.pouchType ?? null,
          hasDPunch: input.hasDPunch ?? false,
          plies: input.layers,
          thinGsm: settings.adhesiveCoatThinGsm,
          thickGsm: settings.adhesiveCoatThickGsm,
          thickPlyMicron: settings.adhesiveThickPlyMicron,
          pouchAdhesiveGsm: settings.pouchAdhesiveGsm,
        }),
        flatRatePerKg: priceOf(settings.defaultFlatAdhesiveMaterial),
        ratio: settings.defaultAdhesiveRatio,
        adhesiveRatePerKg: priceOf(settings.defaultAdhesiveMaterial),
        ethylAcetateRatePerKg: priceOf(settings.defaultEthylAcetateMaterial),
        hardenerRatePerKg: priceOf(settings.defaultHardenerMaterial),
      },
      solvent: {
        inkParts: 100,
        solventParts: settings.inkSolventParts,
        ethylAcetatePercent: settings.ethylAcetatePercent,
        ethylAcetateRatePerKg: priceOf(settings.defaultEthylAcetateMaterial),
        tolueneRatePerKg: priceOf(settings.defaultTolueneMaterial),
      },
      makesPouches: true,
      pouchType: 'CENTRE_SEAL',
      adhesiveSplitRatio: settings.adhesiveSplitRatio,
    },
    machines: master.machines.map((m) => ({
      ...m,
      stationColourSteps: parseStationSteps(String(m.stationColourSteps ?? '')),
    })) as CostingInput['machines'],
    labour: master.labour,
    overheads: {
      workingDaysPerMonth: settings.workingDaysPerMonth,
      hoursPerDay: settings.hoursPerDay,
      transportPerKg: settings.transportPerKg,
      packingPerKg: settings.packingPerKg,
      otherPerJob: settings.otherPerJob,
      emiPerMonth: settings.emiPerMonth,
      emiHoursPerMonth: settings.emiHoursPerMonth,
      emiBasis: settings.emiBasis,
      rateModel: settings.rateModel,
      worksDayCost: settings.worksDayCost,
      makeReadyDays: settings.makeReadyDays,
      machineMinutesPerDay: settings.machineMinutesPerDay,
      kgPerDay: settings.kgPerDay,
      stationSurcharges: [
        settings.stationSurcharge6,
        settings.stationSurcharge7,
        settings.stationSurcharge8,
      ],
      marginBasis: settings.marginBasis,
      inkCostModel: settings.inkCostModel,
      adhesiveCostModel: settings.adhesiveCostModel,
      marginPercent: settings.defaultMarginPercent,
      pouchMakingPerKg: null,
      pouchMaking: {
        makingPerPouch: settings.pouchMakingPerPouch,
        dPunchPerPouch: settings.dPunchPerPouch,
        dPunchLargePerPouch: settings.dPunchLargePerPouch,
        dPunchLargeAboveMm: settings.dPunchLargeAboveMm,
        zipperRatePerMetre: settings.zipperRatePerMetre,
      },
      overheads: master.overheads,
    } as CostingInput['overheads'],
  };

  const costed = costRate(costing);
  return costed ? Number(costed.ratePerKg.toFixed(2)) : 0;
}

/* ------------------------------------------------------------------ clear */

async function clear(quiet = false) {
  /*
   * Straight through Prisma rather than the services, and deliberately: a
   * posted job sheet refuses to be deleted, and a completed card refuses too.
   * Both refusals are right for the works' own records and wrong for a demo
   * somebody wants to reset. This is the one place that goes around them.
   */
  const sheets = await prisma.jobSheet.findMany({
    where: { notes: { contains: MARK } },
    select: { id: true, number: true },
  });
  const batches = await prisma.stockBatch.findMany({
    where: { batchCode: { startsWith: BATCH_PREFIX } },
    select: { id: true },
  });

  /*
   * Before the orders: a dispatch line points at its order with a RESTRICT, so
   * the order cannot go while a challan still names it — which is the whole
   * point of that constraint and exactly right outside a demo.
   */
  /* The demo's own maintenance. Matched on the reason, like everything else
     this script leaves behind. */
  const services = await prisma.maintenanceRecord.deleteMany({
    where: { reason: { contains: MARK } },
  });

  /* Issues cascade from the card, so they go with it — counted here so the
     line the script prints is not quietly wrong. */
  const issues = await prisma.qualityIssue.count({
    where: { productionOrder: { notes: { contains: MARK } } },
  });

  const notes = await prisma.dispatch.findMany({
    where: { notes: { contains: MARK } },
    select: { id: true },
  });
  await prisma.dispatchLine.deleteMany({ where: { dispatchId: { in: notes.map((n) => n.id) } } });
  await prisma.dispatch.deleteMany({ where: { id: { in: notes.map((n) => n.id) } } });

  await prisma.stockMovement.deleteMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
  await prisma.jobSheet.deleteMany({ where: { id: { in: sheets.map((s) => s.id) } } });
  await prisma.stockBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
  /* Stages and reservations go with the card. */
  const cards = await prisma.productionOrder.deleteMany({ where: { notes: { contains: MARK } } });
  const orders = await prisma.order.deleteMany({ where: { notes: { contains: MARK } } });
  const quotations = await prisma.quotation.deleteMany({ where: { notes: { contains: MARK } } });
  const people = await prisma.employee.deleteMany({ where: { notes: { contains: MARK } } });

  if (quiet) return;
  console.log(
    `Removed ${quotations.count} quotations, ${orders.count} orders, ${cards.count} job cards,`,
  );
  console.log(
    `        ${sheets.length} job sheets, ${notes.length} dispatch notes, ${issues} quality issues,`,
  );
  console.log(`        ${services.count} maintenance records,`);
  console.log(`        ${batches.length} stock batches, ${people.count} employees.`);
}

/** One line per job, so the run reads as the list it is. */
const say = (level: string, what: string, detail: string) =>
  console.log(`  ${level.padEnd(15)} ${what.padEnd(26)} ${detail}`);

/* ------------------------------------------------------------------- seed */

/**
 * The four designs, and what each is for. Real rows, looked up by name.
 *
 * The polys are the works' own: their printed job sheet has exactly three film
 * rows — PET, Met PET and LDPE — so a job that will reach a sheet is built from
 * films the sheet can actually account for. W/O Poly is on the rates master and
 * not on the form, which is fine for a job that stops at the order.
 */
/**
 * The spread, and what each row means.
 *
 * Not one job at each stage in a tidy row — a works has several quotations out
 * that nobody has answered, one it lost, a couple waiting to start, three or
 * four on the floor at different points, and one finished. It also, sooner or
 * later, has a job it has not got the film for.
 *
 * `level` is what to do with it, and the loop below reads it:
 *
 *   sent          a quotation out, nobody has answered
 *   lost          turned down, with a reason
 *   ordered       won, on the books, nothing started
 *   ordered-late  the same, but past the day it was promised
 *   printing      on the press now
 *   laminating    printed, on the laminator now
 *   slitting      printed and laminated, on the slitter now
 *   finished      every stage done, costed, off stock
 *   short         raised, and the works has not got the film — the block
 *
 * The polys are chosen on purpose. A job that reaches a job sheet uses films
 * the works' printed form has rows for — PET, Met PET and LDPE. The short one
 * uses a film nothing stocks, which is what makes it short.
 */
const PLAN = [
  { design: 'Maharaja Atta 5kg.', level: 'sent', kg: 800, poly: 'W/O Poly 110µm', polyMicron: 85 },
  { design: 'Lokraja Atta 5kg.', level: 'sent', kg: 500, poly: 'W/O Poly 110µm', polyMicron: 60 },
  { design: 'Kanik Atta 5kg.', level: 'lost', kg: 900, poly: 'W/O Poly 110µm', polyMicron: 85 },
  {
    design: 'Sanvi Atta 5kg.',
    level: 'ordered',
    kg: 1200,
    poly: 'W/O Poly 110µm',
    polyMicron: 85,
  },
  {
    design: 'Nutrilex 500gm. (Boron)',
    level: 'ordered-late',
    kg: 700,
    poly: 'W/O Poly 110µm',
    polyMicron: 45,
  },
  {
    design: 'Chitra Wafers 10Rs.',
    level: 'printing',
    kg: 600,
    poly: 'LDPE Milky / Natural',
    polyMicron: 25,
  },
  {
    design: 'Sarthak Sonpapadi Mango',
    level: 'laminating',
    kg: 850,
    poly: 'LDPE Milky / Natural',
    polyMicron: 40,
    /* Five colours: CMYK and the brand's own orange on the fifth station. */
    spot: { name: 'Mango Orange (spot)', ink: 'Ink — Orange', laydownGsm: 0.22 },
  },
  {
    design: 'Mauli Bhell',
    level: 'slitting',
    kg: 750,
    poly: 'LDPE Milky / Natural',
    polyMicron: 45,
  },
  {
    design: 'Amrut Sugar Gold 1kg',
    level: 'finished',
    kg: 1000,
    poly: 'LDPE Milky / Natural',
    polyMicron: 60,
  },
  {
    design: 'Paradise Frozen Green Pease 500g.',
    level: 'short',
    kg: 650,
    /* Nothing stocks this one, which is the point of the row. */
    poly: 'PE 60µm',
    polyMicron: 55,
  },
] as const;

/**
 * Which day each job card's **first** finished stage came off, counting back
 * from today. Its later stages walk forward one day at a time from there.
 *
 * Indexed by card rather than by `PLAN` position, because only five of the ten
 * rows reach a job card at all — the quotations and the plain orders never
 * touch a machine. Spread across the fortnight on purpose: a works has heavy
 * days and quiet ones, and the overview's trend chart is there to show that
 * shape. A seed that put every run on one afternoon would draw one spike and
 * thirteen empty days, which teaches nobody anything.
 */
const FIRST_RAN_ON = [13, 11, 8, 6, 3] as const;

/**
 * What each job prints.
 *
 * Four process colours is the ordinary job. **A five-colour job is CMYK plus a
 * spot**, and the spot is the interesting one: at quotation time the office
 * does not know which ink it will be, so the wizard prices "Special colour" at
 * the dearest ink on the list and names no drum. By the time it is a job card
 * the works has chosen — and once it has, the card can hold that drum like any
 * other.
 *
 * Sarthak Sonpapadi Mango carries the spot: a mango sweet in an orange the
 * brand owns, run on the fifth station.
 *
 * Laydown and solids are the works' own — their four process inks sit at 23%
 * solids, and a spot laid solid goes on heavier than a process screen.
 */
const CMYK = [
  { name: 'Cyan', ink: 'Ink — Cyan', laydownGsm: 0.14 },
  { name: 'Magenta', ink: 'Ink — Magenta', laydownGsm: 0.13 },
  { name: 'Yellow', ink: 'Ink — Yellow', laydownGsm: 0.13 },
  { name: 'Black', ink: 'Ink — Black', laydownGsm: 0.15 },
] as const;

const SOLIDS_PERCENT = 23;

/** Which stage each level leaves running. Everything before it is done. */
const RUNNING_AT: Partial<Record<(typeof PLAN)[number]['level'], string>> = {
  printing: 'PRINTING',
  laminating: 'LAMINATION',
  slitting: 'SLITTING',
};

async function main() {
  if (process.argv.includes('--clear')) {
    await clear();
    return;
  }

  /*
   * Cleared first, every time, so the script can be run again after a change
   * and land in a known state — including after one of its own runs failed
   * halfway and left people on the books with no jobs behind them.
   */
  await clear(true);

  /* --- the works' people, so a stage names somebody ---------------------- */
  const roles = await prisma.costingLabour.findMany({
    where: { effectiveTo: null },
    select: { id: true, role: true },
  });
  const roleId = (name: string) => roles.find((r) => r.role === name)?.id ?? null;

  const people: Record<string, string> = {};
  for (const [name, role, shift] of [
    ['Rahul Patil', 'Printing Operator', 'MORNING'],
    ['Amit Shinde', 'Printing Helper', 'MORNING'],
    ['Suresh Kale', 'Lamination Operator', 'MORNING'],
    ['Manoj Jadhav', 'Slitting Operator', 'AFTERNOON'],
  ] as const) {
    const made = await createEmployee({
      name,
      code: '',
      roleId: roleId(role),
      roleName: roleId(role) ? '' : role,
      shift,
      phone: '',
      joinedOn: null,
      isActive: true,
      notes: MARK,
    });
    people[name] = made.id;
  }
  console.log(`Four people on the books.`);

  /* --- film on the shelf, or nothing can start --------------------------- */
  const materials = await prisma.material.findMany({
    select: {
      id: true,
      name: true,
      unit: true,
      density: true,
      rates: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { rate: true } },
    },
  });
  const materialId = (name: string) => materials.find((m) => m.name === name)!.id;
  const densityOf = (name: string) => Number(materials.find((m) => m.name === name)?.density ?? 1);
  const rateOf = (name: string) =>
    Number(materials.find((m) => m.name === name)?.rates[0]?.rate ?? 0);
  const unitOf = (name: string) => materials.find((m) => m.name === name)?.unit ?? 'KG';

  for (const [name, kg] of [
    ['PET 12µm', 4000],
    ['MET PET 12µm', 2500],
    ['W/O Poly 110µm', 5000],
    ['LDPE Milky / Natural', 4000],
    /* PE 60µm is deliberately NOT received. One job is built on it, and that
       is what puts a real shortage on the floor to look at. */

    /*
     * The ink store. Drums, not reels — no width, and none is asked for.
     *
     * The four process colours go further than the spots because every printed
     * job uses them; a spot colour is one brand's. The solvents dwarf both:
     * ink is thinned 100:80 and the adhesive is let down 100:146:15, so ethyl
     * acetate is the thing the works actually gets through.
     */
    ['Ink — Cyan', 180],
    ['Ink — Magenta', 180],
    ['Ink — Yellow', 180],
    ['Ink — Black', 220],
    ['Ink — Orange', 60],
    ['Ink — White', 140],
    ['Solvent — Ethyl Acetate', 1200],
    ['Solvent — Toluene', 500],
    ['Adhesive — PU', 400],
    ['Adhesive — Hardener', 90],
  ] as const) {
    await receiveStock(
      receiveStockSchema.parse({
        materialId: materialId(name),
        batchCode: `${BATCH_PREFIX}${name
          .replace(/[^A-Za-z0-9]+/g, '-')
          .replace(/-+$/, '')
          .toUpperCase()}`,
        quantity: kg,
        /* Each material's own unit: the solvents are stocked in litres, and the
           server refuses a unit it cannot convert rather than guessing. */
        unit: unitOf(name),
        receivedOn: daysAgo(20),
        location: 'Warehouse A',
        notes: MARK,
      }),
      'Demo',
    );
  }
  /*
   * One service that is over.
   *
   * Closed on purpose, and on the machine the demo leaves idle: an OPEN
   * record takes a machine off the floor's picker and refuses work on it,
   * which would quietly break the production story the rest of this script
   * sets up. A finished spell gives the Machines screen its history without
   * touching anything else.
   */
  const spare = await prisma.costingMachine.findFirst({
    where: { isActive: true, kind: 'LAMINATION' },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  if (spare) {
    const latest = await prisma.maintenanceRecord.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    await prisma.maintenanceRecord.create({
      data: {
        number: (latest?.number ?? 0) + 1,
        machineId: spare.id,
        kind: 'SERVICE',
        reason: `Six-monthly service — gearbox oil and nip rollers ${MARK}`,
        startedAt: new Date(`${daysAgo(4)}T09:00:00.000Z`),
        endedAt: new Date(`${daysAgo(4)}T13:30:00.000Z`),
        workDone: 'Oil changed, both nip rollers dressed, guard interlock replaced.',
        reportedBy: 'Demo',
        closedBy: 'Demo',
      },
    });
    console.log('One machine serviced and back.');
  }

  console.log('Film on the shelf.');

  /* --- and the ten jobs -------------------------------------------------- */
  /* How many cards have been built, so the fortnight spread above is indexed by
     card and not by the plan row — half the rows never reach a machine. */
  let cardsMade = 0;

  for (const plan of PLAN) {
    const design = await prisma.job.findFirst({
      where: { jobName: plan.design },
      select: {
        id: true,
        jobName: true,
        customerId: true,
        petMicron: true,
        metPetMicron: true,
        designOpenWidth: true,
        designHeight: true,
        ups: true,
        totalCylinders: true,
        customer: { select: { companyName: true, mobile: true, email: true } },
      },
    });
    if (!design?.customer) {
      console.log(`  skipped ${plan.design} — not on the design master`);
      continue;
    }

    const met = Number(design.metPetMicron ?? 0);
    const plies = [
      { name: 'PET 12µm', micron: Number(design.petMicron ?? 12) },
      ...(met > 0 ? [{ name: 'MET PET 12µm', micron: met }] : []),
      { name: plan.poly, micron: plan.polyMicron },
    ];
    const layers = plies.map((ply) => ({ materialId: materialId(ply.name), micron: ply.micron }));

    const ratePerKg = await quoteRate({
      kg: plan.kg,
      widthMm: Number(design.designOpenWidth),
      heightMm: Number(design.designHeight),
      ups: Number(design.ups ?? 1),
      cylinders: Number(design.totalCylinders ?? 4),
      layers: plies.map((ply) => ({
        name: ply.name,
        micron: ply.micron,
        density: densityOf(ply.name),
        ratePerKg: rateOf(ply.name),
      })),
    });

    const quotation = await createQuotation(
      createQuotationSchema.parse({
        date: daysAgo(14),
        customerId: design.customerId,
        customerName: design.customer.companyName,
        /*
         * The legacy import wrote the literal 'NA' where the sheet was blank,
         * and a quotation takes neither that as an address nor as a number.
         * The customer's own record is left exactly as it is — this is only
         * what travels onto the quotation.
         */
        mobile: /^\d{10}$/.test(design.customer.mobile) ? design.customer.mobile : '9999999999',
        email: /@/.test(design.customer.email) ? design.customer.email : 'office@example.com',
        notes: `${MARK} Demonstration data — remove with "seed:demo -- --clear".`,
        status: plan.level === 'sent' ? 'SENT' : 'DRAFT',
        items: [
          {
            jobId: design.id,
            jobName: design.jobName,
            jobKind: 'POUCH',
            pouchType: 'CENTRE_SEAL',
            pricingBasis: 'PER_KG',
            widthMm: Number(design.designOpenWidth),
            heightMm: Number(design.designHeight),
            layers,
            colours: [
              ...CMYK.map((colour) => ({
                name: colour.name,
                kind: 'PROCESS' as const,
                materialId: materialId(colour.ink),
                laydownGsm: colour.laydownGsm,
                solidsPercent: SOLIDS_PERCENT,
                ratePerKg: rateOf(colour.ink),
              })),
              /* The fifth station, on the one job that has one. */
              ...(plan.spot
                ? [
                    {
                      name: plan.spot.name,
                      kind: 'SPECIAL' as const,
                      materialId: materialId(plan.spot.ink),
                      laydownGsm: plan.spot.laydownGsm,
                      solidsPercent: SOLIDS_PERCENT,
                      ratePerKg: rateOf(plan.spot.ink),
                    },
                  ]
                : []),
            ],
            quantities: [{ quantityKg: plan.kg, ratePerKg, quantityPouches: 0, ratePerPouch: 0 }],
            repeatWidth: Number(design.ups ?? 1),
            repeatHeight: 1,
            cylinderCount: Number(design.totalCylinders ?? 4),
            /* The works already has these cylinders — it is a repeat job. */
            chargeCylinders: false,
            transportCost: 0,
          },
        ],
      }),
    );

    if (plan.level === 'sent') {
      say('Sent', `quotation #${quotation.number}`, design.jobName);
      continue;
    }

    if (plan.level === 'lost') {
      await recordOutcome(quotation.id, {
        outcome: 'LOST',
        lostReason: 'Went elsewhere on price — about eight rupees a kilogram under us.',
      });
      say('Lost', `quotation #${quotation.number}`, design.jobName);
      continue;
    }

    /* Winning it is what raises the order — the same path the office uses. */
    const won = await recordOutcome(quotation.id, { outcome: 'WON', lostReason: '' });
    const order = await prisma.order.findFirstOrThrow({
      where: { number: won.ordersCreated[0] },
      /* customerId and the snapshot name are wanted by the dispatch note at the
         end — a challan is made out to a customer, not to an order. */
      select: { id: true, number: true, customerId: true, customerName: true },
    });

    /* One of them is past the day it was promised, so the floor's "past due"
       count is not always a zero nobody has ever seen move. */
    const due = plan.level === 'ordered-late' ? daysAgo(3) : daysAgo(-9);
    await prisma.order.update({
      where: { id: order.id },
      data: { notes: MARK, dueDate: new Date(`${due}T00:00:00.000Z`) },
    });

    if (plan.level === 'ordered' || plan.level === 'ordered-late') {
      /*
       * Both are booked in, and one of them cannot make its date.
       *
       * That second case is the whole reason planning stores a date at all: an
       * order promised for three days ago and started next week is late the
       * moment it is written down, and the board says so while it is still
       * only a plan. Shown with a machine as well as a day, because "which
       * press, and when" is one decision rather than two.
       */
      const press = await prisma.costingMachine.findFirst({
        where: { isActive: true, kind: 'PRINTING' },
        select: { id: true },
      });
      const late = plan.level === 'ordered-late';
      const planned = await planOrder(
        order.id,
        {
          plannedStart: daysAgo(late ? -2 : -5),
          plannedMachineId: press?.id ?? null,
          planNote: late
            ? 'Promised before the film landed — first slot the press has'
            : 'Straight onto the press when Mauli comes off',
        },
        'Demo',
      );
      say(
        late ? 'Ordered (late)' : 'Ordered',
        `order #${order.number}`,
        `${design.jobName} — booked ${planned.plannedStart}${planned.landsLate ? `, ${planned.daysLate}d past its date` : ''}`,
      );
      continue;
    }

    const card = await createProduction({ orderId: order.id, quantityKg: plan.kg, notes: MARK });

    if (plan.level === 'short') {
      /*
       * Left exactly where a card is when the works has not got the film: raised,
       * flagged, and refusing to start. Nothing is faked — the poly this job is
       * built from is simply not stocked.
       */
      const short = card.materials.filter((m) => m.shortBy > 0);
      say(
        'Short of film',
        `card #${card.number}`,
        `${design.jobName} — ${short.map((m) => m.name).join(', ')}`,
      );
      continue;
    }

    const machines = await prisma.costingMachine.findMany({
      select: { id: true, kind: true, isDefault: true },
    });
    /* The machine the works actually runs, where it has said which. */
    const machineFor = (kind: string) => {
      const ofKind = machines.filter((m) => m.kind === kind);
      return (ofKind.find((m) => m.isDefault) ?? ofKind[0])?.id ?? null;
    };
    const operatorFor = (kind: string) =>
      kind === 'PRINTING'
        ? people['Rahul Patil']
        : kind === 'LAMINATION'
          ? people['Suresh Kale']
          : people['Manoj Jadhav'];

    /*
     * Weights that lose a little at each stage, which is what a real card looks
     * like. The waste is never typed — it is the difference between the two.
     */
    let inKg = Math.round(plan.kg * 1.08);
    const runningAt = RUNNING_AT[plan.level];
    /* Which day this card's first stage came off, counting back from today.
       Spread so the fortnight reads as a fortnight of work rather than one
       busy afternoon — see the backdating inside the loop. */
    let ranOn = FIRST_RAN_ON[cardsMade % FIRST_RAN_ON.length] ?? 6;
    cardsMade += 1;

    for (const stage of card.stages) {
      if (stage.stage === runningAt) {
        /* Where the floor is right now: film on the machine, nothing off it. */
        await updateStage(stage.id, {
          machineId: machineFor(stage.stage),
          operatorId: operatorFor(stage.stage),
          inputKg: inKg,
          status: 'RUNNING',
        });
        break;
      }

      const outKg = Math.round(inKg * 0.975);
      await updateStage(stage.id, {
        machineId: machineFor(stage.stage),
        operatorId: operatorFor(stage.stage),
        inputKg: inKg,
        outputKg: outKg,
        status: 'DONE',
      });
      /*
       * Put the run back where it actually happened.
       *
       * `updateStage` stamps `finishedAt` with now, which is right in use and
       * wrong here: every demo run would land on the day the seed was run, and
       * the overview's fortnight chart would show one spike against thirteen
       * empty days. A works finishes something most days, so the demo does
       * too — each card starts on its own day and walks its stages forward.
       */
      await prisma.productionStage.update({
        where: { id: stage.id },
        data: {
          startedAt: new Date(`${daysAgo(ranOn)}T09:30:00.000Z`),
          finishedAt: new Date(`${daysAgo(ranOn)}T16:45:00.000Z`),
        },
      });
      ranOn = Math.max(0, ranOn - 1);
      inKg = outKg;
    }

    if (runningAt) {
      /*
       * A works always has something outstanding, and the quality screen is
       * the issues list — an empty one demonstrates nothing.
       *
       * Both are raised against jobs ON THE FLOOR and neither rejects any
       * film, on purpose: a rejection is counted out of the godown, and
       * putting one on the finished job would quietly move the dispatch
       * figures this script's own output describes.
       */
      if (plan.level === 'laminating') {
        const owner = await prisma.employee.findFirst({
          where: { role: { process: 'LAMINATION' } },
          select: { id: true },
        });
        const issue = await raiseIssue(
          {
            productionOrderId: card.id,
            stageId: null,
            severity: 'HIGH',
            title: 'Delamination on the outer edge',
            detail: 'Third and fourth reel, about 15 mm in. Adhesive coat being checked.',
            rejectedKg: 0,
            responsibleId: owner?.id ?? null,
          },
          'Demo',
        );
        say(
          'Problem',
          `issue ${issue.number}`,
          `${design.jobName} — ${issue.severity}, still open`,
        );
      }

      if (plan.level === 'printing') {
        const raised = await raiseIssue(
          {
            productionOrderId: card.id,
            stageId: null,
            severity: 'LOW',
            title: 'Colour shade variation on the first 200 m',
            detail: '',
            rejectedKg: 0,
            responsibleId: null,
          },
          'Demo',
        );
        await updateIssue(
          raised.id,
          {
            status: 'RESOLVED',
            resolution: 'Ink viscosity corrected; the run was re-checked and passed.',
          },
          'Demo',
        );
        say('Problem', `issue ${raised.number}`, `${design.jobName} — closed, with what was done`);
      }

      say(
        'On the floor',
        `card #${card.number}`,
        `${design.jobName} — on the ${runningAt.toLowerCase()}`,
      );
      continue;
    }

    /* --- finished: completed, costed, and off the shelf ------------------- */
    await updateProduction(card.id, { status: 'COMPLETED' });

    const sheet = await createJobSheet(
      {
        date: daysAgo(2),
        productionOrderId: card.id,
        jobId: design.id,
        jobName: design.jobName,
        customerId: design.customerId,
        operatorName: 'Rahul Patil',
        notes: MARK,
      } as never,
      'Demo',
    );

    /*
     * The film the run actually took, put against the sheet's own rows.
     *
     * Matched on the MATERIAL, not the row's name: the sheet is the works' own
     * printed form and calls its first row "12 PET Polyester", which is not
     * what the rates master calls that film.
     */
    const used = new Map(
      layers.map((l) => [l.materialId, Math.round((plan.kg * 1.08) / layers.length)]),
    );
    await updateJobSheet(
      sheet.id,
      {
        producedGrossKg: inKg,
        producedCoreKg: 0,
        finalOutputKg: Math.round(inKg * 0.97),
        productionDays: 2,
        makeReadyDays: 0.75,
        lines: sheet.lines.map((line) => ({
          ...line,
          issuedKg: (line.materialId && used.get(line.materialId)) || line.issuedKg,
        })),
      } as never,
      'Demo',
    );
    await costSheet(sheet.id);
    const posted = await postToStock(sheet.id, 'Demo');

    say(
      'Finished',
      `card #${card.number}, sheet ${sheet.number}`,
      `${design.jobName} — ${posted.posted} material line${posted.posted === 1 ? '' : 's'} off stock`,
    );

    /* --- and then it goes out -------------------------------------------- */

    /*
     * Half of it on a lorry, the rest still on the floor.
     *
     * A part delivery is the state worth showing, because it is the one that
     * exercises everything: the order stays open with a real balance against
     * it, the godown screen has something in it, and the second note is a draft
     * — which counts for nothing anywhere until somebody sends it. An order
     * delivered in one go would demonstrate none of that.
     */
    const standing = (await readyToSend({})).find((row) => row.orderId === order.id);
    if (standing && standing.readyKg > 0) {
      const half = Math.round((standing.readyKg / 2) * 1000) / 1000;
      const bags = Math.floor(standing.orderedPouches / 2);

      /* Three reels, adding up to the half — the works weighs every reel it
         packs, and the challan lists them. */
      const each = Math.round((half / 3) * 1000) / 1000;
      const reels = [
        { reelNumber: 'YP-4471', netKg: each, grossKg: null, widthMm: 650 },
        { reelNumber: 'YP-4472', netKg: each, grossKg: null, widthMm: 650 },
        {
          reelNumber: 'YP-4473',
          netKg: Math.round((half - 2 * each) * 1000) / 1000,
          grossKg: null,
          widthMm: 650,
        },
      ];

      const lorry = {
        customerId: order.customerId,
        customerName: order.customerName,
        dispatchDate: daysAgo(1),
        deliveryAddress: 'Godown 2, MIDC Sinnar, Nashik',
        vehicleNumber: '',
        transporter: 'Sai Roadlines',
        driverName: 'Ramesh Jadhav',
        driverPhone: '9876543210',
        lrNumber: 'LR-5521',
        notes: MARK,
      };

      const sent = await createDispatch(
        {
          ...lorry,
          lines: [
            {
              orderId: order.id,
              productionOrderId: card.id,
              /* Left at nought on purpose: the reels are the total. */
              quantityKg: 0,
              quantityPouches: bags,
              remarks: 'First half — balance to follow',
              packages: reels,
            },
          ],
        },
        'Demo',
      );
      const gone = await postDispatch(
        sent.id,
        { vehicleNumber: 'MH 15 AB 1234', overrideReason: '' },
        'Demo',
      );
      say(
        'Delivered (part)',
        `note #${gone.number}`,
        `${design.jobName} — ${gone.totalKg} kg on ${gone.packageCount} reels, order still open`,
      );

      const left = (await readyToSend({})).find((row) => row.orderId === order.id);
      if (left && left.readyKg > 0) {
        const draft = await createDispatch(
          {
            ...lorry,
            dispatchDate: daysAgo(0),
            transporter: '',
            driverName: '',
            driverPhone: '',
            lrNumber: '',
            lines: [
              {
                orderId: order.id,
                productionOrderId: card.id,
                quantityKg: left.readyKg,
                quantityPouches: standing.orderedPouches - bags,
                remarks: 'Balance',
                packages: [],
              },
            ],
          },
          'Demo',
        );
        say(
          'Draft note',
          `note #${draft.number}`,
          `${design.jobName} — ${draft.totalKg} kg loaded but not sent`,
        );
      }
    }
  }

  console.log(
    '\nOpen Quotations, Orders, Production, Job sheets, Dispatch and Inventory to walk it through.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
