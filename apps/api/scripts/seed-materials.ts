/**
 * Seeds the material catalogue and an opening set of rates.
 *
 *   npm run seed:materials -w @yuva/api
 *
 * The list and the opening prices come from the client's own Rates Update
 * wireframe. Densities are the figures the imported job data actually implies:
 * PET reads 1.4 across 404 rows (12µ → 16.8 GSM), and the poly grades separate
 * cleanly at 0.92 for metallocene, 0.94 for general purpose and so on.
 *
 * Safe to re-run: materials are matched by name and never duplicated, and the
 * opening rate is only written when a material has no rate history at all, so
 * this can never overwrite a price the office has keyed in.
 */

import { prisma } from '../src/lib/prisma.js';
import type { MaterialCategory } from '../src/generated/prisma/enums.js';

interface Seed {
  name: string;
  category: MaterialCategory;
  unit?: string;
  density?: number;
  openingRate: number;
}

const MATERIALS: Seed[] = [
  // Films — density converts microns to GSM, which is what makes costing work.
  { name: 'PET 12µm', category: 'FILM', density: 1.4, openingRate: 210 },
  { name: 'PET 19µm', category: 'FILM', density: 1.4, openingRate: 224 },
  { name: 'PE 50µm', category: 'FILM', density: 0.94, openingRate: 185 },
  { name: 'PE 60µm', category: 'FILM', density: 0.94, openingRate: 190 },
  { name: 'LDPE 60µm', category: 'FILM', density: 0.92, openingRate: 178 },
  { name: 'BOPP 20µm', category: 'FILM', density: 0.91, openingRate: 168 },
  { name: 'Foil 7µm', category: 'FILM', density: 2.7, openingRate: 410 },
  { name: 'PVC / PETG 45µm', category: 'FILM', density: 1.3, openingRate: 205 },
  { name: 'POF 40µm', category: 'FILM', density: 0.92, openingRate: 198 },
  { name: 'PP Woven', category: 'FILM', density: 0.7, openingRate: 165 },

  { name: 'Ink — Cyan', category: 'INK', openingRate: 640 },
  { name: 'Ink — Magenta', category: 'INK', openingRate: 640 },
  { name: 'Ink — Yellow', category: 'INK', openingRate: 635 },
  { name: 'Ink — Black', category: 'INK', openingRate: 610 },

  { name: 'Adhesive — PU', category: 'ADHESIVE', openingRate: 480 },

  { name: 'Solvent — Ethyl Acetate', category: 'SOLVENT', unit: 'L', openingRate: 96 },
];

async function main() {
  const today = new Date();
  const effectiveDate = new Date(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}T00:00:00.000Z`,
  );

  let createdMaterials = 0;
  let createdRates = 0;
  let skipped = 0;

  for (const [index, seed] of MATERIALS.entries()) {
    const material = await prisma.material.upsert({
      where: { name: seed.name },
      create: {
        name: seed.name,
        category: seed.category,
        unit: seed.unit ?? 'KG',
        density: seed.density ?? null,
        sortOrder: index,
      },
      // Only ordering is refreshed; a density the office corrected stays put.
      update: { sortOrder: index },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    const isNew = material.createdAt.getTime() === material.updatedAt.getTime();
    if (isNew) createdMaterials += 1;

    const hasHistory = await prisma.materialRate.findFirst({
      where: { materialId: material.id },
      select: { id: true },
    });

    if (hasHistory) {
      skipped += 1;
      continue;
    }

    await prisma.materialRate.create({
      data: {
        materialId: material.id,
        rate: seed.openingRate,
        effectiveDate,
        enteredBy: 'Seed',
      },
    });
    createdRates += 1;
  }

  console.log(
    `Materials: ${createdMaterials} created, ${MATERIALS.length - createdMaterials} already present`,
  );
  console.log(
    `Opening rates: ${createdRates} written, ${skipped} left alone (already had history)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
