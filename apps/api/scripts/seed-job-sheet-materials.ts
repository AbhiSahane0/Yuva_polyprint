/**
 * Adds the ten materials the job sheet needs and the catalogue did not have.
 *
 *   npm run seed:job-sheet-materials -w @yuva/api            say what would change
 *   npm run seed:job-sheet-materials -w @yuva/api -- --write do it
 *
 * The works' job sheet has twenty-one rows. Eleven of them matched a catalogue
 * material; ten did not, so those lines carried no rate, no link to stock, and
 * an amber flag on the screen — MIBK, LDPE, and the eight spot colours.
 *
 * **Every rate here is the works' own.** Each is typed on all fourteen tabs of
 * `September 2026 Job Sheet.xlsx`, and the figure taken is the one on the most
 * recent tab, dated 14 September 2026. Nothing is averaged and nothing is
 * guessed. Where a rate has moved — and all ten have, between the March tabs
 * and the September ones — only the current figure is recorded, because a rate
 * history invented after the fact is worse than a short one.
 *
 * ### What is deliberately left blank, and why
 *
 * **The spot colours get no laydown and no solids.** That is not an omission to
 * tidy up later; it is the whole of the difference between this being a safe
 * change and an expensive one. A quotation prices an unnamed "special colour"
 * at the dearest ink that has all three of laydown, solids and a rate — today
 * that is Magenta at Rs 235. Give Gold a laydown and every quotation raised
 * afterwards prices its special colours at Rs 510, more than double, without
 * anybody choosing that. The works can make that decision, and until they do
 * these inks are visible to the job sheet and invisible to quotation costing.
 *
 * **LDPE gets no density.** Density is what turns microns into GSM, so a wrong
 * one silently moves the material cost of every quotation that uses the film.
 * The works stocks its other polys at 0.94; whether this one matches is theirs
 * to say, and until they do LDPE cannot be chosen as a quotation ply.
 */
import { JOB_SHEET_LINES } from '@yuva/shared';
import { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';

/** The date of the most recent tab in the workbook. */
const EFFECTIVE = new Date('2026-09-14T00:00:00.000Z');
const SOURCE = 'September 2026 job sheet';

interface Seed {
  name: string;
  category: 'FILM' | 'INK' | 'ADHESIVE' | 'SOLVENT';
  unit: string;
  inkKind: 'PROCESS' | 'SPECIAL' | null;
  rate: number;
  sortOrder: number;
  /** The other figures the workbook shows, for the note at the end. */
  alsoSeen: number[];
}

const SEEDS: Seed[] = [
  /* Litres, like the two solvents already on the list. */
  {
    name: 'Solvent — MIBK',
    category: 'SOLVENT',
    unit: 'L',
    inkKind: null,
    rate: 180,
    sortOrder: 17,
    alsoSeen: [190],
  },
  {
    name: 'LDPE Milky / Natural',
    category: 'FILM',
    unit: 'KG',
    inkKind: null,
    rate: 175,
    sortOrder: 6,
    alsoSeen: [160, 163, 177, 180, 183],
  },
  /*
   * The eight the press carries beyond process. SPECIAL is what they are, and
   * it is also what makes them eligible for the quotation's special-colour rule
   * the day somebody gives them a laydown — see the note at the top.
   */
  {
    name: 'Ink — White',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 240,
    sortOrder: 20,
    alsoSeen: [190],
  },
  {
    name: 'Ink — Red',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 270,
    sortOrder: 21,
    alsoSeen: [260],
  },
  {
    name: 'Ink — Medium',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 200,
    sortOrder: 22,
    alsoSeen: [180],
  },
  {
    name: 'Ink — Orange',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 270,
    sortOrder: 23,
    alsoSeen: [234],
  },
  {
    name: 'Ink — Dark Green',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 250,
    sortOrder: 24,
    alsoSeen: [230],
  },
  {
    name: 'Ink — Gold',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 510,
    sortOrder: 25,
    alsoSeen: [447],
  },
  {
    name: 'Ink — Pink',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 250,
    sortOrder: 26,
    alsoSeen: [234],
  },
  {
    name: 'Ink — Violet',
    category: 'INK',
    unit: 'KG',
    inkKind: 'SPECIAL',
    rate: 270,
    sortOrder: 27,
    alsoSeen: [235],
  },
];

const write = process.argv.includes('--write');

console.log(
  `\n${SEEDS.length} materials from the works' job sheet${write ? '' : ' — dry run, nothing is written'}\n`,
);

let added = 0;
let rated = 0;
let already = 0;

for (const seed of SEEDS) {
  const existing = await prisma.material.findUnique({
    where: { name: seed.name },
    select: { id: true, rates: { where: { effectiveDate: EFFECTIVE }, select: { id: true } } },
  });

  if (existing && existing.rates.length > 0) {
    already += 1;
    console.log(`  = ${seed.name.padEnd(24)} already on the list with this rate`);
    continue;
  }

  if (!write) {
    console.log(
      `  ${existing ? '+' : '*'} ${seed.name.padEnd(24)} ${existing ? 'rate' : 'material and rate'} ` +
        `Rs. ${seed.rate} as at 14-09-2026`,
    );
    continue;
  }

  const material =
    existing ??
    (await prisma.material.create({
      data: {
        name: seed.name,
        category: seed.category,
        unit: seed.unit,
        inkKind: seed.inkKind,
        sortOrder: seed.sortOrder,
        /*
         * density, laydownGsm and solidsPercent are left null on purpose. Each
         * one changes what a QUOTATION costs, and none of them is in the job
         * sheet to read. See the note at the top of this file.
         */
      },
      select: { id: true },
    }));
  if (!existing) added += 1;

  await prisma.materialRate.upsert({
    where: { materialId_effectiveDate: { materialId: material.id, effectiveDate: EFFECTIVE } },
    create: {
      materialId: material.id,
      effectiveDate: EFFECTIVE,
      rate: new Prisma.Decimal(seed.rate),
      enteredBy: SOURCE,
    },
    update: { rate: new Prisma.Decimal(seed.rate), enteredBy: SOURCE },
  });
  rated += 1;

  console.log(`  + ${seed.name.padEnd(24)} Rs. ${seed.rate} as at 14-09-2026`);
}

if (write) {
  console.log(`\n${added} materials added, ${rated} rates recorded, ${already} already there.`);
} else {
  console.log(
    `\nRun again with --write to apply. ${already} of ${SEEDS.length} are already there.`,
  );
}

/**
 * Links the rows on sheets that were filled in before these materials existed.
 *
 * Those rows carry the rate the office typed off the workbook, and that rate is
 * left exactly as it is — nothing here moves a single figure. What they lack is
 * the link to a catalogue row, and without it taking a sheet off stock skips
 * them silently. Matching is by the row's position on the form, which is fixed,
 * rather than by its name, which the office can edit.
 */
async function linkExistingSheets(): Promise<void> {
  const byPosition = new Map(
    JOB_SHEET_LINES.map((template, index) => [index + 1, template.materialName]).filter(
      ([, name]) => name,
    ) as [number, string][],
  );

  const orphans = await prisma.jobSheetLine.findMany({
    where: { materialId: null, position: { in: [...byPosition.keys()] } },
    select: { id: true, position: true, sheet: { select: { number: true, stockPostedAt: true } } },
  });

  /* A posted sheet is a record of what was taken off stock. Left alone. */
  const linkable = orphans.filter((line) => !line.sheet.stockPostedAt);

  if (linkable.length === 0) {
    console.log('\nNo unlinked rows on existing sheets.');
    return;
  }

  const materials = await prisma.material.findMany({
    where: { name: { in: [...new Set(byPosition.values())] } },
    select: { id: true, name: true },
  });
  const idByName = new Map(materials.map((m) => [m.name, m.id]));

  if (!write) {
    console.log(
      `\n${linkable.length} rows on ${new Set(linkable.map((l) => l.sheet.number)).size} existing sheets would be linked to a material (no rate changes).`,
    );
    return;
  }

  let linked = 0;
  for (const line of linkable) {
    const materialId = idByName.get(byPosition.get(line.position)!);
    if (!materialId) continue;
    await prisma.jobSheetLine.update({ where: { id: line.id }, data: { materialId } });
    linked += 1;
  }
  console.log(
    `\n${linked} rows on ${new Set(linkable.map((l) => l.sheet.number)).size} existing sheets linked to a material. No rate was changed.`,
  );
}

await linkExistingSheets();

/*
 * Said out loud rather than left in a file nobody opens. Both of these move
 * money on a quotation, and neither is the app's to decide.
 */
console.log(`
Left blank on purpose:
  The eight spot colours have no laydown and no solids, so quotation costing
  ignores them. A special colour is still priced at the dearest PROCESS ink —
  Magenta, Rs 235. Give Gold a laydown and that becomes Rs 510 on every
  quotation raised afterwards.
  LDPE has no density, so it cannot yet be chosen as a quotation ply. The
  works' other polys are 0.94.

Rates that have moved since March, in case the newer one is not the right one:`);
for (const seed of SEEDS.filter((s) => s.alsoSeen.length > 0)) {
  console.log(
    `  ${seed.name.padEnd(24)} taking ${seed.rate}; also seen ${seed.alsoSeen.join(', ')}`,
  );
}

await prisma.$disconnect();
