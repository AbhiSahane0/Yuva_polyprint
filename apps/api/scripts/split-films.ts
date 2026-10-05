/**
 * **Milky and natural are two films, and W/O poly is LDPE under another name.**
 *
 * The rate master carried one `LDPE Milky / Natural`, which is two films in one
 * row: the milky one is pigmented and the natural one is clear, and a clear
 * poly needs a white laid down behind the print. Quoting them as one meant the
 * white was remembered or it was not.
 *
 * `W/O Poly 110µm` is the works' own name for the same LDPE. It is retired here
 * rather than deleted — five quotation lines name it, and those documents have
 * to go on reading — and its stock is moved onto LDPE Milky so the shelf stays
 * honest.
 *
 * Nylon gets the same treatment, with no rate on either because the master has
 * never carried one.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import { prisma } from '../src/lib/prisma.js';

const DRY = !process.argv.includes('--write');
const say = (line: string) => console.log(`  ${line}`);

async function main() {
  console.log(DRY ? '— dry run, nothing written. Pass --write to apply. —\n' : '— applying —\n');

  const byName = async (name: string) =>
    prisma.material.findFirst({
      where: { name },
      select: { id: true, name: true, density: true, sortOrder: true, category: true, unit: true },
    });

  /* --- 1. the milky one keeps the row, and loses the slash ---------------- */
  const ldpe = (await byName('LDPE Milky / Natural')) ?? (await byName('LDPE Milky'));
  if (!ldpe) throw new Error('LDPE is not on the rate master');
  if (ldpe.name !== 'LDPE Milky') {
    say(`rename  ${ldpe.name} → LDPE Milky   (keeps its id, stock and history)`);
    if (!DRY)
      await prisma.material.update({ where: { id: ldpe.id }, data: { name: 'LDPE Milky' } });
  } else say('LDPE Milky is already named');

  /* --- 2. the natural one is new, priced the same until told otherwise ---- */
  const ldpeRate = await prisma.materialRate.findFirst({
    where: { materialId: ldpe.id },
    orderBy: { effectiveDate: 'desc' },
    select: { rate: true, effectiveDate: true },
  });

  for (const [source, fresh] of [
    [ldpe, 'LDPE Natural'],
    [await byName('Nylon Poly'), 'Nylon Natural'],
  ] as const) {
    if (!source) {
      say(`skip    ${fresh} — its milky counterpart is not on the master`);
      continue;
    }
    if (await byName(fresh)) {
      say(`exists  ${fresh}`);
      continue;
    }

    say(
      `create  ${fresh}   density ${source.density ?? '—'}${fresh.startsWith('LDPE') ? `, at Rs ${ldpeRate?.rate ?? '—'}/kg` : ', no rate — same as Nylon Poly'}`,
    );
    if (DRY) continue;

    const made = await prisma.material.create({
      data: {
        name: fresh,
        category: source.category,
        unit: source.unit,
        density: source.density,
        sortOrder: source.sortOrder,
        isActive: true,
      },
      select: { id: true },
    });
    /* The natural film costs what the milky one costs until the works says
       otherwise. A film with no rate cannot be quoted at all, which would make
       the new option useless the day it appeared. */
    if (fresh.startsWith('LDPE') && ldpeRate) {
      await prisma.materialRate.create({
        data: { materialId: made.id, rate: ldpeRate.rate, effectiveDate: ldpeRate.effectiveDate },
      });
    }
  }

  /* --- 3. W/O poly is LDPE. Retire it and move the shelf across ----------- */
  const wo = await byName('W/O Poly 110µm');
  if (!wo) say('W/O Poly 110µm is already gone');
  else {
    const batches = await prisma.stockBatch.findMany({
      where: { materialId: wo.id },
      select: { id: true, quantity: true },
    });
    const kg = batches.reduce((sum, b) => sum + Number(b.quantity), 0);
    const layers = await prisma.quotationItemLayer.count({ where: { materialId: wo.id } });
    say(
      `retire  W/O Poly 110µm → its ${batches.length} batch(es), ${kg.toFixed(1)} kg, move to LDPE Milky`,
    );
    say(`        ${layers} quotation line(s) keep naming it, and go on reading as they were sent`);

    if (!DRY) {
      /* The movement carries a denormalised material of its own, so both move
         or the ledger disagrees with the shelf. */
      await prisma.stockMovement.updateMany({
        where: { batchId: { in: batches.map((b) => b.id) } },
        data: { materialId: ldpe.id },
      });
      await prisma.stockBatch.updateMany({
        where: { materialId: wo.id },
        data: { materialId: ldpe.id },
      });
      await prisma.material.update({ where: { id: wo.id }, data: { isActive: false } });
    }
  }

  console.log('\n--- the films afterwards ---');
  for (const m of await prisma.material.findMany({
    where: { category: 'FILM' },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      density: true,
      isActive: true,
      stockBatches: { select: { quantity: true } },
      rates: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { rate: true } },
    },
  })) {
    const kg = m.stockBatches.reduce((s, b) => s + Number(b.quantity), 0);
    console.log(
      `  ${m.name.padEnd(24)} ${m.isActive ? 'offered ' : 'retired '} d=${String(m.density ?? '—').padEnd(5)} rate=${String(m.rates[0]?.rate ?? '—').padEnd(5)} ${kg.toFixed(1).padStart(9)} kg`,
    );
  }
}

await main();
await prisma.$disconnect();
