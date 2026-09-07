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
 * Solids and laydown for the four process colours, from the works' Costing
 * sheet.
 *
 * Only those four. A white base coat, a brand's Pantone, a metallic — those are
 * a job's own decision and belong to the works only once somebody has bought a
 * tin, so they are added from the quotation screen as they come up rather than
 * seeded here as a guess at what this works prints.
 */
const PROCESS_INKS: { match: string; solidsPercent: number; laydownGsm: number }[] = [
  { match: 'black', solidsPercent: 23, laydownGsm: 0.15 },
  { match: 'cyan', solidsPercent: 19.5, laydownGsm: 0.14 },
  { match: 'magenta', solidsPercent: 19.5, laydownGsm: 0.13 },
  { match: 'yellow', solidsPercent: 19.5, laydownGsm: 0.13 },
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

  /* The four process colours, onto whichever ink rows this database holds. */
  let inked = 0;
  const inks = await prisma.material.findMany({ where: { category: 'INK' } });
  for (const ink of inks) {
    const match = PROCESS_INKS.find((known) => ink.name.toLowerCase().includes(known.match));
    if (!match) continue;
    await prisma.material.update({
      where: { id: ink.id },
      data: {
        /* Never overwrites a figure the office has corrected. */
        solidsPercent: ink.solidsPercent ?? match.solidsPercent,
        laydownGsm: ink.laydownGsm ?? match.laydownGsm,
        inkKind: 'PROCESS',
      },
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

  console.log(`costing master data: ${added} added, ${skipped} already there`);
  console.log(`process colours given solids/laydown: ${inked}`);
  console.log('\nEvery figure is from a 2022 sheet. Check them on the Costing screen.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
