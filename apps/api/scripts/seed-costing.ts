/**
 * Seeds costing master data with the works' own figures.
 *
 * Taken from the client's "3. Anupriya.xlsx", March 2022 — so the numbers are
 * theirs, but they are three years old and every one of them should be checked
 * on the Costing screen before a quotation goes out on them.
 *
 * Two figures are NOT from the sheet and are marked below: it has no lamination
 * operator at all, though the laminator runs for an hour and a half on the job
 * it costs. Somebody is paid to stand there.
 *
 * Idempotent: run it as often as you like. Existing rows are left exactly as
 * they are, so it can never overwrite a figure the office has corrected.
 */
import { prisma } from '../src/lib/prisma.js';
import type { MachineKind } from '../src/generated/prisma/client.js';

const MACHINES: {
  name: string;
  kind: MachineKind;
  horsepower: number;
  powerRatePerHpHour: number;
  speedMPerMin: number;
  setupMinutes: number;
  sortOrder: number;
}[] = [
  {
    /* 30 HP press plus three 12 HP stations, costed at the Rs 9 tariff. */
    name: 'Rotogravure press',
    kind: 'PRINTING',
    horsepower: 66,
    powerRatePerHpHour: 9,
    speedMPerMin: 65,
    setupMinutes: 60,
    sortOrder: 1,
  },
  {
    name: 'Laminator',
    kind: 'LAMINATION',
    horsepower: 6,
    powerRatePerHpHour: 35,
    speedMPerMin: 70,
    setupMinutes: 30,
    sortOrder: 2,
  },
  {
    name: 'Slitter',
    kind: 'SLITTING',
    horsepower: 3,
    powerRatePerHpHour: 60,
    speedMPerMin: 80,
    setupMinutes: 30,
    sortOrder: 3,
  },
];

const LABOUR: { role: string; process: MachineKind; monthlySalary: number; sortOrder: number }[] = [
  { role: 'Printing Operator', process: 'PRINTING', monthlySalary: 25000, sortOrder: 1 },
  { role: 'Printing Assistant', process: 'PRINTING', monthlySalary: 13000, sortOrder: 2 },
  { role: 'Printing Helper', process: 'PRINTING', monthlySalary: 8000, sortOrder: 3 },
  /* Not in the sheet. The laminator runs 86 minutes on that job unattended. */
  { role: 'Lamination Operator', process: 'LAMINATION', monthlySalary: 18000, sortOrder: 4 },
  { role: 'Lamination Helper', process: 'LAMINATION', monthlySalary: 8000, sortOrder: 5 },
  { role: 'Slitting Operator', process: 'SLITTING', monthlySalary: 12000, sortOrder: 6 },
  { role: 'Slitting Helper', process: 'SLITTING', monthlySalary: 8000, sortOrder: 7 },
];

/**
 * Ink solids and laydown, from the works' Costing sheet.
 *
 * White is an opaque base coat and lays an order of magnitude heavier than a
 * process colour, which is why one "ink GSM" cannot price a job using both.
 */
const INKS: { match: string; solidsPercent: number; laydownGsm: number }[] = [
  { match: 'black', solidsPercent: 23, laydownGsm: 0.15 },
  { match: 'cyan', solidsPercent: 19.5, laydownGsm: 0.14 },
  { match: 'magenta', solidsPercent: 19.5, laydownGsm: 0.13 },
  { match: 'yellow', solidsPercent: 19.5, laydownGsm: 0.13 },
  { match: 'white', solidsPercent: 40, laydownGsm: 1.8 },
  { match: 'red', solidsPercent: 23, laydownGsm: 0.25 },
  { match: 'violet', solidsPercent: 22.1, laydownGsm: 0.25 },
  { match: 'green', solidsPercent: 21.8, laydownGsm: 0.18 },
];

/**
 * Colours the works prints but the rate catalogue did not carry.
 *
 * Created without a rate on purpose. The whole point of costing ink per colour
 * is that a white base coat lays 1.8 g/m² against a process colour's 0.13 —
 * so a job that prints white and cannot say so is costed at a twelfth of its
 * real ink. Inventing a price would be worse than the gap: the screens refuse
 * to quote a colour that has no rate, which is a question somebody answers
 * once on the Rates screen.
 */
const MISSING_COLOURS = [
  { name: 'Ink — White', solidsPercent: 40, laydownGsm: 1.8 },
  { name: 'Ink — Red', solidsPercent: 23, laydownGsm: 0.25 },
  { name: 'Ink — Violet', solidsPercent: 22.1, laydownGsm: 0.25 },
  { name: 'Ink — Green', solidsPercent: 21.8, laydownGsm: 0.18 },
];

async function main() {
  let added = 0;
  let skipped = 0;

  for (const machine of MACHINES) {
    const existing = await prisma.costingMachine.findUnique({ where: { name: machine.name } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.costingMachine.create({ data: machine });
    added += 1;
  }

  for (const role of LABOUR) {
    const existing = await prisma.costingLabour.findUnique({ where: { role: role.role } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.costingLabour.create({ data: role });
    added += 1;
  }

  /* Ink solids, onto whichever ink materials this database already holds. */
  let inked = 0;
  const inks = await prisma.material.findMany({ where: { category: 'INK' } });
  for (const ink of inks) {
    if (ink.solidsPercent !== null && ink.laydownGsm !== null) continue;
    const match = INKS.find((known) => ink.name.toLowerCase().includes(known.match));
    if (!match) continue;
    await prisma.material.update({
      where: { id: ink.id },
      data: { solidsPercent: match.solidsPercent, laydownGsm: match.laydownGsm },
    });
    inked += 1;
  }

  /* Adhesive is 80% solids before dilution; the batch ratio dilutes it. */
  const adhesives = await prisma.material.findMany({
    where: { category: 'ADHESIVE', solidsPercent: null },
  });
  for (const adhesive of adhesives) {
    await prisma.material.update({ where: { id: adhesive.id }, data: { solidsPercent: 80 } });
    inked += 1;
  }

  /* The colours the sheet prices but the catalogue never held. */
  let colours = 0;
  const lastInk = await prisma.material.findFirst({
    where: { category: 'INK' },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  let order = (lastInk?.sortOrder ?? 0) + 1;
  for (const colour of MISSING_COLOURS) {
    const existing = await prisma.material.findUnique({ where: { name: colour.name } });
    if (existing) continue;
    await prisma.material.create({
      data: { ...colour, category: 'INK', unit: 'KG', sortOrder: order++ },
    });
    colours += 1;
  }

  console.log(`costing master data: ${added} added, ${skipped} already there`);
  if (colours > 0) {
    console.log(`colours added WITHOUT a rate: ${colours} — price them on the Rates screen`);
  }
  console.log(`materials given solids/laydown: ${inked}`);
  console.log('\nEvery figure is from a 2022 sheet. Check them on the Costing screen.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
