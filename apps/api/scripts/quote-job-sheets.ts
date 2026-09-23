/**
 * Quotes the works' own finished jobs, and asks whether the quote would have
 * covered what they actually cost.
 *
 *   npm run quote:job-sheets -w @yuva/api            compare only
 *   npm run quote:job-sheets -w @yuva/api -- --write also create the quotations
 *
 * This is the question the whole rate model exists to answer. A job sheet says
 * what a run cost once it was over; a quotation has to say it beforehand, from
 * nothing but the design and the order size. So every tab of
 * `September 2026 Job Sheet.xlsx` is turned back into the quotation the office
 * would have written, priced at today's catalogue, and set beside the cost the
 * works actually recorded.
 *
 * **It will not match exactly, and it should not.** Four things differ by
 * nature, and the report separates them rather than burying them in one number:
 *
 * 1. **Film rates.** The quotation prices at the catalogue; the job sheet was
 *    costed at what the works paid that week. Their own PET moves between 125
 *    and 172 across the fourteen tabs.
 * 2. **Wastage.** The quotation carries the works' allowance, because that is
 *    all anybody knows when the price is given. The sheet carries what the job
 *    actually lost — 26% on Lokraja Atta against an allowance of 7.
 * 3. **Ink and solvent.** A quotation works them out from the laydown and the
 *    structure. The sheet weighs the drums.
 * 4. **Margin.** The quoted rate carries one; the job sheet's "cost" includes
 *    the works' own 10% but nothing else.
 *
 * What matters is not that the two agree. It is whether the quote sits **above**
 * the cost, and by how much — a quote under the cost is a job the works loses
 * money on, and that is what this prints.
 *
 * The structure is recovered rather than assumed. A job sheet does not record a
 * poly's micron, so it is derived: the printed length comes from the PET's
 * weight at its own GSM over the web, and every other ply's GSM is its weight
 * over that same length. The density cancels out of the round trip, so the
 * figure the costing rebuilds is the one the sheet implies.
 */
import { execFileSync } from 'node:child_process';
import {
  costRate,
  createQuotationSchema,
  parseStationSteps,
  type CostingInput,
} from '@yuva/shared';
import { prisma } from '../src/lib/prisma.js';
import { createQuotation } from '../src/modules/quotations/quotation.service.js';
import { labourAsAt } from '../src/modules/costing/costing.service.js';
import { getSettings } from '../src/modules/settings/settings.service.js';

const WORKBOOK =
  process.env['JOB_SHEET_WORKBOOK'] ?? '/Users/Abhi/Downloads/September 2026 Job Sheet.xlsx';

const READER = `
import openpyxl, json, re, sys
wv = openpyxl.load_workbook(sys.argv[1], data_only=True)
def n(x): return float(x) if isinstance(x, (int, float)) else 0.0
def mm(s):
    m = re.search(r'([\\d.]+)', str(s or ''))
    return float(m.group(1)) if m else 0.0

out = []
for ws in wv.worksheets:
    if ws.title.strip() == 'Plain Format':
        continue
    g = lambda c: n(ws[c].value)
    output = g('M84')
    if output <= 0:
        continue
    colours = sum(1 for r in range(15, 27)
                  if (n(ws.cell(r,6).value) - n(ws.cell(r,7).value)) > 0
                  or (n(ws.cell(r,10).value) - n(ws.cell(r,11).value)) > 0)
    out.append({
        'tab': ws.title,
        'job': str(ws['B2'].value or '').strip() or ws.title,
        'date': str(ws['K1'].value or '')[:10],
        'widthMm': mm(ws['J3'].value),
        'petMicron': n(ws['J4'].value) or 12,
        'petKg': g('L47'), 'metKg': g('L49'), 'polyKg': g('L51'),
        'colours': colours,
        'cylinders': int(n(ws['D4'].value)),
        'outputKg': output,
        'pouchedKg': g('M83'),
        'producedKg': g('L63'),
        'actualPerKg': n(ws['J99'].value),
        'actualMaterial': g('G109'),
        'actualWastagePct': n(ws['M103'].value),
        'sheetPetRate': n(ws['E87'].value),
        'sheetMetRate': n(ws['E104'].value),
        'sheetPolyRate': n(ws['E105'].value),
    })
print(json.dumps(out))
`;

interface Tab {
  tab: string;
  job: string;
  date: string;
  widthMm: number;
  petMicron: number;
  petKg: number;
  metKg: number;
  polyKg: number;
  colours: number;
  cylinders: number;
  outputKg: number;
  pouchedKg: number;
  producedKg: number;
  actualPerKg: number;
  actualMaterial: number;
  actualWastagePct: number;
  sheetPetRate: number;
  sheetMetRate: number;
  sheetPolyRate: number;
}

/**
 * Jobs left out of the summary, and why.
 *
 * Not hidden — they still print, marked. A run genuinely can waste a quarter of
 * its film, and the works says so; what such a run cannot do is tell you
 * anything about whether the RATE is close, because its cost is dominated by
 * something no quotation could have predicted. Leaving it in the average buries
 * the signal everything else carries.
 */
const SET_ASIDE: Record<string, string> = {
  'Lokraja Atta 5kg': 'ran at 26% wastage against an allowance of 7',
  'Copy of Lokraja Atta 5kg': 'ran at 26% wastage against an allowance of 7',
};

/** Densities the catalogue holds. They cancel out of the micron round trip. */
const PET_DENSITY = 1.4;
const MET_DENSITY = 1.4;
const POLY_DENSITY = 0.94;

const tabs = JSON.parse(
  execFileSync('python3', ['-c', READER, WORKBOOK], { encoding: 'utf8', maxBuffer: 64e6 }),
) as Tab[];

const write = process.argv.includes('--write');
/*
 * Price the film at what the works paid that week rather than at the catalogue.
 *
 * The catalogue is what a real quotation uses, so it is the default. But it
 * carries PET at 185 where the works' own tabs paid 125 to 172, and a rate list
 * that far out swamps everything the costing does — with this flag the
 * comparison measures the METHOD instead of the rate list.
 */
const sheetRates = process.argv.includes('--sheet-rates');
const settings = await getSettings();

const materials = await prisma.material.findMany({
  where: { isActive: true },
  select: {
    id: true,
    name: true,
    density: true,
    laydownGsm: true,
    solidsPercent: true,
    inkKind: true,
    rates: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { rate: true } },
  },
});
const priceOf = (name: string) =>
  Number(materials.find((m) => m.name === name)?.rates[0]?.rate ?? 0);
const idOf = (name: string) => materials.find((m) => m.name === name)?.id ?? null;

const machines = (
  await prisma.costingMachine.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
).map((m) => ({
  name: m.name,
  kind: m.kind,
  horsepower: Number(m.horsepower),
  stationHorsepower: Number(m.stationHorsepower),
  stationColourSteps: parseStationSteps(m.stationColourSteps),
  powerRatePerHpHour: Number(m.powerRatePerHpHour),
  speedMPerMin: Number(m.speedMPerMin),
  setupMinutes: m.setupMinutes,
  setupPowerFactor: Number(m.setupPowerFactor),
}));
/*
 * The crew in force today, because this script prices every sheet as at today
 * — the same basis `settings` above is read on. Wages are dated now, so this
 * asks the window rather than a boolean: a crew taken on tomorrow does not
 * reach back into what these runs cost.
 */
const labour = (await labourAsAt()).map((l) => ({
  role: l.role,
  process: l.process,
  monthlySalary: l.monthlySalary,
}));

/**
 * The design's real size, where the works already has the design on record.
 *
 * A job sheet records the WEB — how wide the film runs — and never the size of
 * the thing being made, because the floor does not need it. The design master
 * does, from the legacy import, so the size comes from there when the name
 * matches and is left as the web when it does not. Better a width that is
 * honestly the web than a height invented to satisfy a required field.
 */
async function designSize(jobName: string): Promise<{ widthMm: number; heightMm: number } | null> {
  const words = jobName
    .split(/[\s/]+/)
    .filter((w) => w.length > 3)
    .slice(0, 2);
  if (words.length === 0) return null;

  const found = await prisma.job.findFirst({
    where: { AND: words.map((w) => ({ jobName: { contains: w, mode: 'insensitive' as const } })) },
    select: {
      pouchOpenWidth: true,
      pouchHeight: true,
      designOpenWidth: true,
      designHeight: true,
    },
  });
  if (!found) return null;

  const widthMm = Number(found.pouchOpenWidth ?? found.designOpenWidth ?? 0);
  const heightMm = Number(found.pouchHeight ?? found.designHeight ?? 0);
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
}

const PET = 'PET 12µm';
const MET = 'MET PET 12µm';
const POLY = 'W/O Poly 110µm';

/** The four process inks, priced as the quotation screen would price them. */
const processColours = materials
  .filter((m) => m.inkKind === 'PROCESS' && m.laydownGsm && m.solidsPercent)
  .map((m) => ({
    name: m.name,
    laydownGsm: Number(m.laydownGsm),
    solidsPercent: Number(m.solidsPercent),
    ratePerKg: Number(m.rates[0]?.rate ?? 0),
  }));

function inputFor(t: Tab): { input: CostingInput; polyMicron: number; metMicron: number } {
  /*
   * The printed length the sheet implies: the PET's weight spread at its own
   * GSM across the web. Every other ply's GSM is then its weight over that same
   * length, which is how a micron nobody wrote down is recovered.
   */
  const petGsm = t.petMicron * PET_DENSITY;
  const metres = petGsm > 0 && t.widthMm > 0 ? (t.petKg * 1e6) / (petGsm * t.widthMm) : 0;
  const gsmOf = (kg: number) => (metres > 0 ? (kg * 1e6) / (metres * t.widthMm) : 0);
  const metMicron = t.metKg > 0 ? gsmOf(t.metKg) / MET_DENSITY : 0;
  const polyMicron = t.polyKg > 0 ? gsmOf(t.polyKg) / POLY_DENSITY : 0;

  const pouched = t.pouchedKg > 0;
  /* What the works actually charged for pouching, per kilogram of output. */
  const pouchingPerKg = pouched ? (t.pouchedKg * settings.jobSheetPouchingPerKg) / t.outputKg : 0;

  const petRate = sheetRates && t.sheetPetRate > 0 ? t.sheetPetRate : priceOf(PET);
  const metRate = sheetRates && t.sheetMetRate > 0 ? t.sheetMetRate : priceOf(MET);
  const polyRate = sheetRates && t.sheetPolyRate > 0 ? t.sheetPolyRate : priceOf(POLY);

  const layers = [
    { name: PET, micron: t.petMicron, density: PET_DENSITY, ratePerKg: petRate },
    ...(metMicron > 0
      ? [{ name: MET, micron: metMicron, density: MET_DENSITY, ratePerKg: metRate }]
      : []),
    ...(polyMicron > 0
      ? [{ name: POLY, micron: polyMicron, density: POLY_DENSITY, ratePerKg: polyRate }]
      : []),
  ];

  return {
    metMicron,
    polyMicron,
    input: {
      job: {
        orderQtyKg: t.outputKg,
        /* The allowance, not what the job actually lost — it is all a quotation knows. */
        wastagePercent: pouched ? settings.pouchWastagePercent : settings.defaultWastagePercent,
        filmWidthMm: t.widthMm,
        filmHeightMm: 0,
        ups: 1,
        trimMm: 0,
        layers,
        colours: processColours.slice(0, Math.max(1, Math.min(4, t.colours || 1))),
        flatInk: { ratePerKg: priceOf(settings.defaultFlatInkMaterial) },
        adhesive: {
          gsm: settings.adhesiveGsm,
          ratio: settings.defaultAdhesiveRatio,
          flatRatePerKg: priceOf(settings.defaultFlatAdhesiveMaterial),
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
        makesPouches: pouched,
        pouchType: pouched ? 'CENTRE_SEAL' : null,
        inkGsmOverride: pouched ? settings.pouchInkGsm : settings.inkGsm,
        adhesiveSplitRatio: settings.adhesiveSplitRatio,
        stationCount: Math.max(t.cylinders, t.colours, 1),
      },
      machines,
      labour,
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
        marginPercent: settings.defaultMarginPercent,
        marginBasis: settings.marginBasis,
        inkCostModel: settings.inkCostModel,
        adhesiveCostModel: settings.adhesiveCostModel,
        pouchMakingPerKgOverride: pouched ? pouchingPerKg : null,
      },
    },
  };
}

console.log(
  `\n${tabs.length} of the works' own jobs, quoted at ` +
    `${sheetRates ? 'the film rates the sheet itself used' : "today's catalogue"} ` +
    `and set beside what they cost${write ? '' : ' — nothing is written'}\n`,
);
console.log(
  `${'job'.padEnd(26)} ${'kg'.padStart(7)} ${'quoted'.padStart(8)} ${'cost'.padStart(8)} ` +
    `${'over'.padStart(7)} ${'%'.padStart(6)}   ${'ply'.padStart(3)} ${'col'.padStart(3)}  wastage q/a`,
);
console.log('-'.repeat(96));

let covered = 0;
const gaps: number[] = [];

for (const t of tabs.sort((a, b) => a.outputKg - b.outputKg)) {
  const { input, polyMicron, metMicron } = inputFor(t);
  const r = costRate(input);
  if (!r) {
    console.log(`${t.job.slice(0, 25).padEnd(26)} could not be costed`);
    continue;
  }

  const over = r.ratePerKg - t.actualPerKg;
  const pct = t.actualPerKg > 0 ? (over / t.actualPerKg) * 100 : 0;
  const aside = SET_ASIDE[t.tab];
  if (!aside) {
    if (over >= 0) covered += 1;
    gaps.push(pct);
  }

  const plies = input.job.layers.length;
  console.log(
    `${t.job.slice(0, 25).padEnd(26)} ${t.outputKg.toFixed(0).padStart(7)} ` +
      `${r.ratePerKg.toFixed(2).padStart(8)} ${t.actualPerKg.toFixed(2).padStart(8)} ` +
      `${(over >= 0 ? '+' : '') + over.toFixed(2)}`.padStart(8) +
      ` ${pct.toFixed(1).padStart(6)}   ${String(plies).padStart(3)} ${String(t.colours).padStart(3)}  ` +
      `${input.job.wastagePercent.toFixed(0)}% / ${t.actualWastagePct.toFixed(1)}%` +
      (aside ? '   set aside' : ''),
  );

  if (write) {
    /*
     * The web is what the sheet knows; the design size is what a quotation
     * prints. Where the works has the design on record, that wins.
     */
    const size = (await designSize(t.job)) ?? { widthMm: t.widthMm, heightMm: t.widthMm };
    const sized = size.heightMm !== t.widthMm;

    const layerRows = [
      { materialId: idOf(PET), micron: t.petMicron },
      ...(metMicron > 0 ? [{ materialId: idOf(MET), micron: Number(metMicron.toFixed(2)) }] : []),
      ...(polyMicron > 0
        ? [{ materialId: idOf(POLY), micron: Number(polyMicron.toFixed(2)) }]
        : []),
    ];
    await createQuotation(
      createQuotationSchema.parse({
        date: new Date().toISOString().slice(0, 10),
        customerName: t.job,
        /*
         * A job sheet records no customer, no telephone and no email — it is a
         * production record, not a commercial one. These are placeholders so
         * the quotation validates, and the office fills them in when the
         * enquiry is real.
         */
        mobile: '9999999999',
        email: 'office@example.com',
        notes:
          `Quoted from "${t.tab}" of the September 2026 job sheet. ` +
          `The run itself cost Rs ${t.actualPerKg.toFixed(2)} a kilogram. ` +
          (sized
            ? 'Size taken from the design on record.'
            : `A job sheet records no design size — the ${t.widthMm} mm here is the WEB width, and the height is a placeholder.`),
        items: [
          {
            jobName: t.job,
            jobKind: t.pouchedKg > 0 ? 'POUCH' : 'ROLL',
            pouchType: t.pouchedKg > 0 ? 'CENTRE_SEAL' : null,
            pricingBasis: 'PER_KG',
            widthMm: size.widthMm,
            heightMm: size.heightMm,
            layers: layerRows,
            quantities: [
              {
                quantityKg: Number(t.outputKg.toFixed(2)),
                ratePerKg: Number(r.ratePerKg.toFixed(2)),
                quantityPouches: 0,
                ratePerPouch: 0,
              },
            ],
            repeatWidth: 1,
            repeatHeight: 1,
            cylinderCount: Math.max(t.cylinders, t.colours, 1),
            /* These designs have run; the works already holds their cylinders. */
            chargeCylinders: false,
            transportCost: 0,
          },
        ],
      }),
    );
  }
}

console.log('-'.repeat(96));
const mean = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
const worst = gaps.length > 0 ? Math.min(...gaps) : 0;
console.log(
  `\n${covered} of ${gaps.length} quoted at or above what the job cost.` +
    `  Mean gap ${mean >= 0 ? '+' : ''}${mean.toFixed(1)}%, worst ${worst.toFixed(1)}%.`,
);
for (const [tab, why] of Object.entries(SET_ASIDE)) {
  if (tabs.some((t) => t.tab === tab)) console.log(`  set aside: ${tab} — ${why}`);
}
if (!sheetRates) {
  console.log(
    `\nRun with --sheet-rates to price the film at what the works paid that week.` +
      ` The catalogue carries PET at ${priceOf(PET)} where their tabs paid 125 to 172.`,
  );
}
console.log(`
The two are not meant to agree to the paisa. The quotation prices film at the
catalogue and carries the works' wastage ALLOWANCE; the job sheet was costed at
the week's purchase rates and the wastage the job actually lost. What matters is
the sign: a job quoted under its cost is one the works loses money on.`);

await prisma.$disconnect();
