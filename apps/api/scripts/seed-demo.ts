/**
 * **Four jobs, one at each stage of the works' own chain.**
 *
 * Not fixtures. Every row below is produced by the same services the screens
 * call — a quotation is costed by the costing engine, winning it raises the
 * order, raising a card derives its stages from the structure, starting one
 * checks the film is free, and the finished job's sheet posts what it actually
 * took off stock. If any of that breaks, this script breaks, which is most of
 * why it is worth having.
 *
 *   1. Quoted        a quotation sent, nobody has answered
 *   2. Ordered       won, the order is on the books, nothing started
 *   3. On the floor  printing done, lamination running
 *   4. Finished      every stage done, costed, and taken off stock
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
        gsm: adhesiveGsmFor(input.layers, {
          thinGsm: settings.adhesiveCoatThinGsm,
          thickGsm: settings.adhesiveCoatThickGsm,
          thickPlyMicron: settings.adhesiveThickPlyMicron,
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
    `        ${sheets.length} job sheets, ${batches.length} stock batches, ${people.count} employees.`,
  );
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
 * Ten jobs, spread the way a real week is spread.
 *
 * Not one at each stage in a tidy row — a works has several quotations out that
 * nobody has answered, one it lost, a couple waiting to start, three or four on
 * the floor at different points, and one finished. It also, sooner or later,
 * has a job it has not got the film for.
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
      density: true,
      rates: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { rate: true } },
    },
  });
  const materialId = (name: string) => materials.find((m) => m.name === name)!.id;
  const densityOf = (name: string) => Number(materials.find((m) => m.name === name)?.density ?? 1);
  const rateOf = (name: string) =>
    Number(materials.find((m) => m.name === name)?.rates[0]?.rate ?? 0);

  for (const [name, kg] of [
    ['PET 12µm', 4000],
    ['MET PET 12µm', 2500],
    ['W/O Poly 110µm', 5000],
    ['LDPE Milky / Natural', 4000],
    /* PE 60µm is deliberately NOT received. One job is built on it, and that
       is what puts a real shortage on the floor to look at. */
  ] as const) {
    await receiveStock(
      receiveStockSchema.parse({
        materialId: materialId(name),
        batchCode: `${BATCH_PREFIX}${name
          .replace(/[^A-Za-z0-9]+/g, '-')
          .replace(/-+$/, '')
          .toUpperCase()}`,
        quantity: kg,
        unit: 'KG',
        receivedOn: daysAgo(20),
        location: 'Warehouse A',
        notes: MARK,
      }),
      'Demo',
    );
  }
  console.log('Film on the shelf.');

  /* --- and the four jobs ------------------------------------------------- */
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
      select: { id: true, number: true },
    });

    /* One of them is past the day it was promised, so the floor's "past due"
       count is not always a zero nobody has ever seen move. */
    const due = plan.level === 'ordered-late' ? daysAgo(3) : daysAgo(-9);
    await prisma.order.update({
      where: { id: order.id },
      data: { notes: MARK, dueDate: new Date(`${due}T00:00:00.000Z`) },
    });

    if (plan.level === 'ordered' || plan.level === 'ordered-late') {
      say(
        plan.level === 'ordered-late' ? 'Ordered (late)' : 'Ordered',
        `order #${order.number}`,
        design.jobName,
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
      inKg = outKg;
    }

    if (runningAt) {
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
  }

  console.log(
    '\nOpen Quotations, Orders, Production, Job sheets and Inventory to walk it through.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
