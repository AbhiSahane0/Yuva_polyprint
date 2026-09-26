/**
 * **The works' own stock register, loaded as opening stock.**
 *
 * Their September 2026 workbook is eight sheets — one per film — and every row
 * is a reel: a width, a gauge, and what is left of it. Opening plus inward less
 * outward equals closing on all three hundred and ninety-two rows of it, which
 * is better bookkeeping than most systems manage.
 *
 * What it cannot do is say what any of it is worth (the rate column is empty on
 * all four hundred and thirty-five rows), how old it is (forty-eight dates), or
 * where a roll went (outward is a number with no job beside it). Those are the
 * questions loading it here answers.
 *
 * **It is kept by WIDTH, and it is right to be.** Film is not fungible by
 * weight: PET 12µm sits in twenty-three widths from 340 mm to 1040 mm, and a
 * job needing 650 mm cannot run on a 340 mm reel however many kilograms are
 * behind it. That is why stock batches carry a width now.
 *
 *   npm run import:stock -w @yuva/api -- --file "path/to/Stock Record.xlsx"
 *   npm run import:stock -w @yuva/api -- --file "..." --dry-run
 *   npm run import:stock -w @yuva/api -- --clear
 *
 * A plain run refuses to load twice; `--clear` removes what it loaded.
 */
import { execFileSync } from 'node:child_process';
import { receiveStockSchema } from '@yuva/shared';
import { prisma } from '../src/lib/prisma.js';
import { receiveStock } from '../src/modules/inventory/inventory.service.js';

/** What marks a batch as this script's, and what `--clear` looks for. */
const PREFIX = 'STK-';

/**
 * Which sheet is which film.
 *
 * Their register separates Milky from Natural LDPE and the catalogue does not,
 * so both land on the one material — the works prices a film by type, which is
 * what they told us when they said a PET rate covers every gauge of it. The
 * sheet each roll came off is kept in the batch's reference so the two can
 * still be told apart.
 *
 * The two "Balance" sheets are the offcuts left over from slitting. They are
 * real film and they go in, marked so nobody mistakes an eight-kilogram end for
 * a fresh reel.
 */
const SHEETS: { sheet: string; code: string; material: string; note: string }[] = [
  { sheet: 'Polyster -07-08-2026', code: 'PET', material: 'PET 12µm', note: 'Polyester' },
  { sheet: 'MetPet Film 07-08-2026', code: 'MPET', material: 'MET PET 12µm', note: 'Met PET' },
  { sheet: 'Natural LDPE', code: 'NAT', material: 'LDPE Milky / Natural', note: 'Natural LDPE' },
  { sheet: 'Milky Film', code: 'MLK', material: 'LDPE Milky / Natural', note: 'Milky' },
  {
    sheet: 'Balance Milky Film',
    code: 'BMLK',
    material: 'LDPE Milky / Natural',
    note: 'Milky — balance roll',
  },
  {
    sheet: 'Balance Natural Ldpe',
    code: 'BNAT',
    material: 'LDPE Milky / Natural',
    note: 'Natural LDPE — balance roll',
  },
  { sheet: 'PP Film', code: 'PP', material: 'PP Film', note: 'PP' },
  { sheet: 'Nylon Poly', code: 'NYL', material: 'Nylon Poly', note: 'Nylon' },
];

/**
 * Films their register carries that the catalogue does not.
 *
 * Added so the three and a quarter tonnes of them can be counted. **Neither
 * gets a rate or a density here** — a rate is the works' commercial business
 * and a density decides what a ply weighs, and a pearlised BOPP is not the same
 * density as a plain one. Both are named in the report instead.
 */
const MISSING_FILMS = ['PP Film', 'Nylon Poly'];

const READER = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for name in wb.sheetnames:
    ws = wb[name]
    hdr = {}
    for c in range(1, 27):
        v = ws.cell(1, c).value
        if isinstance(v, str): hdr[v.strip().lower()] = c
    need = ('mm size', 'micron size.')
    if not all(k in hdr for k in need): continue
    rows = []
    for r in range(3, ws.max_row + 1):
        def val(key):
            c = hdr.get(key)
            if not c: return None
            v = ws.cell(r, c).value
            return v if isinstance(v, (int, float)) else None
        w, m = val('mm size'), val('micron size.')
        # Closing is what is left. The two "Balance" sheets never fill it in —
        # they are lists of offcuts, not a running account — so what is in the
        # opening column IS what is on the shelf.
        kg = val('closing stock')
        if kg is None: kg = val('opening stock')
        if w is None and m is None: continue
        rows.append({'row': r, 'width': w, 'micron': m, 'kg': kg or 0})
    out[name] = rows
print(json.dumps(out))
`;

type Row = { row: number; width: number | null; micron: number | null; kg: number };

/** The works' press face. A wider reel is slit down before it is printed. */
const PRESS_FACE_MM = 800;

async function clear(): Promise<void> {
  const batches = await prisma.stockBatch.findMany({
    where: { batchCode: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.stockMovement.deleteMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
  await prisma.stockBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
  console.log(`Removed ${batches.length} imported batches.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--clear')) return clear();

  const dryRun = argv.includes('--dry-run');
  const fileAt = argv.indexOf('--file');
  const file = fileAt >= 0 ? argv[fileAt + 1] : undefined;
  if (!file) {
    console.error('Give it the workbook:  --file "Stock Record September Month 2026.xlsx"');
    process.exitCode = 1;
    return;
  }

  const already = await prisma.stockBatch.count({ where: { batchCode: { startsWith: PREFIX } } });
  if (already && !dryRun) {
    console.log(`${already} batches are already imported. Run with --clear first.`);
    return;
  }

  const data = JSON.parse(
    execFileSync('python3', ['-c', READER, file], { encoding: 'utf8', maxBuffer: 64 << 20 }),
  ) as Record<string, Row[]>;

  /* --- the two films their register has and the catalogue does not -------- */
  for (const name of MISSING_FILMS) {
    const existing = await prisma.material.findUnique({ where: { name } });
    if (existing) continue;
    if (dryRun) {
      console.log(`  WOULD ADD   ${name} to the rates master`);
      continue;
    }
    await prisma.material.create({
      data: { name, category: 'FILM', unit: 'KG', sortOrder: 90 },
    });
    console.log(
      `  ADDED       ${name} — needs a rate and a density before anything is quoted on it`,
    );
  }

  const materials = new Map(
    (await prisma.material.findMany({ select: { id: true, name: true } })).map((m) => [
      m.name,
      m.id,
    ]),
  );

  /* --- and the rolls ----------------------------------------------------- */
  const today = new Date().toISOString().slice(0, 10);
  let loaded = 0;
  let kg = 0;
  const skipped: string[] = [];
  const wide: string[] = [];

  for (const { sheet, code, material, note } of SHEETS) {
    const rows = data[sheet];
    if (!rows) {
      skipped.push(`${sheet}: not in the workbook`);
      continue;
    }
    /* On a dry run the two new films have not been created, so counting them
       against a placeholder is what makes the totals honest. */
    const materialId = materials.get(material) ?? (dryRun ? 'dry-run' : null);
    if (!materialId) {
      skipped.push(`${sheet}: no material called "${material}"`);
      continue;
    }

    let sheetKg = 0;
    let sheetRolls = 0;

    for (const row of rows) {
      if (!(row.kg > 0)) continue;

      /*
       * A width their own sheet cannot mean — 600800 is 600 and 800 typed
       * together. Loaded without one rather than dropped: the film is real and
       * on a shelf, and a hundred kilograms vanishing from the count to punish
       * a typo helps nobody. The report names it so somebody can fix it.
       */
      const impossible = row.width !== null && (row.width < 100 || row.width > 2000);
      if (impossible) skipped.push(`${sheet} row ${row.row}: width ${row.width} — left blank`);

      const widthMm = impossible ? null : row.width;
      if (widthMm && widthMm > PRESS_FACE_MM) {
        wide.push(`${sheet} row ${row.row}: ${widthMm} mm`);
      }

      if (!dryRun) {
        await receiveStock(
          receiveStockSchema.parse({
            materialId,
            /* The sheet's own code and its row, so any batch traces straight
               back to the line of the workbook it came off. Four sheets land on
               one material, so the code has to tell them apart. */
            batchCode: `${PREFIX}${code}-${row.row}`,
            quantity: row.kg,
            unit: 'KG',
            widthMm,
            micron: row.micron,
            receivedOn: today,
            location: 'Warehouse A',
            reference: `Stock sheet — ${note}`,
            notes: `${note}${widthMm ? ` · ${widthMm} mm` : ''}${row.micron ? ` · ${row.micron}µ` : ''}`,
          }),
          'Stock sheet',
        );
      }

      loaded += 1;
      kg += row.kg;
      sheetRolls += 1;
      sheetKg += row.kg;
    }

    console.log(
      `  ${sheet.padEnd(26)} ${String(sheetRolls).padStart(4)} rolls  ${sheetKg.toFixed(1).padStart(10)} kg  → ${material}`,
    );
  }

  console.log(`\n${dryRun ? 'WOULD LOAD' : 'Loaded'} ${loaded} reels, ${kg.toFixed(1)} kg.`);

  if (wide.length) {
    console.log(
      `\n${wide.length} reels are wider than the ${PRESS_FACE_MM} mm press face. The works buys wide\n` +
        'and slits down, so they are loaded as they are — listed here only so the count is not a surprise:',
    );
    for (const line of wide) console.log(`  ${line}`);
  }

  if (skipped.length) {
    console.log('\nWorth somebody looking at:');
    for (const line of skipped) console.log(`  ${line}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
