/**
 * Brings the material list on one database into line with another, once.
 *
 * Three actions, because the three groups are genuinely different:
 *
 *   ADD     materials the source has and the target does not, with the rate
 *           that was last recorded for them.
 *   RETIRE  materials the target has and the source does not, but which REAL
 *           documents were priced on. Retiring takes them off the Rates screen
 *           and leaves the row, so those documents can still say what they
 *           cost. Deleting them would make a sent quotation unexplainable.
 *   DELETE  the rest — rows nothing whatsoever points at.
 *
 * The target is whatever DATABASE_URL points at; the source is read from
 * SOURCE_DATABASE_URL. Pass --dry-run to see the three lists and write nothing.
 */
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { prisma as target } from '../src/lib/prisma.js';

const dryRun = process.argv.includes('--dry-run');
const sourceUrl = process.env.SOURCE_DATABASE_URL;
if (!sourceUrl) {
  console.error('Set SOURCE_DATABASE_URL to the database to copy FROM.');
  process.exit(1);
}
const source = new PrismaClient({ adapter: new PrismaPg({ connectionString: sourceUrl }) });

const here = (await target.$queryRawUnsafe<{ db: string }[]>('select current_database() as db'))[0]!
  .db;
console.log(`${dryRun ? 'DRY RUN — ' : ''}target: ${here}\n`);

const sel = {
  name: true,
  category: true,
  unit: true,
  density: true,
  solidsPercent: true,
  laydownGsm: true,
  reorderLevel: true,
  isActive: true,
  sortOrder: true,
} as const;

const want = await source.material.findMany({
  select: {
    ...sel,
    rates: {
      orderBy: { effectiveDate: 'desc' },
      take: 1,
      select: { rate: true, effectiveDate: true },
    },
  },
});
const have = await target.material.findMany({ select: { id: true, name: true } });
const byName = new Map(have.map((m) => [m.name, m.id]));
const wanted = new Set(want.map((m) => m.name));

/* ---- add --------------------------------------------------------------- */
const toAdd = want.filter((m) => !byName.has(m.name));
console.log(`ADD (${toAdd.length})`);
for (const m of toAdd) {
  const rate = m.rates[0];
  console.log(
    `   ${m.name.padEnd(26)} ${m.category.padEnd(9)} ${rate ? 'rate ' + rate.rate : 'no rate recorded'}`,
  );
  if (dryRun) continue;
  const made = await target.material.create({
    data: {
      name: m.name,
      category: m.category,
      unit: m.unit,
      density: m.density,
      solidsPercent: m.solidsPercent,
      laydownGsm: m.laydownGsm,
      reorderLevel: m.reorderLevel,
      isActive: m.isActive,
      sortOrder: m.sortOrder,
    },
    select: { id: true },
  });
  if (rate) {
    await target.materialRate.create({
      data: {
        materialId: made.id,
        rate: rate.rate,
        effectiveDate: rate.effectiveDate,
        enteredBy: 'Synced from local',
      },
    });
  }
}

/* ---- retire or delete the extras --------------------------------------- */
const extras = have.filter((m) => !wanted.has(m.name));
const retire: string[] = [];
const remove: string[] = [];
for (const m of extras) {
  const c = (
    await target.material.findUniqueOrThrow({
      where: { id: m.id },
      select: {
        _count: {
          select: {
            stockBatches: true,
            quotationItemLayers: true,
            quotationItemColours: true,
            stockMovements: true,
            purchaseOrderLines: true,
            reservations: true,
          },
        },
      },
    })
  )._count;
  const used =
    c.stockBatches +
    c.quotationItemLayers +
    c.quotationItemColours +
    c.stockMovements +
    c.purchaseOrderLines +
    c.reservations;
  (used > 0 ? retire : remove).push(m.name);
}

console.log(`\nRETIRE (${retire.length}) — documents were priced on these, so the rows stay`);
for (const name of retire) {
  console.log(`   ${name}`);
  if (!dryRun)
    await target.material.update({ where: { id: byName.get(name)! }, data: { isActive: false } });
}

console.log(`\nDELETE (${remove.length}) — nothing points at these`);
for (const name of remove) {
  console.log(`   ${name}`);
  if (!dryRun) await target.material.delete({ where: { id: byName.get(name)! } });
}

console.log(
  `\n${dryRun ? 'would leave' : 'now'}: ${await target.material.count()} materials, ` +
    `${await target.material.count({ where: { isActive: true } })} live on the Rates screen`,
);
console.log(
  `source has : ${await source.material.count()} materials, ` +
    `${await source.material.count({ where: { isActive: true } })} live`,
);

await source.$disconnect();
await target.$disconnect();
