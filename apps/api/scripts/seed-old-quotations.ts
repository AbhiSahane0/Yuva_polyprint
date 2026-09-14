/**
 * Rebuilds the client's own old quotations, and checks each against its sheet.
 *
 * The point is not the quotations — it is the check. Every figure goes in the
 * way the office would put it in: the film rates as a rate on each ply, margin,
 * transport and pouch making on the quotation, and the two that changed over
 * time — the blended ink rate and the bank EMI — recorded against the date they
 * changed. Then the rate the app works out is compared to the rate the sheet
 * printed.
 *
 *   npm run seed:old-quotations -w @yuva/api            check only
 *   npm run seed:old-quotations -w @yuva/api -- --write also create them
 *
 * Reads the workbooks through a small Python helper, because openpyxl reads a
 * cached formula result and exceljs does not.
 */
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/lib/prisma.js';
import { createQuotation } from '../src/modules/quotations/quotation.service.js';
import { getSettings } from '../src/modules/settings/settings.service.js';
import {
  costRate,
  adhesiveGsmFor,
  parseStationSteps,
  createQuotationSchema,
  type CostingInput,
} from '@yuva/shared';

const FOLDER = '/Users/Abhi/Desktop/Freelance/Yuva_polyprint_docs/Excle_Files/old_quotation';

const READER = `
import openpyxl, glob, json, os, sys
out = {}
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.xlsx'))):
    ws = openpyxl.load_workbook(f, data_only=True)['Estimation']
    g = lambda c: ws[c].value
    out[os.path.basename(f)] = {
      'date': str(g('K2'))[:10], 'party': g('B4'), 'job': g('B5'),
      'marginPct': g('E2') * 100, 'sheetRatePerKg': g('H2'), 'sheetPerPouch': g('G64'),
      'heightMm': g('E6'), 'widthMm': g('F6'), 'orderKg': g('B8'), 'ups': g('B9'),
      'petMic': g('E9'), 'petRate': g('E32'),
      'metpetMic': g('E10'), 'metpetRate': g('E33'),
      'polyMic': g('E11'), 'polyRate': g('E34'),
      'inkRate': g('E37'), 'emiMonth': g('D50'),
      'stations': g('J19'), 'transRate': g('E48'), 'pouchMaking': g('G62'),
    }
print(json.dumps(out))
`;

type Sheet = Record<string, string | number>;
const sheets = JSON.parse(
  execFileSync('python3', ['-c', READER, FOLDER], { encoding: 'utf8', maxBuffer: 1 << 22 }),
) as Record<string, Sheet>;

const n = (v: unknown) => Number(v);
const write = process.argv.includes('--write');

/**
 * Estimation!J5 — the figure all seven of these were costed at.
 *
 * Kept here rather than read from settings because the works now runs POUCH
 * jobs at 7%, from its pouch workbook, and every one of these seven is a pouch.
 * Following the setting would move all seven off the sheets they reproduce, and
 * the check below would start failing for a reason that has nothing to do with
 * the code.
 */
const SHEET_WASTAGE_PERCENT = 8;

/**
 * Estimation!F14 — what the sheet weighs the laminate with.
 *
 * Pinned for the same reason as the wastage above. The works' pouch workbook
 * weighs with 1.2, and while these seven are CENTRE SEAL and so are not on that
 * workbook, the figure that priced them belongs beside the quotations rather
 * than in a setting somebody may reasonably change.
 */
const SHEET_INK_GSM = 1.8;
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/* --- 1. What changed over time, recorded against the day it changed ------ */

async function recordHistory() {
  /*
   * Only the two the sheets actually move over time. The film rates differ
   * between sheets written on the SAME day — PET at 185, 175 and 190 on
   * 23 March — so those are a price agreed for one job, not a catalogue rate,
   * and they go on the quotation's plies instead.
   */
  const now = await getSettings();

  /*
   * A baseline on the first day any of these sheets was written.
   *
   * Rates are carried forward from the last entry on or before the day asked
   * for, so a material priced only in 2026 has no price at all in 2022 and
   * costs nothing — which is how the adhesive quietly disappeared from all
   * seven and left every rate about Rs 20 light. The sheets hold these steady
   * across all three dates, so one entry each is the whole truth.
   */
  const BASELINE = '2022-03-23';
  const baseline: [string, number][] = [
    [now.defaultFlatAdhesiveMaterial, 400],
    [now.defaultAdhesiveMaterial, 165],
    [now.defaultEthylAcetateMaterial, 125],
    [now.defaultTolueneMaterial, 95],
    [now.defaultHardenerMaterial, 365],
  ];
  for (const [name, rate] of baseline) {
    const material = await prisma.material.findUnique({ where: { name } });
    if (!material) continue;
    await prisma.materialRate.upsert({
      where: {
        materialId_effectiveDate: { materialId: material.id, effectiveDate: asDate(BASELINE) },
      },
      update: { rate, enteredBy: 'Workbook' },
      create: {
        materialId: material.id,
        rate,
        effectiveDate: asDate(BASELINE),
        enteredBy: 'Workbook',
      },
    });
  }

  const inkMaterial = now.defaultFlatInkMaterial;
  const ink = await prisma.material.findUnique({ where: { name: inkMaterial } });
  if (!ink) throw new Error(`No material "${inkMaterial}"`);

  const inkRates: [string, number][] = [
    ['2022-03-23', 800],
    ['2022-07-10', 600],
    /* Back to the works' own figure afterwards, which is what it holds today. */
    ['2022-08-01', 800],
  ];
  for (const [date, rate] of inkRates) {
    await prisma.materialRate.upsert({
      where: { materialId_effectiveDate: { materialId: ink.id, effectiveDate: asDate(date) } },
      update: { rate, enteredBy: 'Workbook' },
      create: { materialId: ink.id, rate, effectiveDate: asDate(date), enteredBy: 'Workbook' },
    });
  }

  const emi: [string, string][] = [
    ['2022-03-23', '4166.66'],
    ['2022-07-10', '10000'],
    ['2022-08-01', '4166.66'],
  ];
  for (const [date, value] of emi) {
    await prisma.appSettingHistory.upsert({
      where: { key_effectiveDate: { key: 'emiPerMonth', effectiveDate: asDate(date) } },
      update: { value },
      create: { key: 'emiPerMonth', value, effectiveDate: asDate(date) },
    });
  }

  console.log(
    `Recorded from ${BASELINE}: the blended rates and solvents, the ink going ` +
      '800 → 600 on 10 Jul 2022 → 800, and the EMI beside it.\n',
  );
}

/* --- 2. Rebuild each quotation and check it --------------------------- */

async function main() {
  await recordHistory();

  const petId = (await prisma.material.findUnique({ where: { name: 'PET 12µm' } }))!.id;
  const metpetId = (await prisma.material.findUnique({ where: { name: 'MET PET 12µm' } }))!.id;
  const polyId = (await prisma.material.findUnique({ where: { name: 'W/O Poly 110µm' } }))!.id;

  const machines = (await prisma.costingMachine.findMany({ where: { isActive: true } })).map(
    (m) => ({
      name: m.name,
      kind: m.kind,
      horsepower: Number(m.horsepower),
      powerRatePerHpHour: Number(m.powerRatePerHpHour),
      speedMPerMin: Number(m.speedMPerMin),
      setupMinutes: m.setupMinutes,
      setupPowerFactor: Number(m.setupPowerFactor),
      stationHorsepower: Number(m.stationHorsepower),
      stationColourSteps: parseStationSteps(m.stationColourSteps),
    }),
  );
  const labour = (await prisma.costingLabour.findMany({ where: { isActive: true } })).map((l) => ({
    role: l.role,
    process: l.process,
    monthlySalary: Number(l.monthlySalary),
  }));

  let exact = 0;
  const out: string[] = [];

  for (const [file, s] of Object.entries(sheets)) {
    const date = String(s.date);

    /* The overheads and rates the works held on the day of this quotation. */
    const settings = await getSettings(date);
    const rateRows = await prisma.materialRate.findMany({
      where: { effectiveDate: { lte: asDate(date) } },
      orderBy: { effectiveDate: 'desc' },
      select: { materialId: true, rate: true, material: { select: { name: true } } },
    });
    const seen = new Set<string>();
    const rateOf = new Map<string, number>();
    for (const row of rateRows) {
      if (seen.has(row.material.name)) continue;
      seen.add(row.material.name);
      rateOf.set(row.material.name, Number(row.rate));
    }
    const priceOf = (name: string) => rateOf.get(name) ?? 0;

    const layers = [
      { name: 'PET 12µm', micron: n(s.petMic), density: 1.4, ratePerKg: n(s.petRate) },
      { name: 'MET PET 12µm', micron: n(s.metpetMic), density: 1.4, ratePerKg: n(s.metpetRate) },
      { name: 'W/O Poly', micron: n(s.polyMic), density: 0.94, ratePerKg: n(s.polyRate) },
    ];
    const live = layers.filter((l) => l.micron > 0);
    const adhGsm = adhesiveGsmFor(live, {
      thinGsm: settings.adhesiveCoatThinGsm,
      thickGsm: settings.adhesiveCoatThickGsm,
      thickPlyMicron: settings.adhesiveThickPlyMicron,
    });

    const input: CostingInput = {
      job: {
        orderQtyKg: n(s.orderKg),
        filmWidthMm: n(s.widthMm),
        filmHeightMm: n(s.heightMm),
        ups: n(s.ups),
        stationCount: n(s.stations),
        layers,
        /*
         * 8%, which is Estimation!J5 and what all seven of these were costed
         * at. Pinned rather than followed: these are pouches, and the works now
         * runs pouch jobs at 7% — so following the setting would quietly move
         * every one of them off the sheet it reproduces.
         */
        wastagePercent: SHEET_WASTAGE_PERCENT,
        trimMm: settings.defaultTrimMm,
        inkGsmOverride: SHEET_INK_GSM,
        colours: [{ name: 'All', laydownGsm: SHEET_INK_GSM, solidsPercent: 23, ratePerKg: 202 }],
        flatInk: { ratePerKg: priceOf(settings.defaultFlatInkMaterial) },
        adhesive: {
          gsm: adhGsm,
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
        adhesiveSplitRatio: settings.adhesiveSplitRatio,
      },
      machines,
      labour,
      overheads: {
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
        packingPerKg: settings.packingPerKg,
        otherPerJob: settings.otherPerJob,
        emiPerMonth: settings.emiPerMonth,
        emiHoursPerMonth: settings.emiHoursPerMonth,
        emiBasis: settings.emiBasis,
        stationSurcharges: [
          settings.stationSurcharge6,
          settings.stationSurcharge7,
          settings.stationSurcharge8,
        ],
        marginBasis: settings.marginBasis,
        inkCostModel: settings.inkCostModel,
        adhesiveCostModel: settings.adhesiveCostModel,
        /* The four the quotation carries. */
        marginPercent: n(s.marginPct),
        transportPerKg: n(s.transRate),
        pouchMakingPerKg: n(s.pouchMaking),
        pouchMaking: {
          makingPerPouch: settings.pouchMakingPerPouch,
          dPunchPerPouch: settings.dPunchPerPouch,
          dPunchLargePerPouch: settings.dPunchLargePerPouch,
          dPunchLargeAboveMm: settings.dPunchLargeAboveMm,
          zipperRatePerMetre: settings.zipperRatePerMetre,
        },
        pouchMakingPerKgOverride: n(s.pouchMaking),
      },
    };

    const r = costRate(input)!;
    const want = n(s.sheetRatePerKg);
    const wantPouch = n(s.sheetPerPouch);
    const diff = r.ratePerKg - want;
    const ok = Math.abs(diff) <= 0.05;
    if (ok) exact += 1;

    let number: number | string = '—';
    if (write) {
      const plies = [
        { materialId: petId, micron: n(s.petMic), rateOverride: n(s.petRate) },
        ...(n(s.metpetMic) > 0
          ? [{ materialId: metpetId, micron: n(s.metpetMic), rateOverride: n(s.metpetRate) }]
          : []),
        { materialId: polyId, micron: n(s.polyMic), rateOverride: n(s.polyRate) },
      ];
      const created = await createQuotation(
        createQuotationSchema.parse({
          date,
          customerName: String(s.party).trim(),
          mobile: '9999999999',
          email: 'office@example.com',
          notes: `Rebuilt from the works' own "${file}".`,
          marginPercent: n(s.marginPct),
          transportPerKg: n(s.transRate),
          pouchMakingPerKg: n(s.pouchMaking),
          wastagePercent: SHEET_WASTAGE_PERCENT,
          items: [
            {
              jobName: String(s.job).trim(),
              /*
               * A pouch either way. Nothing charged for MAKING one is not the
               * same as not making one: their Simla and Kalantri 5 kg sheets
               * put zero in that row and still count the pouches and print a
               * per-pouch cost, so reading it as a reel loses the figure the
               * customer is actually quoted.
               */
              jobKind: 'POUCH',
              pouchType: 'CENTRE_SEAL',
              pricingBasis: 'PER_KG',
              widthMm: n(s.widthMm),
              heightMm: n(s.heightMm),
              layers: plies,
              quantities: [
                {
                  quantityKg: n(s.orderKg),
                  ratePerKg: Number(r.ratePerKg.toFixed(2)),
                  quantityPouches: 0,
                  ratePerPouch: 0,
                },
              ],
              repeatWidth: n(s.ups),
              repeatHeight: 1,
              cylinderCount: n(s.stations),
              chargeCylinders: true,
              transportCost: 0,
            },
          ],
        }),
      );
      number = created.number;
    }

    out.push(
      `  ${ok ? '✓' : '✗'}  ${file.replace('.xlsx', '').padEnd(17)} ${date}  #${String(number).padStart(3)}  ` +
        `sheet ${want.toFixed(2).padStart(7)} / ${wantPouch.toFixed(4).padStart(7)}   ` +
        `app ${r.ratePerKg.toFixed(2).padStart(7)} / ${r.ratePerPiece.toFixed(4).padStart(7)}   ` +
        `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`,
    );
  }

  console.log(
    '                                            sheet  /kg  /pouch      app  /kg  /pouch',
  );
  console.log(out.join('\n'));
  console.log(`\n${exact} of ${Object.keys(sheets).length} exact`);
  if (!write) console.log('Nothing was created — pass --write to build the quotations too.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
