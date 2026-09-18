/**
 * Adds the works' second laminator, as a copy of the first.
 *
 *   npm run seed:second-laminator -w @yuva/api            say what would change
 *   npm run seed:second-laminator -w @yuva/api -- --write do it
 *
 * The works runs two and they do not cost the same. What they cost is not
 * recorded anywhere yet — the September 2026 job sheet names "Lamination 1" and
 * "Lamination 2" in its electricity block and gives both the same 20% share,
 * and the second has never run on any of the fourteen tabs, so the workbook has
 * never costed it once. No speed, no horsepower, no rate, no setup time.
 *
 * So it starts as an exact copy of the first, which is what the works asked for
 * — a row on the Costing screen they can correct — and the day somebody types
 * the real speed or the real rate into it, every quotation that runs on it
 * moves. Copying is honest in a way that inventing figures would not be: the
 * two machines price identically because nobody has yet said how they differ,
 * not because somebody decided they are the same.
 *
 * The existing laminator is renamed "Laminator 1" so the pair reads as a pair.
 * A job runs on ONE machine of each kind — the one it names, or the first by
 * sort order — so adding this one does not bill lamination twice. See
 * `rate-costing.ts` and the tests beside it, which exist because that is
 * exactly what it did before.
 */
import { prisma } from '../src/lib/prisma.js';

const write = process.argv.includes('--write');

const laminators = await prisma.costingMachine.findMany({
  where: { kind: 'LAMINATION' },
  orderBy: { sortOrder: 'asc' },
});

if (laminators.length === 0) {
  console.log('\nNo laminator on the list to copy. Run seed:costing first.');
} else if (laminators.length > 1) {
  console.log(`\n${laminators.length} laminators already:`);
  for (const m of laminators) {
    console.log(
      `  ${m.name.padEnd(16)} ${m.speedMPerMin} m/min, ${m.horsepower} HP, ` +
        `Rs ${m.powerRatePerHpHour}/HP-hr, ${m.setupMinutes} min setup` +
        `${m.isActive ? '' : '  (retired)'}`,
    );
  }
  console.log('\nNothing to add.');
} else {
  const first = laminators[0]!;
  const copy = {
    name: 'Laminator 2',
    kind: 'LAMINATION' as const,
    horsepower: first.horsepower,
    stationHorsepower: first.stationHorsepower,
    stationColourSteps: first.stationColourSteps,
    powerRatePerHpHour: first.powerRatePerHpHour,
    speedMPerMin: first.speedMPerMin,
    setupMinutes: first.setupMinutes,
    setupPowerFactor: first.setupPowerFactor,
    sortOrder: first.sortOrder + 1,
  };

  console.log(
    `\n${write ? 'Adding' : 'Would add'} Laminator 2, copied from ${first.name}:\n` +
      `  ${copy.speedMPerMin} m/min, ${copy.horsepower} HP, ` +
      `Rs ${copy.powerRatePerHpHour}/HP-hr, ${copy.setupMinutes} min setup`,
  );

  if (write) {
    if (first.name !== 'Laminator 1') {
      await prisma.costingMachine.update({
        where: { id: first.id },
        data: { name: 'Laminator 1' },
      });
      console.log(`  renamed "${first.name}" to "Laminator 1"`);
    }
    await prisma.costingMachine.create({ data: copy });
    console.log('  added.');
  }
}

console.log(`
Both price identically until somebody says how they differ. Correct Laminator 2
on the Costing screen — its speed, its horsepower, or its rate per HP-hour,
which is a LOADED rate rather than a tariff (the works' own are printing 9,
lamination 35, slitting 60).

A job runs on the first laminator by sort order. To make the second the one the
works normally uses, put it first — or retire the other.`);

await prisma.$disconnect();
