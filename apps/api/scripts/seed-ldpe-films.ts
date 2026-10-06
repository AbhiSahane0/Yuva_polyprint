/**
 * The works' LDPE film catalogue, priced off one number.
 *
 * From the client's own rate master (October 2026): twelve grades, of which
 * **General Purpose is the base** and the other eleven are that rate plus a
 * fixed amount — Rs 6 for a 1 kg packaging film, Rs 55 for a frosty one. The
 * office keys General Poly and the eleven follow; see `writeDerivedRates`.
 *
 * It also retires the two vague rows this replaces. `LDPE Natural` and
 * `LDPE Milky` were one entry each for a family of grades that do not share a
 * price, and five saved quotation lines point at `LDPE Milky` — so they are
 * retired rather than deleted, which keeps those documents readable while
 * taking the pair out of the film dropdown.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import { prisma } from '../src/lib/prisma.js';

/** g/cm³. Every grade here is LDPE, which is what the two it replaces carry. */
const LDPE_DENSITY = '0.92';

/** The base. Its rate is the one number the office types. */
const BASE = {
  name: 'LDPE Natural GP (NAT-GP)',
  note: 'Lamination grade, above 25 micron. The base every other LDPE grade is priced from.',
};

/**
 * The eleven that follow it, in the order of the client's table.
 *
 * `MW-40+` is deliberately absent. The table prices it as "Natural film rate
 * + Rs 13" with NAT-GP only as an example, so which natural grade it follows
 * is not settled — and a film on the list at a rate nobody confirmed is worse
 * than one that is not offered yet.
 */
const GRADES: { name: string; premium: string }[] = [
  { name: 'LDPE Natural 1 KG (NAT-1KG)', premium: '6' },
  { name: 'LDPE Natural 5 KG (NAT-5KG)', premium: '12' },
  { name: 'LDPE Natural Nitrogen Flush (NAT-NF)', premium: '11' },
  { name: 'LDPE Natural Vacuum (NAT-VAC)', premium: '21' },
  { name: 'LDPE Milky White 3-Layer (MW-3L)', premium: '21' },
  { name: 'LDPE 3-Layer Shrink (SHR-3L)', premium: '23' },
  { name: 'LDPE Natural Easy Tear MD (NAT-ET-MD)', premium: '7' },
  { name: 'LDPE Frosty (FROST)', premium: '55' },
  { name: 'LDPE Milky White Shampoo Sachet (MW-SACH)', premium: '22' },
  { name: 'LDPE Natural Surface Printing (NAT-SP)', premium: '7.5' },
  { name: 'LDPE Natural High Clarity (NAT-HC)', premium: '3' },
];

/** Sorted after the laminate films and before the retired ones. */
const SORT_FROM = 10;

const base = await prisma.material.upsert({
  where: { name: BASE.name },
  create: {
    name: BASE.name,
    category: 'FILM',
    unit: 'KG',
    density: LDPE_DENSITY,
    sortOrder: SORT_FROM,
    isActive: true,
  },
  update: { density: LDPE_DENSITY, sortOrder: SORT_FROM, isActive: true },
});
console.log(`  base         ${BASE.name}`);
console.log(`               ${BASE.note}`);

let changed = 0;
for (const [index, grade] of GRADES.entries()) {
  const existing = await prisma.material.findUnique({
    where: { name: grade.name },
    select: { id: true, ratePremium: true, baseMaterialId: true },
  });

  const alreadyRight =
    existing !== null &&
    existing.baseMaterialId === base.id &&
    Number(existing.ratePremium) === Number(grade.premium);

  if (alreadyRight) {
    console.log(`  already set  ${grade.name}  = base + ${grade.premium}`);
    continue;
  }

  await prisma.material.upsert({
    where: { name: grade.name },
    create: {
      name: grade.name,
      category: 'FILM',
      unit: 'KG',
      density: LDPE_DENSITY,
      sortOrder: SORT_FROM + index + 1,
      isActive: true,
      baseMaterialId: base.id,
      ratePremium: grade.premium,
    },
    update: {
      density: LDPE_DENSITY,
      sortOrder: SORT_FROM + index + 1,
      isActive: true,
      baseMaterialId: base.id,
      ratePremium: grade.premium,
    },
  });
  console.log(`  set          ${grade.name}  = base + ${grade.premium}`);
  changed += 1;
}

/*
 * The pair this catalogue replaces. Retired, not deleted: quotations already
 * written against `LDPE Milky` have to go on reading it, and a material row
 * that disappears takes the ply's name off the document with it.
 */
for (const name of ['LDPE Natural', 'LDPE Milky']) {
  const row = await prisma.material.findUnique({
    where: { name },
    select: { id: true, isActive: true },
  });
  if (row === null) continue;
  if (!row.isActive) {
    console.log(`  already out  ${name}`);
    continue;
  }
  await prisma.material.update({ where: { id: row.id }, data: { isActive: false } });
  console.log(`  retired      ${name}  — kept on file for the quotations that name it`);
  changed += 1;
}

/*
 * A starting rate for the base, and only if it has none.
 *
 * Rs 168 is the figure the client's own table is worked against. It is a
 * starting point rather than a quote: the office keys the real one on the
 * Rates screen, and the eleven follow it from that day. Written only when the
 * base is unpriced, so running this again never touches a rate somebody set —
 * and never on a works that has been pricing LDPE for a month.
 */
const priced = await prisma.materialRate.findFirst({ where: { materialId: base.id } });
if (priced === null) {
  const effectiveDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  await prisma.materialRate.create({
    data: { materialId: base.id, rate: '168', effectiveDate, enteredBy: 'Rate master' },
  });
  for (const grade of GRADES) {
    const row = await prisma.material.findUnique({
      where: { name: grade.name },
      select: { id: true },
    });
    if (row === null) continue;
    await prisma.materialRate.create({
      data: {
        materialId: row.id,
        rate: String(168 + Number(grade.premium)),
        effectiveDate,
        enteredBy: 'Rate master',
      },
    });
  }
  console.log(`  priced       base at Rs 168 — the table's own figure. Key the real one on Rates.`);
  changed += 1;
} else {
  console.log('  already priced — left alone');
}

console.log(
  changed === 0
    ? '\nNothing to do — the catalogue is already as the rate master has it.'
    : `\n${changed} change${changed === 1 ? '' : 's'}. Key the General Poly rate on the Rates screen and the eleven follow it.`,
);

await prisma.$disconnect();
