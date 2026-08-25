/**
 * Generates database documentation by introspecting the live database.
 *
 *   npm run schema:docs -w @yuva/api
 *
 * Writes two files into docs/:
 *   database-schema.dbml — paste into dbdiagram.io for an interactive diagram
 *   database-schema.md   — Mermaid ER diagram, renders straight on GitHub
 *
 * Generated rather than hand-written on purpose: a diagram maintained by hand
 * is wrong the first time someone adds a column and forgets to update it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(here, '../../../docs');

/** Tables Prisma owns for its own bookkeeping; not part of the model. */
const INTERNAL_TABLES = new Set(['_prisma_migrations']);

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

interface ForeignKey {
  from_table: string;
  from_col: string;
  to_table: string;
  to_col: string;
  delete_rule: string;
}

interface EnumType {
  name: string;
  values: string[];
}

interface IndexRow {
  tablename: string;
  indexname: string;
  indexdef: string;
}

/** Postgres type names to something readable on a diagram. */
function readableType(column: Column): string {
  const { data_type: type, udt_name: udt } = column;

  if (type === 'USER-DEFINED') return udt;
  if (type === 'ARRAY') return `${udt.replace(/^_/, '')}[]`;
  if (type === 'character varying') {
    return column.character_maximum_length
      ? `varchar(${column.character_maximum_length})`
      : 'varchar';
  }
  if (type === 'numeric' && column.numeric_precision) {
    return `decimal(${column.numeric_precision},${column.numeric_scale ?? 0})`;
  }
  if (type === 'timestamp without time zone') return 'timestamp';
  if (type === 'timestamp with time zone') return 'timestamptz';
  if (type === 'double precision') return 'float';
  if (type === 'character') return 'char';
  return type;
}

/**
 * Mermaid only accepts word characters in a type name, so precision is dropped
 * here — `decimal(14,2)` reads as `decimal`. The exact precision is in the full
 * column reference further down the page.
 */
function mermaidType(type: string): string {
  return type.replace(/\(.*$/, '').replace(/[^A-Za-z0-9_]/g, '_');
}

async function main() {
  const [columns, foreignKeys, enums, indexes, counts] = await Promise.all([
    prisma.$queryRaw<Column[]>`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
    prisma.$queryRaw<ForeignKey[]>`
      SELECT tc.table_name AS from_table, kcu.column_name AS from_col,
             ccu.table_name AS to_table, ccu.column_name AS to_col, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
    prisma.$queryRaw<{ name: string; values: string }[]>`
      SELECT t.typname AS name, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      GROUP BY t.typname ORDER BY t.typname`,
    prisma.$queryRaw<IndexRow[]>`
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    prisma.$queryRaw<{ table_name: string; rows: bigint }[]>`
      SELECT relname AS table_name, n_live_tup AS rows
      FROM pg_stat_user_tables WHERE schemaname = 'public'`,
  ]);

  const enumTypes: EnumType[] = enums.map((e) => ({ name: e.name, values: e.values.split(',') }));
  const enumNames = new Set(enumTypes.map((e) => e.name));

  const tables = [...new Set(columns.map((c) => c.table_name))]
    .filter((name) => !INTERNAL_TABLES.has(name))
    .sort();

  const rowCounts = new Map(counts.map((c) => [c.table_name, Number(c.rows)]));
  const fkByColumn = new Map(foreignKeys.map((fk) => [`${fk.from_table}.${fk.from_col}`, fk]));

  const primaryKeys = new Set<string>();
  const uniqueColumns = new Set<string>();
  for (const index of indexes) {
    const match = /\(([^)]+)\)/.exec(index.indexdef);
    if (!match?.[1]) continue;
    const cols = match[1].split(',').map((c) => c.trim().replace(/"/g, ''));
    for (const col of cols) {
      const key = `${index.tablename}.${col}`;
      if (index.indexname.endsWith('_pkey')) primaryKeys.add(key);
      else if (index.indexdef.startsWith('CREATE UNIQUE')) uniqueColumns.add(key);
    }
  }

  mkdirSync(DOCS_DIR, { recursive: true });

  // ---- DBML, for dbdiagram.io -------------------------------------------
  const dbml: string[] = [
    '// Yuva Polyprint ERP — database schema',
    '// Generated from the live database by:',
    '//   npm run schema:docs -w @yuva/api',
    '// Paste the whole file into https://dbdiagram.io/d to explore it.',
    '',
  ];

  for (const enumType of enumTypes) {
    dbml.push(`Enum ${enumType.name} {`);
    for (const value of enumType.values) dbml.push(`  ${value}`);
    dbml.push('}', '');
  }

  for (const table of tables) {
    dbml.push(`Table ${table} {`);
    for (const column of columns.filter((c) => c.table_name === table)) {
      const key = `${table}.${column.column_name}`;
      const attrs: string[] = [];
      if (primaryKeys.has(key)) attrs.push('pk');
      if (uniqueColumns.has(key)) attrs.push('unique');
      if (column.is_nullable === 'NO' && !primaryKeys.has(key)) attrs.push('not null');
      if (column.column_default && !column.column_default.includes('nextval')) {
        // Drop the Postgres cast suffix: `'NA'::text` reads as `'NA'`.
        const value = column.column_default.replace(/::[a-z ]+$/i, '').replace(/`/g, '');
        attrs.push(`default: \`${value}\``);
      }
      const suffix = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
      dbml.push(`  ${column.column_name} ${readableType(column)}${suffix}`);
    }
    const rows = rowCounts.get(table);
    if (rows !== undefined) {
      dbml.push('', `  Note: '${rows} row(s) at time of generation'`);
    }
    dbml.push('}', '');
  }

  for (const fk of foreignKeys) {
    const rule = fk.delete_rule.toLowerCase().replace(/ /g, ' ');
    dbml.push(
      `Ref: ${fk.from_table}.${fk.from_col} > ${fk.to_table}.${fk.to_col} [delete: ${rule}]`,
    );
  }

  writeFileSync(resolve(DOCS_DIR, 'database-schema.dbml'), `${dbml.join('\n')}\n`, 'utf8');

  // ---- Markdown + Mermaid, renders on GitHub -----------------------------
  const md: string[] = [
    '# Database schema',
    '',
    '> Generated from the live database — do not edit by hand.',
    '> Regenerate with `npm run schema:docs -w @yuva/api`.',
    '',
    '## Diagram',
    '',
    'Key columns only — `jobs` alone has 55, and a diagram showing every one is',
    'unreadable. Full details are in the column reference below.',
    '',
    'GitHub renders this automatically. For an interactive version you can drag',
    'around and export as PNG or PDF, paste',
    '[`database-schema.dbml`](./database-schema.dbml) into',
    '[dbdiagram.io](https://dbdiagram.io/d).',
    '',
    '```mermaid',
    'erDiagram',
  ];

  // Only identity, foreign keys and a few meaningful columns — `jobs` alone has
  // 55 columns and a diagram showing all of them is unreadable.
  const HIGHLIGHT = new Set([
    'company_name',
    'mobile',
    'is_verified',
    'source',
    'job_code',
    'job_name',
    'job_type',
    'needs_customer',
    'customer_source',
    'number',
    'date',
    'status',
    'customer_name',
    'grand_with_gst',
    'total_advance',
    'position',
    'quantity_kg',
    'rate_per_kg',
    'total_amount',
    'key',
    'value',
  ]);

  for (const table of tables) {
    md.push(`  ${table} {`);
    for (const column of columns.filter((c) => c.table_name === table)) {
      const key = `${table}.${column.column_name}`;
      const isPk = primaryKeys.has(key);
      const isFk = fkByColumn.has(key);
      if (!isPk && !isFk && !HIGHLIGHT.has(column.column_name)) continue;
      const marker = isPk ? ' PK' : isFk ? ' FK' : '';
      md.push(`    ${mermaidType(readableType(column))} ${column.column_name}${marker}`);
    }
    md.push('  }');
  }

  for (const fk of foreignKeys) {
    // Optional foreign keys are zero-or-one; required ones are exactly one.
    const nullable = columns.find(
      (c) => c.table_name === fk.from_table && c.column_name === fk.from_col,
    )?.is_nullable;
    const cardinality = nullable === 'YES' ? '||--o{' : '||--|{';
    md.push(`  ${fk.to_table} ${cardinality} ${fk.from_table} : "${fk.from_col}"`);
  }

  md.push('```', '');

  md.push('## Tables', '');
  md.push('| Table | Columns | Rows | Purpose |');
  md.push('| --- | ---: | ---: | --- |');
  const PURPOSE: Record<string, string> = {
    customers: 'Companies that order from Yuva Polyprint.',
    jobs: 'Products and their full engineering specification.',
    quotations: 'Customer-facing quotations, with totals frozen at save.',
    quotation_items: 'One priced line on a quotation.',
    app_settings: 'Editable rates: cylinder rate, GST %, advance %.',
  };
  for (const table of tables) {
    const cols = columns.filter((c) => c.table_name === table).length;
    md.push(`| \`${table}\` | ${cols} | ${rowCounts.get(table) ?? 0} | ${PURPOSE[table] ?? ''} |`);
  }
  md.push('');

  md.push('## Relationships', '');
  md.push('| From | To | On delete | Meaning |');
  md.push('| --- | --- | --- | --- |');
  const MEANING: Record<string, string> = {
    'jobs.customer_id':
      'A job belongs to a customer. Deleting the customer keeps the job and flags it for reassignment.',
    'quotations.customer_id':
      'Links a quotation to the customer master; the printed details are snapshot on the quotation itself.',
    'quotation_items.quotation_id': 'Lines belong to their quotation and are removed with it.',
    'quotation_items.job_id': 'Set when a line was prefilled from a saved job spec.',
  };
  for (const fk of foreignKeys) {
    const key = `${fk.from_table}.${fk.from_col}`;
    md.push(
      `| \`${key}\` | \`${fk.to_table}.${fk.to_col}\` | ${fk.delete_rule} | ${MEANING[key] ?? ''} |`,
    );
  }
  md.push('');

  if (enumTypes.length > 0) {
    md.push('## Enums', '');
    md.push('| Type | Values |');
    md.push('| --- | --- |');
    for (const enumType of enumTypes) {
      md.push(`| \`${enumType.name}\` | ${enumType.values.map((v) => `\`${v}\``).join(', ')} |`);
    }
    md.push('');
  }

  md.push('## Full column reference', '');
  for (const table of tables) {
    md.push(`### \`${table}\``, '');
    md.push('| Column | Type | Null | Key |');
    md.push('| --- | --- | :-: | --- |');
    for (const column of columns.filter((c) => c.table_name === table)) {
      const key = `${table}.${column.column_name}`;
      const fk = fkByColumn.get(key);
      const keyNote = primaryKeys.has(key)
        ? 'PK'
        : fk
          ? `FK → \`${fk.to_table}.${fk.to_col}\``
          : uniqueColumns.has(key)
            ? 'unique'
            : '';
      const type = readableType(column);
      const typeNote = enumNames.has(type) ? `\`${type}\` (enum)` : `\`${type}\``;
      md.push(
        `| \`${column.column_name}\` | ${typeNote} | ${column.is_nullable === 'YES' ? '✓' : ''} | ${keyNote} |`,
      );
    }
    md.push('');
  }

  writeFileSync(resolve(DOCS_DIR, 'database-schema.md'), `${md.join('\n')}\n`, 'utf8');

  console.log(`Wrote docs/database-schema.dbml and docs/database-schema.md`);
  console.log(
    `  ${tables.length} tables, ${foreignKeys.length} relationships, ${enumTypes.length} enums`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
