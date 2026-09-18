/**
 * Costs the works' own job sheets through the app, and checks every figure.
 *
 * The point is not the sheets — it is the check. Every tab of
 * `September 2026 Job Sheet.xlsx` goes in the way the office would put it in:
 * what was issued, what came back, the mixed drums, the crew, the days, the
 * rates typed that week. Then the cost a kilogram the app works out is compared
 * to the one the spreadsheet printed.
 *
 *   npm run check:job-sheets -w @yuva/api            check only, touches nothing
 *   npm run check:job-sheets -w @yuva/api -- --write also create them in the app
 *
 * Reads the workbook through a small Python helper, because openpyxl reads a
 * cached formula result and exceljs does not — the same reason
 * `seed-old-quotations.ts` does it that way.
 *
 * **What is derived and what is taken as given.** Material, wastage and the
 * final division are computed from the raw issue and return figures, which is
 * the whole of the costing. Of the overheads, wages, transport, pouching and
 * the margin are computed too. Electricity is computed on the tabs that carry
 * the stage block and taken as given on the older ones, which type a flat
 * figure with no workings; the bank EMI is the same on the one tab that types
 * it. Each row says which, so the report never claims to have checked something
 * it accepted.
 *
 * Where the works' own sheet leaves a row blank, this follows it rather than
 * correcting it — one tab charges no margin at all, and the report says so
 * instead of quietly putting ten per cent back.
 */
import { execFileSync } from 'node:child_process';
import {
  costJobSheet,
  JOB_SHEET_LINES,
  JOB_SHEET_STAGE_DEFAULTS,
  mixDrumFor,
  type JobSheetCostInput,
  type JobSheetStage,
} from '@yuva/shared';
import { prisma } from '../src/lib/prisma.js';
import { createJobSheet, updateJobSheet } from '../src/modules/job-sheets/job-sheet.service.js';

const WORKBOOK =
  process.env['JOB_SHEET_WORKBOOK'] ?? '/Users/Abhi/Downloads/September 2026 Job Sheet.xlsx';

const READER = `
import openpyxl, json, re, sys

path = sys.argv[1]
wf = openpyxl.load_workbook(path)
wv = openpyxl.load_workbook(path, data_only=True)

def n(x):
    return float(x) if isinstance(x, (int, float)) else 0.0

INK_ROWS = list(range(15, 27))
out = []

for ws in wf.worksheets:
    if ws.title.strip() == 'Plain Format':
        continue
    v = wv[ws.title]
    g = lambda c: n(v[c].value)
    rate = lambda r: n(v.cell(r, 5).value)

    def override(r):
        cell = ws.cell(r, 3).value
        return float(cell) if isinstance(cell, (int, float)) else None

    mix_i, mix_r = g('J27'), g('K27')
    lam_i, lam_r = g('J60'), g('K60')

    lines = []
    def add(pos, issued, returned, mi, mr, row):
        lines.append({'position': pos, 'issuedKg': issued, 'returnedKg': returned,
                      'mixIssuedKg': mi, 'mixReturnedKg': mr,
                      'consumedOverrideKg': override(row), 'ratePerKg': rate(row)})

    add(1, g('J8'), g('K8'), 0, 0, 87)
    add(2, g('J10'), g('K10'), mix_i, mix_r, 88)
    add(3, g('J11'), g('K11'), mix_i, mix_r, 89)
    add(4, g('J12'), g('K12'), 0, 0, 90)
    for i, r in enumerate(INK_ROWS):
        add(5 + i, n(v.cell(r, 6).value), n(v.cell(r, 7).value),
            n(v.cell(r, 10).value), n(v.cell(r, 11).value), 91 + i)
    add(17, g('J49'), g('K49'), 0, 0, 104)
    add(18, g('J51'), g('K51'), 0, 0, 105)
    add(19, g('J55'), g('K55'), lam_i, lam_r, 106)
    add(20, g('J57'), g('K57'), lam_i, lam_r, 107)
    add(21, g('J59'), g('K59'), lam_i, lam_r, 108)

    crew = []
    for i, r in enumerate(range(115, 123)):
        role = ws.cell(r, 5).value
        if not role:
            continue
        crew.append({'position': i + 1, 'role': str(role).strip(),
                     'headcount': n(v.cell(r, 7).value),
                     'ratePerDay': n(v.cell(r, 9).value),
                     'days': n(v.cell(r, 8).value)})

    days = g('I44')
    # The stage block, on the tabs that have one. A stage whose Q cell is empty
    # did not run, so it takes no days and costs nothing.
    has_stages = 'Q92' in str(ws['L87'].value or '')
    stages = []
    if has_stages:
        for stage, row in (('PRINTING', 87), ('LAMINATION_1', 88), ('LAMINATION_2', 89),
                           ('SLITTING', 90), ('POUCHING', 91)):
            share = n(v.cell(row, 16).value) / n(v['G125'].value) * 100 if n(v['G125'].value) else 0
            ran = ws.cell(row, 17).value is not None
            shifts = n(v.cell(row, 18).value) or 1
            stages.append({'stage': stage, 'sharePercent': round(share, 3),
                           'days': days if ran else 0, 'shifts': shifts})

    transport = re.search(r'C109\\s*\\*\\s*([\\d.]+)', str(ws['L89'].value or ''))
    emi_formula = 'I44' in str(ws['L92'].value or '')
    # A blank profit row is a job costed with no margin at all. Followed, not
    # corrected — the sheet is the record of what the works charged.
    profit_formula = 'G109' in str(ws['L93'].value or '')

    out.append({
        'sheet': ws.title,
        'job': str(v['B2'].value or '').strip(),
        'date': str(v['K1'].value or '')[:10],
        'operator': str(v['B5'].value or '').strip(),
        'filmType': str(v['D3'].value or '').strip(),
        'width': str(v['J3'].value or ''),
        'micron': n(v['J4'].value),
        'circumference': str(v['J5'].value or ''),
        'cylinders': int(n(v['D4'].value)),
        'printMixIssuedKg': mix_i, 'printMixReturnedKg': mix_r,
        'lamMixIssuedKg': lam_i, 'lamMixReturnedKg': lam_r,
        'makeReadyDays': g('I43'), 'productionDays': days,
        'printedGrossKg': g('J29'), 'printedCoreKg': g('K29'),
        'producedGrossKg': g('L61'), 'producedCoreKg': g('L62'),
        'finalOutputKg': g('M84'), 'pouchingWeightKg': g('M83'),
        'lines': lines, 'crew': crew, 'stages': stages,
        'electricityPerDay': n(v['G125'].value),
        'electricityFrom': 'stages' if has_stages else 'typed',
        'electricityTyped': g('L87'),
        'transportPerKg': float(transport.group(1)) if transport else None,
        'transportTyped': g('L89'),
        'packagingCost': g('L91'),
        'emiPerDay': 10000 if emi_formula else None,
        'emiTyped': g('L92'),
        'profitPercent': 10 if profit_formula else None,
        'profitTyped': g('L93'),
        'pouchingPerKg': 10,
        'expect': {
            'materialKg': round(g('C109'), 3),
            'materialCost': round(g('G109'), 2),
            'basicValuePerKg': round(g('G111'), 2),
            'effectivePrice': round(g('M94'), 2),
            'costPerKg': round(n(v['J99'].value), 2),
            'wastagePercent': round(n(v['M103'].value), 2),
        },
    })

print(json.dumps(out))
`;

interface Tab {
  sheet: string;
  job: string;
  date: string;
  operator: string;
  filmType: string;
  width: string;
  micron: number;
  circumference: string;
  cylinders: number;
  printMixIssuedKg: number;
  printMixReturnedKg: number;
  lamMixIssuedKg: number;
  lamMixReturnedKg: number;
  makeReadyDays: number;
  productionDays: number;
  printedGrossKg: number;
  printedCoreKg: number;
  producedGrossKg: number;
  producedCoreKg: number;
  finalOutputKg: number;
  pouchingWeightKg: number;
  lines: {
    position: number;
    issuedKg: number;
    returnedKg: number;
    mixIssuedKg: number;
    mixReturnedKg: number;
    consumedOverrideKg: number | null;
    ratePerKg: number;
  }[];
  crew: { position: number; role: string; headcount: number; ratePerDay: number; days: number }[];
  stages: { stage: JobSheetStage; sharePercent: number; days: number; shifts: number }[];
  electricityPerDay: number;
  electricityFrom: 'stages' | 'typed';
  electricityTyped: number;
  transportPerKg: number | null;
  transportTyped: number;
  packagingCost: number;
  emiPerDay: number | null;
  emiTyped: number;
  /** Null where the tab's profit row is blank — a job costed with no margin. */
  profitPercent: number | null;
  profitTyped: number;
  pouchingPerKg: number;
  expect: {
    materialKg: number;
    materialCost: number;
    basicValuePerKg: number;
    effectivePrice: number;
    costPerKg: number;
    wastagePercent: number;
  };
}

function read(): Tab[] {
  const json = execFileSync('python3', ['-c', READER, WORKBOOK], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(json) as Tab[];
}

/** Millimetres out of `650mm`, or null where the cell says something else. */
function mm(value: string): number | null {
  const match = /([\d.]+)/.exec(value);
  return match ? Number(match[1]) : null;
}

/** `13-03-2026` and `23.08.2026` are both dates the office types. */
function isoDate(value: string, fallback: string): string {
  const match = /^(\d{2})[-./](\d{2})[-./](\d{4})$/.exec(value.trim());
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : fallback;
}

/** The tab, as the costing engine wants it. */
function inputFor(tab: Tab): JobSheetCostInput {
  const pools = {
    printMixIssuedKg: tab.printMixIssuedKg,
    printMixReturnedKg: tab.printMixReturnedKg,
    lamMixIssuedKg: tab.lamMixIssuedKg,
    lamMixReturnedKg: tab.lamMixReturnedKg,
  };

  const lines = JOB_SHEET_LINES.map((template, index) => {
    const from = tab.lines.find((line) => line.position === index + 1);
    const share = template.mixSource === 'NONE' ? 0 : template.mixSharePercent;
    const drum = mixDrumFor(
      {
        kind: template.kind,
        section: template.section,
        mixIssuedKg: from?.mixIssuedKg ?? 0,
        mixReturnedKg: from?.mixReturnedKg ?? 0,
      },
      pools,
    );
    return {
      name: template.name,
      issuedKg: from?.issuedKg ?? 0,
      returnedKg: from?.returnedKg ?? 0,
      mixIssuedKg: share > 0 ? drum.issued : 0,
      mixReturnedKg: share > 0 ? drum.returned : 0,
      mixSharePercent: share,
      consumedOverrideKg: from?.consumedOverrideKg ?? null,
      ratePerKg: from?.ratePerKg ?? 0,
    };
  });

  return {
    lines,
    electricityPerDay: tab.electricityPerDay,
    stages: tab.stages,
    labour: tab.crew,
    transportPerKg: tab.transportPerKg ?? 0,
    pouchingPerKg: tab.pouchingPerKg,
    pouchingWeightKg: tab.pouchingWeightKg,
    packagingCost: tab.packagingCost,
    emiPerDay: tab.emiPerDay ?? 0,
    emiDays: tab.productionDays,
    profitPercent: tab.profitPercent ?? 0,
    overrides: {
      /* Taken as given only where the tab states a figure with no workings. */
      electricity: tab.electricityFrom === 'stages' ? null : tab.electricityTyped,
      transport: tab.transportPerKg === null ? tab.transportTyped : null,
      emi: tab.emiPerDay === null ? tab.emiTyped : null,
      profit: tab.profitPercent === null ? tab.profitTyped : null,
    },
    producedKg: tab.producedGrossKg - tab.producedCoreKg,
    finalOutputKg: tab.finalOutputKg,
    expectedWastagePercent: 5,
  };
}

/** Writes the tab into the app, through the same service the screen uses. */
async function persist(tab: Tab, input: JobSheetCostInput) {
  const today = new Date().toISOString().slice(0, 10);
  const sheet = await createJobSheet(
    {
      date: isoDate(tab.date, today),
      status: 'OPEN',
      jobId: null,
      jobName: tab.job || tab.sheet,
      customerId: null,
      operatorName: tab.operator,
      filmType: tab.filmType,
      webWidthMm: mm(tab.width),
      micron: tab.micron || null,
      circumferenceMm: mm(tab.circumference),
      cylinderCount: tab.cylinders,
      printMixIssuedKg: 0,
      printMixReturnedKg: 0,
      lamMixIssuedKg: 0,
      lamMixReturnedKg: 0,
      makeReadyDays: 0,
      productionDays: 0,
      printedGrossKg: 0,
      printedCoreKg: 0,
      producedGrossKg: 0,
      producedCoreKg: 0,
      finalOutputKg: 0,
      pouchingWeightKg: 0,
      electricityPerDay: 0,
      transportPerKg: 0,
      pouchingPerKg: 0,
      packagingCost: 0,
      emiPerDay: 0,
      profitPercent: 0,
      expectedWastagePercent: 5,
      electricityOverride: null,
      salaryOverride: null,
      transportOverride: null,
      pouchingOverride: null,
      emiOverride: null,
      profitOverride: null,
      notes: `From ${tab.sheet} of the September 2026 job sheet workbook.`,
      lines: [],
      labour: [],
      stages: [],
    },
    'Workbook check',
  );

  return updateJobSheet(
    sheet.id,
    {
      printMixIssuedKg: tab.printMixIssuedKg,
      printMixReturnedKg: tab.printMixReturnedKg,
      lamMixIssuedKg: tab.lamMixIssuedKg,
      lamMixReturnedKg: tab.lamMixReturnedKg,
      makeReadyDays: tab.makeReadyDays,
      productionDays: tab.productionDays,
      printedGrossKg: tab.printedGrossKg,
      printedCoreKg: tab.printedCoreKg,
      producedGrossKg: tab.producedGrossKg,
      producedCoreKg: tab.producedCoreKg,
      finalOutputKg: tab.finalOutputKg,
      pouchingWeightKg: tab.pouchingWeightKg,
      electricityPerDay: tab.electricityPerDay,
      transportPerKg: tab.transportPerKg ?? 0,
      pouchingPerKg: tab.pouchingPerKg,
      packagingCost: tab.packagingCost,
      emiPerDay: tab.emiPerDay ?? 0,
      profitPercent: tab.profitPercent ?? 0,
      expectedWastagePercent: 5,
      electricityOverride: input.overrides?.electricity ?? null,
      transportOverride: input.overrides?.transport ?? null,
      emiOverride: input.overrides?.emi ?? null,
      profitOverride: input.overrides?.profit ?? null,
      lines: sheet.lines.map((line, index) => ({
        position: line.position,
        section: line.section,
        kind: line.kind,
        materialId: line.materialId,
        name: line.name,
        mixSharePercent: line.mixSharePercent,
        issuedKg: input.lines[index]!.issuedKg,
        returnedKg: input.lines[index]!.returnedKg,
        mixIssuedKg: input.lines[index]!.mixIssuedKg,
        mixReturnedKg: input.lines[index]!.mixReturnedKg,
        consumedOverrideKg: input.lines[index]!.consumedOverrideKg,
        ratePerKg: input.lines[index]!.ratePerKg,
      })),
      labour: sheet.labour.map((role, index) => ({
        position: role.position,
        role: tab.crew[index]?.role ?? role.role,
        headcount: tab.crew[index]?.headcount ?? 0,
        ratePerDay: tab.crew[index]?.ratePerDay ?? 0,
        days: tab.crew[index]?.days ?? 0,
      })),
      stages:
        tab.stages.length > 0
          ? tab.stages
          : JOB_SHEET_STAGE_DEFAULTS.map((stage) => ({ ...stage, days: 0 })),
    },
    'Workbook check',
  );
}

const write = process.argv.includes('--write');
const tabs = read();

console.log(
  `\n${tabs.length} job sheets from the workbook${write ? ', writing them into the app' : ' (check only — nothing is written)'}\n`,
);
console.log(
  `${'Sheet'.padEnd(30)} ${'app Rs/kg'.padStart(11)} ${'excel'.padStart(11)} ${'diff'.padStart(9)}  ${'material'.padStart(12)} ${'wastage'.padStart(8)}  power`,
);
console.log('-'.repeat(104));

let exact = 0;
const misses: string[] = [];

for (const tab of tabs) {
  const input = inputFor(tab);
  const cost = write ? await persist(tab, input) : costJobSheet(input);

  const paiseApart = (a: number, b: number) => Number(Math.abs(a - b).toFixed(2)) * 100;
  const gap = Number((cost.costPerKg - tab.expect.costPerKg).toFixed(2));
  const ok =
    paiseApart(cost.costPerKg, tab.expect.costPerKg) <= 1 &&
    paiseApart(cost.materialCost, tab.expect.materialCost) <= 1;
  if (ok) exact += 1;
  else misses.push(`${tab.sheet}: ${cost.costPerKg} vs ${tab.expect.costPerKg}`);

  console.log(
    `${tab.sheet.slice(0, 29).padEnd(30)} ${cost.costPerKg.toFixed(2).padStart(11)} ${tab.expect.costPerKg
      .toFixed(2)
      .padStart(11)} ${(ok ? 'exact' : gap.toFixed(2)).padStart(9)}  ${cost.materialCost
      .toFixed(2)
      .padStart(12)} ${`${cost.wastagePercent.toFixed(2)}%`.padStart(8)}  ${tab.electricityFrom}`,
  );
}

console.log('-'.repeat(104));
console.log(
  `\n${exact} of ${tabs.length} exact on both the cost a kilogram and the material cost.`,
);
for (const miss of misses) console.log(`  ${miss}`);
console.log(
  `\nElectricity computed from the stage block on ${tabs.filter((t) => t.electricityFrom === 'stages').length}` +
    ` tabs; taken as typed on ${tabs.filter((t) => t.electricityFrom === 'typed').length}, which state a flat figure with no workings.`,
);

/*
 * Worth saying out loud rather than absorbing quietly. A tab with no margin
 * reproduces exactly — the app follows the sheet — but the sheet is wrong, and
 * the works is the only one who can decide that.
 */
const noMargin = tabs.filter((tab) => tab.profitPercent === null && tab.profitTyped === 0);
if (noMargin.length > 0) {
  console.log(
    `\nNo margin at all on ${noMargin.length} tab${noMargin.length === 1 ? '' : 's'} — the profit row is blank:`,
  );
  for (const tab of noMargin) {
    const cost = costJobSheet(inputFor(tab));
    const withMargin = costJobSheet({
      ...inputFor(tab),
      profitPercent: 10,
      overrides: { ...inputFor(tab).overrides, profit: null },
    });
    console.log(
      `  ${tab.sheet} — quoted at ${cost.costPerKg.toFixed(2)}/kg; with the usual 10% it is ${withMargin.costPerKg.toFixed(2)}/kg.`,
    );
  }
}

await prisma.$disconnect();
