/**
 * Imports the legacy "Production management May-2025 — Jobs Data" sheet into
 * PostgreSQL.
 *
 *   npm run import:legacy -- --dry-run     inspect the parse, touch nothing
 *   npm run import:legacy                  import (refuses if data exists)
 *   npm run import:legacy -- --fresh       wipe the two tables, then import
 *
 * What it does:
 *   - Splits the combined "Comapny Name, Address & Mobile" column into
 *     company name / address / mobile / alt phone, and adds an email column
 *     (the sheet contains no email addresses, so every row gets 'NA').
 *   - Loads all 415 job rows with their engineering specs, linked to the
 *     customer where the sheet named one.
 *   - Writes every skipped or suspicious row to a rejects report so nothing
 *     disappears silently.
 *
 * Text columns are filled with the literal 'NA' when the source is blank, as
 * requested. Numeric columns use NULL instead — 'NA' is not a number, and the
 * source itself already stores ranges like "15-16" in separate text columns.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { prisma } from '../src/lib/prisma.js';
import { NA, parseCustomer, type ParsedCustomer } from './lib/parse-customer.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../..');
const CSV_PATH = resolve(REPO_ROOT, 'csv_files/Production manegment May-2025 - Jobs Data.csv');
const REPORT_PATH = resolve(here, '../import-reports/legacy-jobs-report.json');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FRESH = args.has('--fresh');

/** Column indexes in the source sheet. The header row is row 2 (1-based). */
const COL = {
  jobCode: 0,
  jobName: 1,
  jobType: 2,
  pouchType: 3,
  petMicron: 4,
  metPetMicron: 5,
  polyMicron: 6,
  polyType: 7,
  jobFinalDirection: 8,
  printingType: 9,
  designHeight: 10,
  designOpenWidth: 11,
  ups: 12,
  inkGsm: 13,
  petGsm: 14,
  metPetGsm: 15,
  polyGsm: 16,
  adhesiveGsm: 17,
  compositeGsm: 18,
  jobColours: 19,
  totalCylinders: 20,
  design: 21,
  up1: 22,
  up2: 23,
  up3: 24,
  up4: 25,
  notes: 26,
  up2OpenWidth: 27,
  up2Height: 28,
  up3OpenWidth: 29,
  rubberSize: 30,
  cylinderCell: 31,
  cylinderDia: 32,
  dPunch: 33,
  pouchPlateSize: 34,
  viscosity: 35,
  coatingGsm: 36,
  singleRollWeight: 37,
  pouchesPerKg: 38,
  layer: 39,
  pouchSubType: 40,
  pouchHeight: 41,
  pouchOpenWidth: 42,
  dPunchTopSize: 43,
  gusset: 44,
  gussetSize: 45,
  vNotch: 46,
  customer: 47,
  cylinderParty: 48,
} as const;

/** Values the sheet uses to mean "nothing here". */
const BLANK_TOKENS = new Set([
  '',
  'n/a',
  'na',
  'n.a.',
  'n/a.',
  '-',
  '--',
  'nil',
  'none',
  '#div/0!',
]);

/** Placeholder scribbles used to fill unused spec cells. */
const PLACEHOLDER_TOKENS = new Set(['x', 'xx', 'xxx', 'xxxx', '●●●●●']);

function cell(row: string[], index: number): string {
  return (row[index] ?? '').trim();
}

/** Text column: blanks and sheet placeholders become 'NA'. */
function text(row: string[], index: number): string {
  const value = cell(row, index);
  const lower = value.toLowerCase();
  if (BLANK_TOKENS.has(lower) || PLACEHOLDER_TOKENS.has(lower)) return NA;
  return value;
}

/** Numeric column: anything non-numeric becomes NULL. */
function num(row: string[], index: number): number | null {
  const value = cell(row, index).replace(/,/g, '');
  if (BLANK_TOKENS.has(value.toLowerCase())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface Reject {
  sourceRow: number;
  reason: string;
  value: string;
}

async function main() {
  const rejects: Reject[] = [];

  try {
    const raw = readFileSync(CSV_PATH, 'utf8');
    const rows: string[][] = parse(raw, { relaxColumnCount: true, skipEmptyLines: false });

    // Row 1 is a numeric index row, row 2 is the header. Data starts at row 3.
    const dataRows = rows.slice(2);
    console.log(`Read ${dataRows.length} data rows from ${CSV_PATH}`);

    // ---- Pass 1: build the distinct customer list -------------------------
    const customers = new Map<string, ParsedCustomer>();

    dataRows.forEach((row, index) => {
      const sourceRow = index + 3;
      const value = cell(row, COL.customer);
      if (!value) return;

      const parsed = parseCustomer(value);
      if (!parsed) {
        rejects.push({ sourceRow, reason: 'not a customer entry', value });
        return;
      }
      // Later rows repeat the same customer; keep the first parse.
      if (!customers.has(parsed.companyName)) customers.set(parsed.companyName, parsed);
    });

    const customerList = [...customers.values()];
    const verified = customerList.filter((c) => c.isVerified).length;

    console.log(
      `\nCustomers: ${customerList.length} distinct ` +
        `(${verified} fully parsed, ${customerList.length - verified} need review)`,
    );
    console.log(`Rejected customer entries: ${rejects.length}`);

    if (DRY_RUN) {
      console.log('\n--- parsed customers ---');
      for (const c of customerList) {
        console.log(
          [
            `  name     : ${c.companyName}`,
            `  mobile   : ${c.mobile}${c.altPhone !== NA ? `   alt: ${c.altPhone}` : ''}`,
            `  email    : ${c.email}`,
            `  address  : ${c.address}`,
            `  city/dist: ${c.city} / ${c.district}   pin: ${c.pincode}`,
            `  contact  : ${c.contactPerson}`,
            `  verified : ${c.isVerified}`,
            '',
          ].join('\n'),
        );
      }
      console.log('--- rejected ---');
      for (const r of rejects) console.log(`  row ${r.sourceRow}: ${r.reason} -> ${r.value!}`);
      console.log('\nDry run — nothing was written.');
      return;
    }

    // ---- Guard against a duplicate import ---------------------------------
    const existing = await prisma.job.count();
    const existingCustomers = await prisma.customer.count();

    if ((existing > 0 || existingCustomers > 0) && !FRESH) {
      console.error(
        `\nRefusing to import: the database already holds ${existingCustomers} customers ` +
          `and ${existing} jobs.\nRe-run with --fresh to replace them.`,
      );
      process.exitCode = 1;
      return;
    }

    if (FRESH) {
      // Jobs reference customers, so they go first.
      await prisma.job.deleteMany();
      await prisma.customer.deleteMany();
      console.log('Cleared existing customers and jobs (--fresh)');
    }

    // ---- Pass 2: write ----------------------------------------------------
    const idByCompany = new Map<string, string>();

    // Several hundred inserts comfortably exceed Prisma's 5s default.
    await prisma.$transaction(
      async (tx) => {
        for (const customer of customerList) {
          const created = await tx.customer.create({ data: customer });
          idByCompany.set(customer.companyName, created.id);
        }

        for (const [index, row] of dataRows.entries()) {
          const sourceRow = index + 3;

          // A row with neither a job code nor a job name carries no job.
          if (!cell(row, COL.jobCode) && !cell(row, COL.jobName)) {
            rejects.push({ sourceRow, reason: 'no job code or job name', value: '' });
            continue;
          }

          const customerValue = cell(row, COL.customer);
          const parsedCustomer = customerValue ? parseCustomer(customerValue) : null;
          const customerId = parsedCustomer
            ? (idByCompany.get(parsedCustomer.companyName) ?? null)
            : null;

          await tx.job.create({
            data: {
              jobCode: text(row, COL.jobCode),
              jobName: text(row, COL.jobName),
              jobType: text(row, COL.jobType),
              customerId,

              pouchType: text(row, COL.pouchType),
              petMicron: num(row, COL.petMicron),
              metPetMicron: num(row, COL.metPetMicron),
              polyMicron: num(row, COL.polyMicron),
              polyType: text(row, COL.polyType),
              layer: num(row, COL.layer),
              jobFinalDirection: text(row, COL.jobFinalDirection),
              printingType: text(row, COL.printingType),

              designHeight: num(row, COL.designHeight),
              designOpenWidth: num(row, COL.designOpenWidth),
              ups: num(row, COL.ups),
              design: text(row, COL.design),
              jobColours: text(row, COL.jobColours),
              totalCylinders: num(row, COL.totalCylinders),

              inkGsm: num(row, COL.inkGsm),
              petGsm: num(row, COL.petGsm),
              metPetGsm: num(row, COL.metPetGsm),
              polyGsm: num(row, COL.polyGsm),
              adhesiveGsm: num(row, COL.adhesiveGsm),
              compositeGsm: num(row, COL.compositeGsm),
              coatingGsm: num(row, COL.coatingGsm),

              up1: text(row, COL.up1),
              up2: text(row, COL.up2),
              up3: text(row, COL.up3),
              up4: text(row, COL.up4),
              up2OpenWidth: text(row, COL.up2OpenWidth),
              up2Height: text(row, COL.up2Height),
              up3OpenWidth: text(row, COL.up3OpenWidth),
              notes: text(row, COL.notes),

              rubberSize: num(row, COL.rubberSize),
              cylinderCell: num(row, COL.cylinderCell),
              cylinderDia: num(row, COL.cylinderDia),
              cylinderParty: text(row, COL.cylinderParty),

              viscosity: text(row, COL.viscosity),
              singleRollWeight: text(row, COL.singleRollWeight),
              pouchPlateSize: text(row, COL.pouchPlateSize),
              pouchesPerKg: text(row, COL.pouchesPerKg),

              dPunch: text(row, COL.dPunch),
              dPunchTopSize: text(row, COL.dPunchTopSize),
              pouchSubType: text(row, COL.pouchSubType),
              pouchHeight: num(row, COL.pouchHeight),
              pouchOpenWidth: num(row, COL.pouchOpenWidth),
              gusset: text(row, COL.gusset),
              gussetSize: text(row, COL.gussetSize),
              vNotch: text(row, COL.vNotch),

              sourceRow,
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    const [customerCount, jobCount, linkedCount] = await Promise.all([
      prisma.customer.count(),
      prisma.job.count(),
      prisma.job.count({ where: { customerId: { not: null } } }),
    ]);

    console.log(`\nImported ${customerCount} customers and ${jobCount} jobs.`);
    console.log(`Jobs linked to a customer: ${linkedCount}`);

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          importedAt: new Date().toISOString(),
          source: CSV_PATH,
          customers: customerCount,
          jobs: jobCount,
          jobsLinkedToCustomer: linkedCount,
          customersNeedingReview: customerList
            .filter((c) => !c.isVerified)
            .map((c) => ({ companyName: c.companyName, sourceRaw: c.sourceRaw })),
          rejects,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`Report written to ${REPORT_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nImport failed:', error);
  process.exit(1);
});
