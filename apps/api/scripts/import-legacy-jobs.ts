/**
 * Imports the legacy "Production management May-2025 — Jobs Data" sheet into
 * PostgreSQL.
 *
 *   npm run import:legacy -- --dry-run     inspect the parse, touch nothing
 *   npm run import:legacy                  import (refuses if data exists)
 *   npm run import:legacy -- --fresh       wipe the two tables, then import
 *
 * Two problems in the source sheet drive the shape of this script:
 *
 *  1. Company name, postal address and phone numbers are mashed into a single
 *     "Comapny Name, Address & Mobile" column. `lib/parse-customer.ts` splits
 *     it and adds an email column ('NA' throughout — the sheet has no emails).
 *
 *  2. That column is filled on only 73 of 415 rows. The remaining jobs still
 *     belong to a customer; the only trace is the brand name at the front of
 *     the job name. `lib/brand.ts` recovers it. See `resolveCustomers` below
 *     for the confidence order.
 *
 * Text columns are filled with the literal 'NA' when the source is blank.
 * Numeric columns use NULL instead — 'NA' is not a number, and values the sheet
 * stores as ranges ("15-16", "60-70") keep their own text columns.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { prisma } from '../src/lib/prisma.js';
import { NA, parseCustomer, type ParsedCustomer } from './lib/parse-customer.js';
import {
  brandDisplayName,
  brandToken,
  buildDistinctiveIndex,
  findCustomerInJobName,
  isPlausibleBrand,
} from './lib/brand.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../..');
const CSV_PATH = resolve(REPO_ROOT, 'csv_files/Production manegment May-2025 - Jobs Data.csv');
const REPORT_PATH = resolve(here, '../import-reports/legacy-jobs-report.json');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FRESH = args.has('--fresh');

/** A brand must appear on at least this many jobs to justify a customer record. */
const MIN_JOBS_FOR_PROVISIONAL_CUSTOMER = 2;

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

type CustomerSource = 'SHEET' | 'BRAND_INFERRED';
type JobCustomerSource = 'EXPLICIT' | 'INFERRED' | 'NONE';

interface Reject {
  sourceRow: number;
  reason: string;
  value: string;
}

interface ResolvedJob {
  row: string[];
  sourceRow: number;
  companyName: string | null;
  customerSource: JobCustomerSource;
}

interface Resolution {
  customers: Map<string, ParsedCustomer & { source: CustomerSource }>;
  jobs: ResolvedJob[];
  rejects: Reject[];
  /** Brand tokens seen on unassigned jobs but too rare to justify a customer. */
  unresolvedTokens: Map<string, number>;
}

/**
 * Works out which customer each job belongs to, in descending confidence.
 * Explicitly-named customers are never overridden by inference.
 */
function resolveCustomers(dataRows: string[][]): Resolution {
  const customers = new Map<string, ParsedCustomer & { source: CustomerSource }>();
  const rejects: Reject[] = [];

  // ---- Pass 1: customers named outright in the sheet ------------------------
  const explicitByRow = new Map<number, string>();

  dataRows.forEach((row, index) => {
    const sourceRow = index + 3;
    const value = cell(row, COL.customer);
    if (!value) return;

    const parsed = parseCustomer(value);
    if (!parsed) {
      rejects.push({ sourceRow, reason: 'not a customer entry', value });
      return;
    }
    if (!customers.has(parsed.companyName)) {
      customers.set(parsed.companyName, { ...parsed, source: 'SHEET' });
    }
    explicitByRow.set(sourceRow, parsed.companyName);
  });

  // ---- Learn brand -> customer from those rows -----------------------------
  const learned = new Map<string, Map<string, number>>();

  dataRows.forEach((row, index) => {
    const companyName = explicitByRow.get(index + 3);
    const token = brandToken(cell(row, COL.jobName));
    if (!companyName || !token) return;
    const counts = learned.get(token) ?? new Map<string, number>();
    counts.set(companyName, (counts.get(companyName) ?? 0) + 1);
    learned.set(token, counts);
  });

  /** A token can appear against two customers if the sheet has a slip; majority wins. */
  const learnedWinner = new Map<string, string>();
  for (const [token, counts] of learned) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) learnedWinner.set(token, best[0]);
  }

  // ---- Passes 2-4: match blank rows to an existing customer -----------------
  const sheetCompanyNames = [...customers.keys()];
  const distinctiveIndex = buildDistinctiveIndex(sheetCompanyNames);
  const pending: { row: string[]; sourceRow: number; token: string }[] = [];
  const jobs: ResolvedJob[] = [];

  dataRows.forEach((row, index) => {
    const sourceRow = index + 3;
    if (!cell(row, COL.jobCode) && !cell(row, COL.jobName)) {
      rejects.push({ sourceRow, reason: 'no job code or job name', value: '' });
      return;
    }

    const explicit = explicitByRow.get(sourceRow);
    if (explicit) {
      jobs.push({ row, sourceRow, companyName: explicit, customerSource: 'EXPLICIT' });
      return;
    }

    const token = brandToken(cell(row, COL.jobName));

    const viaLearned = token ? learnedWinner.get(token) : undefined;
    if (viaLearned) {
      jobs.push({ row, sourceRow, companyName: viaLearned, customerSource: 'INFERRED' });
      return;
    }

    // The customer is sometimes named inside the job name rather than as its
    // leading word, e.g. "585mm Plain Roll(Food and Inns)", "Malpani Lime
    // Massage". The index only holds words that identify exactly one customer
    // and skips generic ones like "foods", so "Foods & Inns Blank Pouch"
    // cannot be dragged onto "Sanvi Agro Foods and Flour Mill".
    const viaFullName = findCustomerInJobName(cell(row, COL.jobName), distinctiveIndex);
    if (viaFullName) {
      jobs.push({ row, sourceRow, companyName: viaFullName, customerSource: 'INFERRED' });
      return;
    }

    pending.push({ row, sourceRow, token });
  });

  // ---- Pass 4: provisional customers for recurring brands -------------------
  const tokenCounts = new Map<string, number>();
  for (const item of pending) {
    if (!isPlausibleBrand(item.token)) continue;
    tokenCounts.set(item.token, (tokenCounts.get(item.token) ?? 0) + 1);
  }

  const provisionalByToken = new Map<string, string>();
  for (const [token, count] of tokenCounts) {
    if (count < MIN_JOBS_FOR_PROVISIONAL_CUSTOMER) continue;
    const companyName = brandDisplayName(token);
    if (customers.has(companyName)) {
      provisionalByToken.set(token, companyName);
      continue;
    }
    customers.set(companyName, {
      companyName,
      contactPerson: NA,
      address: NA,
      city: NA,
      district: NA,
      pincode: NA,
      mobile: NA,
      altPhone: NA,
      email: NA,
      sourceRaw: `Provisional customer created from the brand "${token}", which appears on ${count} job names. The sheet never recorded this company's details.`,
      isVerified: false,
      source: 'BRAND_INFERRED',
    });
    provisionalByToken.set(token, companyName);
  }

  // ---- Pass 5: whatever is left is flagged, not guessed at ------------------
  const unresolvedTokens = new Map<string, number>();

  for (const item of pending) {
    const companyName = provisionalByToken.get(item.token);
    if (companyName) {
      jobs.push({
        row: item.row,
        sourceRow: item.sourceRow,
        companyName,
        customerSource: 'INFERRED',
      });
      continue;
    }
    if (item.token) {
      unresolvedTokens.set(item.token, (unresolvedTokens.get(item.token) ?? 0) + 1);
    }
    jobs.push({
      row: item.row,
      sourceRow: item.sourceRow,
      companyName: null,
      customerSource: 'NONE',
    });
  }

  jobs.sort((a, b) => a.sourceRow - b.sourceRow);
  return { customers, jobs, rejects, unresolvedTokens };
}

async function main() {
  try {
    const raw = readFileSync(CSV_PATH, 'utf8');
    const rows: string[][] = parse(raw, { relaxColumnCount: true, skipEmptyLines: false });

    // Row 1 is a numeric index row, row 2 is the header. Data starts at row 3.
    const dataRows = rows.slice(2);
    console.log(`Read ${dataRows.length} data rows from ${CSV_PATH}`);

    const { customers, jobs, rejects, unresolvedTokens } = resolveCustomers(dataRows);

    const customerList = [...customers.values()];
    const fromSheet = customerList.filter((c) => c.source === 'SHEET');
    const provisional = customerList.filter((c) => c.source === 'BRAND_INFERRED');

    const explicitJobs = jobs.filter((j) => j.customerSource === 'EXPLICIT').length;
    const inferredJobs = jobs.filter((j) => j.customerSource === 'INFERRED').length;
    const unassignedJobs = jobs.filter((j) => j.customerSource === 'NONE');

    console.log('\n--- customers ---');
    console.log(`  from the sheet          : ${fromSheet.length}`);
    console.log(`  provisional (from brand): ${provisional.length}`);
    console.log(`  total                   : ${customerList.length}`);

    console.log('\n--- jobs ---');
    console.log(`  customer named in sheet : ${explicitJobs}`);
    console.log(`  customer inferred       : ${inferredJobs}`);
    console.log(`  needs manual assignment : ${unassignedJobs.length}`);
    console.log(`  total                   : ${jobs.length}`);
    console.log(
      `\n  coverage: ${(((explicitJobs + inferredJobs) / jobs.length) * 100).toFixed(1)}% of jobs have a customer`,
    );

    if (DRY_RUN) {
      console.log('\n--- provisional customers created from brand names ---');
      for (const c of provisional) console.log(`  ${c.companyName}`);

      console.log('\n--- jobs still needing a customer ---');
      for (const job of unassignedJobs) {
        console.log(`  row ${job.sourceRow}: ${cell(job.row, COL.jobName) || '(no job name)'}`);
      }

      console.log('\n--- rejected rows ---');
      for (const r of rejects) console.log(`  row ${r.sourceRow}: ${r.reason} -> ${r.value}`);

      console.log('\nDry run — nothing was written.');
      return;
    }

    // ---- Guard against a duplicate import ---------------------------------
    const [existingJobs, existingCustomers] = await Promise.all([
      prisma.job.count(),
      prisma.customer.count(),
    ]);

    if ((existingJobs > 0 || existingCustomers > 0) && !FRESH) {
      console.error(
        `\nRefusing to import: the database already holds ${existingCustomers} customers ` +
          `and ${existingJobs} jobs.\nRe-run with --fresh to replace them.`,
      );
      process.exitCode = 1;
      return;
    }

    if (FRESH) {
      // Jobs reference customers, so they go first.
      await prisma.job.deleteMany();
      await prisma.customer.deleteMany();
      console.log('\nCleared existing customers and jobs (--fresh)');
    }

    const idByCompany = new Map<string, string>();

    // Several hundred inserts comfortably exceed Prisma's 5s default.
    await prisma.$transaction(
      async (tx) => {
        for (const customer of customerList) {
          const created = await tx.customer.create({ data: customer });
          idByCompany.set(customer.companyName, created.id);
        }

        for (const job of jobs) {
          const { row, sourceRow } = job;
          await tx.job.create({
            data: {
              jobCode: text(row, COL.jobCode),
              jobName: text(row, COL.jobName),
              jobType: text(row, COL.jobType),
              customerId: job.companyName ? (idByCompany.get(job.companyName) ?? null) : null,
              customerSource: job.customerSource,
              needsCustomer: job.customerSource === 'NONE',

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
      { timeout: 180_000, maxWait: 20_000 },
    );

    const [customerCount, jobCount, linkedCount, needsCustomerCount] = await Promise.all([
      prisma.customer.count(),
      prisma.job.count(),
      prisma.job.count({ where: { customerId: { not: null } } }),
      prisma.job.count({ where: { needsCustomer: true } }),
    ]);

    console.log(`\nImported ${customerCount} customers and ${jobCount} jobs.`);
    console.log(`  jobs with a customer   : ${linkedCount}`);
    console.log(`  jobs awaiting a customer: ${needsCustomerCount}`);

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          importedAt: new Date().toISOString(),
          source: CSV_PATH,
          totals: {
            customers: customerCount,
            customersFromSheet: fromSheet.length,
            customersProvisional: provisional.length,
            jobs: jobCount,
            jobsWithCustomer: linkedCount,
            jobsExplicitCustomer: explicitJobs,
            jobsInferredCustomer: inferredJobs,
            jobsNeedingCustomer: needsCustomerCount,
          },
          provisionalCustomers: provisional.map((c) => ({
            companyName: c.companyName,
            note: c.sourceRaw,
          })),
          customersNeedingDetails: customerList
            .filter((c) => !c.isVerified)
            .map((c) => ({ companyName: c.companyName, source: c.source, sourceRaw: c.sourceRaw })),
          jobsNeedingCustomer: unassignedJobs.map((j) => ({
            sourceRow: j.sourceRow,
            jobCode: cell(j.row, COL.jobCode),
            jobName: cell(j.row, COL.jobName),
          })),
          unresolvedBrandTokens: Object.fromEntries(unresolvedTokens),
          rejects,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`\nReport written to ${REPORT_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nImport failed:', error);
  process.exit(1);
});
