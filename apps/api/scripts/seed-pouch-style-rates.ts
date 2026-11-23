/**
 * Writes the works' per-style pouch making rates as a dated change.
 *
 * **What the works gave in November 2026**, after their own sheet was read
 * back to them: a zipper pouch 3.5 paise a centimetre of mouth, a standup
 * zipper 4.5, a standup 30, and a spout Rs 2.70 flat on each pouch. Each is
 * the WHOLE making charge for its style, which is what their sheet does — its
 * entire pouching expense on a standup zipper is the zipper line, with no
 * making charge anywhere in the chain.
 *
 * Held per metre rather than per centimetre because the zipper already is,
 * and two units for one kind of figure is a bug waiting to happen: 3.5 paise
 * a centimetre is Rs 3.50 a metre.
 *
 * `pouchMakingModel` is what actually switches the behaviour on. Dated like
 * the rates, so a quotation written in October finds BANDS and reprices
 * exactly as it was sold — nothing already sent moves.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import { prisma } from '../src/lib/prisma.js';

const EFFECTIVE = process.env.STYLE_RATES_FROM ?? new Date().toISOString().slice(0, 10);

const RATES = {
  /* Rs per metre of the pouch's mouth. */
  zipperStyleRatePerMetre: '3.5',
  standupZipperRatePerMetre: '4.5',
  standupRatePerMetre: '30',
  /* Rs on each pouch, a spout being a part bought in. */
  spoutPerPouch: '2.7',
  /* The switch. Without this the four rates above are read and ignored. */
  pouchMakingModel: 'PER_STYLE',
} as const;

for (const [key, value] of Object.entries(RATES)) {
  const already = await prisma.appSetting.findUnique({ where: { key } });
  if (already?.value === value) {
    console.log(`  already set  ${key} = ${value}`);
    continue;
  }
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await prisma.appSettingHistory.create({
    data: { key, value, effectiveDate: new Date(`${EFFECTIVE}T00:00:00.000Z`) },
  });
  console.log(`  set          ${key} = ${value}  effective ${EFFECTIVE}`);
}

console.log(`
What this changes, from ${EFFECTIVE}:

  Zipper            mouth cm x 3.5 paise   the whole making charge
  Standup zipper    mouth cm x 4.5 paise   the whole making charge
  Standup           mouth cm x 30  paise   the whole making charge
  Spout             Rs 2.70 a pouch        the whole making charge
  D punch           Rs 0.60, Rs 0.80 wide  now actually charged

Everything else - centre seal, three side seal, flat bottom - goes on being
costed at the Rs 20/25/30 bands. A quotation dated before this finds BANDS.
`);

await prisma.$disconnect();
