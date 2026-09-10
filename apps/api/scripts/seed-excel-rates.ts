/**
 * Puts the works' own workbook rates into the catalogue.
 *
 * From "3. Anupriya.xlsx", 23 March 2022 — the sheet the office reconciles
 * against. Two sheets, two sets of figures, and they are NOT alternatives:
 *
 *   Estimation  ink Rs 800/kg, adhesive Rs 400/kg — blended rates that already
 *               carry the solvent, the dilution and the losses. The whole
 *               laydown is costed at these, and they produce the workbook's
 *               headline Rs 263.40/kg.
 *   Costing     ink Rs 202-235/kg, adhesive Rs 165/kg — what is actually
 *               bought, with the solvent and hardener priced beside them.
 *
 * So the blends are their own catalogue rows rather than a second rate on the
 * same material. Pointing the flat method at a purchase rate mixed the two and
 * understated ink by a quarter.
 *
 * Unlike `seed:costing` this DOES change rates that are already set — that is
 * the point of it. Nothing is destroyed: rates are an append-only history, so
 * yesterday's figure stays on the Rates screen and can be read back.
 */
import { prisma } from '../src/lib/prisma.js';
import type { MaterialCategory } from '../src/generated/prisma/client.js';

/** Materials the workbook prices, and what it prices them at. */
const RATES: {
  name: string;
  rate: number;
  /** Created if the catalogue has no such row. */
  create?: { category: MaterialCategory; unit: string; density?: number; solidsPercent?: number };
  note: string;
}[] = [
  /* --- film, Estimation E32-E34 ------------------------------------------ */
  { name: 'PET 12µm', rate: 185, note: 'Estimation E32' },
  { name: 'MET PET 12µm', rate: 180, note: 'Estimation E33' },
  {
    name: 'W/O Poly 110µm',
    rate: 163,
    /* The workbook's third ply. The catalogue had no white-opaque poly at all,
     * so a job copied from the sheet reached for LDPE or PE and picked up both
     * the wrong rate and the wrong density. */
    create: { category: 'FILM', unit: 'KG', density: 0.94 },
    note: 'Estimation E34, density from O16/P16',
  },

  /* --- the blends the FLAT method costs everything at --------------------- */
  {
    name: 'Ink — Blended (Estimation)',
    rate: 800,
    create: { category: 'INK', unit: 'KG' },
    note: 'Estimation E37 — carries solvent and losses',
  },
  {
    name: 'Adhesive — Blended (Estimation)',
    rate: 400,
    create: { category: 'ADHESIVE', unit: 'KG' },
    note: 'Estimation E36 — the made-up batch, not the drum',
  },

  /* --- what is actually bought, Costing J7-M7 and N22/N23/C27/E27 --------- */
  { name: 'Ink — Black', rate: 202, note: 'Costing J7' },
  { name: 'Ink — Cyan', rate: 217, note: 'Costing K7' },
  { name: 'Ink — Magenta', rate: 235, note: 'Costing L7' },
  { name: 'Ink — Yellow', rate: 202, note: 'Costing M7' },
  { name: 'Adhesive — PU', rate: 165, note: 'Costing C27' },
  { name: 'Adhesive — Hardener', rate: 365, note: 'Costing E27' },
  { name: 'Solvent — Ethyl Acetate', rate: 125, note: 'Costing N22' },
  { name: 'Solvent — Toluene', rate: 95, note: 'Costing N23' },
];

/** Settings the workbook fixes, where ours disagreed. */
const SETTINGS: [string, string, string][] = [
  ['defaultFlatInkMaterial', 'Ink — Blended (Estimation)', 'what the flat method costs ink at'],
  [
    'defaultFlatAdhesiveMaterial',
    'Adhesive — Blended (Estimation)',
    'what the flat method costs adhesive at',
  ],
  /* Estimation F61 is blank — the sheet charges nothing for an eighth station. */
  ['stationSurcharge8', '0', 'Estimation F61'],
];

/**
 * Wages the sheet has no line for.
 *
 * Retired rather than deleted: the Costing screen shows a retired role greyed
 * out with a Restore beside it, so the decision stays visible and is one click
 * from being reversed. Somebody does stand at the laminator for 86 minutes on
 * the job the sheet costs — the sheet simply does not pay them, and the works
 * costs against the sheet.
 */
const RETIRE_LABOUR = ['Lamination Operator', 'Lamination Helper'];

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let changed = 0;
  let same = 0;
  let created = 0;

  for (const entry of RATES) {
    let material = await prisma.material.findUnique({
      where: { name: entry.name },
      include: { rates: { orderBy: { effectiveDate: 'desc' }, take: 1 } },
    });

    if (!material) {
      if (!entry.create) {
        console.log(`  SKIPPED  ${entry.name} — not in the catalogue, and no shape to create it`);
        continue;
      }
      material = await prisma.material.create({
        data: { name: entry.name, ...entry.create, sortOrder: 50 },
        include: { rates: { orderBy: { effectiveDate: 'desc' }, take: 1 } },
      });
      created += 1;
    }

    const before = material.rates[0]?.rate ? Number(material.rates[0].rate) : null;
    if (before === entry.rate) {
      same += 1;
      continue;
    }

    /* Append-only: same day overwrites, any earlier day stays as history. */
    await prisma.materialRate.upsert({
      where: { materialId_effectiveDate: { materialId: material.id, effectiveDate: today } },
      update: { rate: entry.rate, enteredBy: 'Workbook' },
      create: {
        materialId: material.id,
        rate: entry.rate,
        effectiveDate: today,
        enteredBy: 'Workbook',
      },
    });
    changed += 1;
    console.log(
      `  ${(before === null ? 'PRICED ' : 'CHANGED').padEnd(8)} ${entry.name.padEnd(32)} ${
        before === null ? '(none)' : before
      } → ${entry.rate}   ${entry.note}`,
    );
  }

  for (const [key, value, note] of SETTINGS) {
    const existing = await prisma.appSetting.findUnique({ where: { key } });
    if (existing?.value === value) continue;
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    console.log(
      `  SETTING  ${key.padEnd(32)} ${existing?.value ?? '(default)'} → ${value}   ${note}`,
    );
  }

  for (const role of RETIRE_LABOUR) {
    const existing = await prisma.costingLabour.findUnique({ where: { role } });
    if (!existing || !existing.isActive) continue;
    await prisma.costingLabour.update({ where: { role }, data: { isActive: false } });
    console.log(
      `  RETIRED  ${role.padEnd(32)} Rs ${existing.monthlySalary}/month — the sheet has no such line`,
    );
  }

  console.log(
    `\n${changed} rate${changed === 1 ? '' : 's'} changed, ${created} material${
      created === 1 ? '' : 's'
    } created, ${same} already matched.`,
  );
  console.log(
    'Every previous rate is still on the Rates screen — this appends, it does not erase.',
  );
  console.log('\nThese are MARCH 2022 figures. Check them against an invoice before quoting.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
