/**
 * Writes the works' three pouch-making bands as a dated change.
 *
 * Dated rather than defaulted, so a quotation written before the works gave
 * these figures still prices on the per-pouch rate it was actually sold at.
 * See the comment beside the zeros in `DEFAULT_SETTINGS`.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import { prisma } from '../src/lib/prisma.js';

const EFFECTIVE = process.env.BANDS_FROM ?? new Date().toISOString().slice(0, 10);
const BANDS = {
  pouchMakingPlainPerKg: '20',
  pouchMakingGussetPerKg: '25',
  pouchMakingGussetHandlePerKg: '30',
} as const;

for (const [key, value] of Object.entries(BANDS)) {
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

console.log('\nA quotation dated before that falls back to the per-pouch rate.');
await prisma.$disconnect();
