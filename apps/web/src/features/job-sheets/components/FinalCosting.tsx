import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import {
  costingNameAt,
  formatNumber,
  formatRs,
  JOB_SHEET_STAGE_LABELS,
  type JobSheet,
  type JobSheetCost,
  type JobSheetLabour,
  type JobSheetLine,
  type JobSheetStage,
  type JobSheetStageUsage,
} from '@yuva/shared';
import { NumberInput, Select } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils';
import { Band, Head, Typed, YELLOW } from './sheet-form';

/**
 * **Manufacturing Job Card (Final Costing) — the foot of their sheet.**
 *
 * This is the end of the job. Everything above it on the paper was written at a
 * machine by whoever was standing there; this block is read by the office, and
 * it answers one question: **what did a kilogram of this cost to make.** Their
 * spreadsheet puts that figure in a green cell, and so does this.
 *
 * It is laid out for the person checking it rather than the person filling it
 * in, which is a different job from the stage entry beside it:
 *
 * - **The answer is at the top, and stays there.** Cost / Kg., Effective Price
 *   and Basic Cost ride along as the item table scrolls, because the reason to
 *   read the table at all is to see what moved them.
 * - **Every quantity says where it came from.** `Cons. of Details of Roll`,
 *   `Fresh Con. + 40% of Mix` — an accountant three months later should be able
 *   to follow any figure back to the block that produced it without being
 *   taught the form. Not one of the twenty-one quantities is typed.
 * - **Every expense says how it was worked out.** `1,027 kg × Rs 6.80`,
 *   `10% of Basic Cost`. And any of them can be settled by hand when the office
 *   knows better than the model — with the computed figure kept beside it, so a
 *   correction reads as a correction.
 * - **The names are their names**, including the spellings. `Polysyter`,
 *   `Tolluene`, `Hardner`, `METPET`. See `JOB_SHEET_COSTING_NAMES`.
 *
 * Nothing here computes anything. Every figure comes from `costJobSheet`, which
 * is the same function the server runs — so the screen and the saved sheet
 * cannot drift apart.
 */

type Draft = Omit<JobSheet, 'lines' | 'labour' | 'stages'> & {
  lines: JobSheetLine[];
  labour: JobSheet['labour'];
  stages: JobSheet['stages'];
};

export function FinalCosting({
  draft,
  live,
  locked,
  films,
  indexOf,
  onField,
  onLine,
  onLabour,
  onStage,
  ratio,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  films: { id: string; name: string }[];
  /** Where a line's costed twin sits, so the two can be read together. */
  indexOf: (position: number) => number;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onLine: (position: number, patch: Partial<JobSheetLine>) => void;
  onLabour: (id: string, patch: Partial<JobSheetLabour>) => void;
  onStage: (stage: JobSheetStage, patch: Partial<JobSheetStageUsage>) => void;
  /** Their Ratio block, read off the stage cards above. */
  ratio: { ink: number; chemical: number; totalOutput: number };
}) {
  /*
   * Twenty-one rows, and on a typical job eleven of them are zero — four
   * colours ran, eight did not. The form keeps them all, because the form is
   * the form; the office checking a total wants the eleven that moved.
   */
  const [showEmpty, setShowEmpty] = useState(true);

  const isPouch = draft.pouchingWeightKg > 0;
  const biggest = Math.max(...live.lines.map((line) => Math.abs(line.amount)), 1);

  return (
    <div className="space-y-5">
      {/* ---- the answer, and it follows you down the page ---- */}
      <Answer draft={draft} live={live} isPouch={isPouch} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* ---- Item Name / Quantity in Kg. / Rate in Rs. / Amount in Rs. ---- */}
        <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-4">
          <Band
            right={
              <button
                type="button"
                onClick={() => setShowEmpty((on) => !on)}
                className="text-ink-600 hover:text-ink-900 cursor-pointer text-xs font-medium underline-offset-2 hover:underline"
              >
                {showEmpty ? 'Hide the rows at zero' : `Show all ${draft.lines.length} rows`}
              </button>
            }
          >
            Manufacturing Job Card (Final Costing)
          </Band>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-ink-300 border-b">
                  <th className="pb-1 text-left">
                    <Head>Item Name</Head>
                  </th>
                  <th className="pb-1 text-right">
                    <Head className="text-right">Quantity in Kg.</Head>
                  </th>
                  <th className="pb-1 text-right">
                    <Head className="text-right">Rate in Rs.</Head>
                  </th>
                  <th className="pb-1 text-right">
                    <Head className="text-right">Amount in Rs.</Head>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line, index) => {
                  const costed = live.lines[indexOf(line.position)];
                  const quantity = costed?.consumedKg ?? 0;
                  const amount = costed?.amount ?? 0;
                  const quiet = quantity === 0 && amount === 0;
                  if (quiet && !showEmpty) return null;

                  const previous = draft.lines[index - 1];
                  const opensSection = !previous || previous.section !== line.section;

                  return (
                    <ItemRow
                      key={line.id}
                      line={line}
                      costed={costed}
                      quiet={quiet}
                      share={Math.abs(amount) / biggest}
                      sectionHead={opensSection ? sectionTitle(line.section) : null}
                      films={films}
                      locked={locked}
                      onLine={onLine}
                    />
                  );
                })}

                <tr className="border-ink-400 border-t-2">
                  <td className="text-ink-900 py-2 font-semibold">Total</td>
                  <td className="text-ink-900 py-2 text-right font-semibold tabular-nums">
                    {formatNumber(live.materialKg, 2)}
                  </td>
                  <td />
                  <td className="text-ink-900 py-2 text-right font-semibold tabular-nums">
                    {formatRs(live.materialCost)}
                  </td>
                </tr>
                <tr className="border-ink-100 border-t">
                  <td className="text-ink-700 py-2">
                    Basic Value
                    <span className="text-ink-400 ml-1.5 text-xs">
                      Amount ÷ Quantity — what a kilogram of input cost
                    </span>
                  </td>
                  <td />
                  <td />
                  <td className="text-ink-900 py-2 text-right font-semibold tabular-nums">
                    {formatRs(live.basicValuePerKg, 2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Production, the expense column, Wastage and Ratio ---- */}
        <div className="space-y-5">
          <Production draft={draft} isPouch={isPouch} locked={locked} onField={onField} />

          <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
            <Band right="Rs.">Basic Cost and Expenses</Band>
            <dl className="text-sm">
              <Expense
                label="Basic Cost"
                value={live.materialCost}
                basis="Total of Amount in Rs."
              />
              <Expense
                label="Electricity Expense"
                value={live.electricityCost}
                computed={live.stages.reduce((sum, stage) => sum + stage.amount, 0)}
                basis={`${formatRs(draft.electricityPerDay)} a day, shared out by stage`}
                override={draft.electricityOverride}
                onOverride={(next) => onField('electricityOverride', next)}
                locked={locked}
              />
              <Expense
                label="Salary"
                value={live.salaryCost}
                computed={live.labour.reduce((sum, role) => sum + role.amount, 0)}
                basis="Total of WORKERS SALARY"
                override={draft.salaryOverride}
                onOverride={(next) => onField('salaryOverride', next)}
                locked={locked}
              />
              <Expense
                label="Transport Expense"
                value={live.transportCost}
                computed={live.materialKg * draft.transportPerKg}
                basis={`${formatNumber(live.materialKg, 2)} kg × ${formatRs(draft.transportPerKg, 2)}`}
                override={draft.transportOverride}
                onOverride={(next) => onField('transportOverride', next)}
                locked={locked}
              />
              <Expense
                label="Pouching Expense"
                value={live.pouchingCost}
                computed={draft.pouchingWeightKg * draft.pouchingPerKg}
                basis={
                  isPouch
                    ? `${formatNumber(draft.pouchingWeightKg, 2)} kg × ${formatRs(draft.pouchingPerKg, 2)}`
                    : 'Nothing pouched on this job'
                }
                override={draft.pouchingOverride}
                onOverride={(next) => onField('pouchingOverride', next)}
                locked={locked}
              />
              {/* The one expense their sheet types outright: cartons, tape, film. */}
              <div className="border-ink-100 flex items-center justify-between gap-3 border-b py-2">
                <dt className="text-ink-700">Packaging Exp.</dt>
                <dd>
                  <Typed
                    width="w-28"
                    label="Packaging expense"
                    value={draft.packagingCost}
                    disabled={locked}
                    onChange={(next) => onField('packagingCost', Number(next || 0))}
                  />
                </dd>
              </div>
              <Expense
                label="Bank EMI"
                value={live.emiCost}
                computed={draft.emiPerDay * draft.productionDays}
                basis={`${formatNumber(draft.productionDays, 2)} days × ${formatRs(draft.emiPerDay)}`}
                override={draft.emiOverride}
                onOverride={(next) => onField('emiOverride', next)}
                locked={locked}
              />
              <Expense
                label="Profit"
                value={live.profit}
                computed={live.materialCost * (draft.profitPercent / 100)}
                basis={`${formatNumber(draft.profitPercent, 2)}% of Basic Cost`}
                override={draft.profitOverride}
                onOverride={(next) => onField('profitOverride', next)}
                locked={locked}
              />
              <div className="border-ink-400 flex items-baseline justify-between border-t-2 py-2">
                <dt className="text-ink-900 font-semibold">Effective Price</dt>
                <dd className="text-ink-900 text-base font-bold tabular-nums">
                  {formatRs(live.effectivePrice)}
                </dd>
              </div>
            </dl>
          </section>

          <Wastage draft={draft} live={live} locked={locked} onField={onField} />
          <Ratio ratio={ratio} />
        </div>
      </div>

      {/* ---- WORKERS SALARY and the meter ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Salary draft={draft} live={live} locked={locked} onLabour={onLabour} />
        <Electricity
          draft={draft}
          live={live}
          locked={locked}
          onField={onField}
          onStage={onStage}
        />
      </div>

      <Rates draft={draft} locked={locked} onField={onField} />
    </div>
  );
}

/* ====================================================================== *
 * The answer
 * ====================================================================== */

/**
 * Cost / Kg. in their green cell, and the three figures it is made of.
 *
 * Sticky, because this is the number the page exists for and the item table
 * below it is twenty-one rows long. Offset for the mobile header, which is the
 * only thing above it in the shell.
 */
function Answer({ draft, live, isPouch }: { draft: Draft; live: JobSheetCost; isPouch: boolean }) {
  return (
    <section className="border-ink-300 shadow-card z-20 rounded border bg-white lg:sticky lg:top-0">
      <div className="border-ink-100 text-ink-600 flex flex-wrap items-center gap-x-5 gap-y-1 border-b px-4 py-2 text-xs">
        <span>
          <span className="text-ink-500">Sr. No.</span>{' '}
          <span className="text-ink-900 font-semibold tabular-nums">{draft.number}</span>
        </span>
        <span>
          <span className="text-ink-500">Date</span>{' '}
          <span className="text-ink-900 font-semibold">
            {new Date(draft.date).toLocaleDateString('en-GB')}
          </span>
        </span>
        <span className="min-w-0 truncate">
          <span className="text-ink-500">Job Name:</span>{' '}
          <span className="text-ink-900 font-semibold">{draft.jobName || '—'}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {/* Their green cell. The whole sheet is for this one figure. */}
        <div className="col-span-2 rounded-md border border-[#4CAF50] bg-[#E8F5E9] px-4 py-3 lg:col-span-1">
          <div className="text-[11px] font-bold tracking-wide text-[#2E7D32]">Cost / Kg.</div>
          <div className="mt-0.5 text-3xl leading-none font-bold tabular-nums text-[#1B5E20]">
            {formatRs(live.costPerKg, 2)}
          </div>
          <div className="mt-1 text-[11px] text-[#2E7D32]">Effective Price ÷ Final Output Kg.</div>
        </div>

        <Stat
          label="Effective Price"
          value={formatRs(live.effectivePrice)}
          note="Basic Cost + every expense"
        />
        <Stat
          label="Final Output Kg."
          value={formatNumber(draft.finalOutputKg, 2)}
          note={isPouch ? 'Pouch Form' : 'Roll Form'}
        />
        <Stat
          label="Basic Cost"
          value={formatRs(live.materialCost)}
          note={`${formatNumber(live.materialKg, 2)} kg of material`}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-ink-200 rounded-md border px-4 py-3">
      <div className="text-ink-500 text-[11px] font-semibold tracking-wide">{label}</div>
      <div className="text-ink-900 mt-0.5 text-2xl leading-none font-semibold tabular-nums">
        {value}
      </div>
      <div className="text-ink-500 mt-1 text-[11px]">{note}</div>
    </div>
  );
}

/* ====================================================================== *
 * The item table
 * ====================================================================== */

function sectionTitle(section: JobSheetLine['section']): string {
  return section === 'PRINTING' ? 'JOB CARD (PRINTING)' : 'Lamination Job card (Stage 2)';
}

/**
 * Where a row's quantity came from, in the words of the block that produced it.
 *
 * This is the column the office audits, and the arithmetic behind it is not
 * obvious: an ink is its own fresh drum plus two fifths of its own mix, a
 * solvent is itself plus a share of the stage's pooled drum, a film is just
 * issued less returned. Saying so on the row saves the question.
 */
function provenance(line: JobSheetLine): string {
  if (line.kind === 'INK') return 'Fresh Ink Con. + 40% of Mix Ink';
  if (line.kind === 'FILM') {
    return line.section === 'PRINTING' ? 'Cons. of Details of Roll' : 'Cons. of Detail of Row';
  }
  if (line.mixSharePercent > 0) {
    return `Cons. + ${formatNumber(line.mixSharePercent, 0)}% of the Mix`;
  }
  return 'Cons. — issued less balance';
}

function ItemRow({
  line,
  costed,
  quiet,
  share,
  sectionHead,
  films,
  locked,
  onLine,
}: {
  line: JobSheetLine;
  costed: JobSheetCost['lines'][number] | undefined;
  quiet: boolean;
  share: number;
  sectionHead: string | null;
  films: { id: string; name: string }[];
  locked: boolean;
  onLine: (position: number, patch: Partial<JobSheetLine>) => void;
}) {
  const corrected = line.consumedOverrideKg !== null;
  const computed = costed?.computedKg ?? 0;
  const quantity = costed?.consumedKg ?? 0;
  const name = costingNameAt(line.position, line.name);
  /* A film row whose grade the sheet could not work out: priced at nothing and
     unable to come off stock, so it asks rather than guessing. */
  const needsFilm = !line.materialId && line.kind === 'FILM';

  return (
    <>
      {sectionHead ? (
        <tr>
          <td colSpan={4} className="pt-3 pb-1">
            <div className="text-ink-500 border-ink-200 border-b pb-1 text-[11px] font-bold tracking-wide">
              {sectionHead}
            </div>
          </td>
        </tr>
      ) : null}

      <tr className={cn('group border-ink-100 border-b', quiet && 'text-ink-400')}>
        <td className="py-1.5 pr-2 align-top">
          <div className={cn('font-medium', quiet ? 'text-ink-400' : 'text-ink-800')}>{name}</div>
          {/* Their name is the one the office checks; ours is the one the stock
              came off. Both, when they differ. */}
          {!quiet && name !== line.name ? (
            <div className="text-ink-400 text-[11px]">{line.name}</div>
          ) : null}
          {!quiet ? <div className="text-ink-400 text-[11px]">{provenance(line)}</div> : null}
          {needsFilm ? (
            <Select
              className={cn('mt-1 w-52 text-xs', YELLOW)}
              value=""
              disabled={locked}
              aria-label={`Which film is ${line.name}?`}
              onChange={(event) => {
                const picked = films.find((film) => film.id === event.target.value);
                if (picked) onLine(line.position, { materialId: picked.id, name: picked.name });
              }}
            >
              <option value="">— which film? —</option>
              {films.map((film) => (
                <option key={film.id} value={film.id}>
                  {film.name}
                </option>
              ))}
            </Select>
          ) : null}
        </td>

        {/*
          Worked out from the blocks above, and typed over only where the drum
          in front of them says otherwise. White until it is corrected, so the
          column reads as derived — which is what their sheet's own formulas
          make it.
        */}
        <td className="py-1.5 pr-2 align-top">
          {corrected ? (
            <>
              <NumberInput
                allowNegative
                disabled={locked}
                className={cn('w-24 text-right font-semibold', YELLOW)}
                aria-label={`${name}, quantity`}
                value={String(line.consumedOverrideKg)}
                onChange={(event) =>
                  onLine(line.position, {
                    consumedOverrideKg:
                      event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
              <div className="text-warning-700 mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums">
                was {formatNumber(computed, 3)}
                <IconButton
                  className="size-7"
                  aria-label={`Use the worked-out quantity for ${name}`}
                  onClick={() => onLine(line.position, { consumedOverrideKg: null })}
                  disabled={locked}
                >
                  <RotateCcw className="size-3.5" />
                </IconButton>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <span
                className={cn('tabular-nums', quiet ? 'text-ink-300' : 'text-ink-900 font-medium')}
              >
                {quantity === 0 ? '—' : formatNumber(quantity, 3)}
              </span>
              {!locked ? (
                <IconButton
                  className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Correct the quantity for ${name}`}
                  onClick={() => onLine(line.position, { consumedOverrideKg: computed })}
                >
                  <Pencil className="size-3.5" />
                </IconButton>
              ) : null}
            </div>
          )}
        </td>

        {/* Yellow on their sheet, every row of it: the rate is theirs to set. */}
        <td className="py-1.5 pr-2 align-top">
          <Typed
            width="w-20"
            label={`${name}, rate`}
            value={line.ratePerKg}
            disabled={locked}
            onChange={(next) => onLine(line.position, { ratePerKg: Number(next || 0) })}
          />
        </td>

        <td className="py-1.5 text-right align-top">
          <div
            className={cn('tabular-nums', quiet ? 'text-ink-300' : 'text-ink-900 font-semibold')}
          >
            {(costed?.amount ?? 0) === 0 ? '—' : formatRs(costed?.amount ?? 0)}
          </div>
          {/* Where the money went, at a glance: the row against the biggest row. */}
          {!quiet ? (
            <div className="bg-ink-100 mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full">
              <div
                className="bg-brand-400 h-full rounded-full"
                style={{ width: `${Math.min(100, share * 100)}%` }}
              />
            </div>
          ) : null}
        </td>
      </tr>
    </>
  );
}

/* ====================================================================== *
 * Production, and what came out
 * ====================================================================== */

function Production({
  draft,
  isPouch,
  locked,
  onField,
}: {
  draft: Draft;
  isPouch: boolean;
  locked: boolean;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
      <Band>Production</Band>
      <div className="space-y-2">
        <Line label="Pouching Weight Kg.">
          <Typed
            width="w-28"
            label="Pouching weight"
            value={draft.pouchingWeightKg}
            disabled={locked}
            onChange={(next) => onField('pouchingWeightKg', Number(next || 0))}
          />
        </Line>
        <Line label="Final Output Kg." hint="Everything is divided by this.">
          <Typed
            width="w-28"
            label="Final output"
            value={draft.finalOutputKg}
            disabled={locked}
            onChange={(next) => onField('finalOutputKg', Number(next || 0))}
          />
        </Line>
        <Line label="Material Type">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              isPouch ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-700',
            )}
          >
            {isPouch ? 'Pouch Form' : 'Roll Form'}
          </span>
        </Line>
      </div>
    </section>
  );
}

/** A label, a box, and room for a word about why it matters. */
function Line({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-700 text-sm font-medium">
        {label}
        {hint ? <span className="text-ink-400 ml-1.5 text-[11px] font-normal">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

/* ====================================================================== *
 * One expense, with its workings and a way to settle it by hand
 * ====================================================================== */

/**
 * An expense the sheet works out, and the office may overrule.
 *
 * The override is not a convenience. The works' own spreadsheets type over
 * their formulas where the office knows something the model does not — a month
 * the meter was read differently, a transport bill that came in at a figure
 * nobody can derive. A system that cannot be corrected gets corrected in a
 * spreadsheet nobody can see, so the correction lives here, beside what it
 * replaced.
 */
function Expense({
  label,
  value,
  basis,
  computed,
  override,
  onOverride,
  locked,
}: {
  label: string;
  value: number;
  basis: string;
  /** What the sheet works out, shown when a correction replaces it. */
  computed?: number;
  override?: number | null;
  onOverride?: (next: number | null) => void;
  locked?: boolean;
}) {
  const settled = override !== null && override !== undefined;
  const canSettle = Boolean(onOverride) && !locked;

  return (
    <div className="group border-ink-100 flex items-start justify-between gap-3 border-b py-2">
      <dt className="min-w-0">
        <div className="text-ink-700">{label}</div>
        <div className="text-ink-400 text-[11px]">
          {settled ? `By hand — was ${formatRs(computed ?? 0)}` : basis}
        </div>
      </dt>
      <dd className="shrink-0 text-right">
        {settled && onOverride ? (
          <div className="flex items-center gap-1">
            <Typed
              width="w-28"
              label={`${label}, settled by hand`}
              value={override ?? 0}
              disabled={locked}
              onChange={(next) => onOverride(next === '' ? 0 : Number(next))}
            />
            <IconButton
              className="size-7"
              aria-label={`Work ${label} out again`}
              onClick={() => onOverride(null)}
            >
              <RotateCcw className="size-3.5" />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <span className="text-ink-900 tabular-nums">{formatRs(value)}</span>
            {canSettle && onOverride ? (
              <IconButton
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Settle ${label} by hand`}
                onClick={() => onOverride(value)}
              >
                <Pencil className="size-3.5" />
              </IconButton>
            ) : null}
          </div>
        )}
      </dd>
    </div>
  );
}

/* ====================================================================== *
 * Wastage, and the Ratio block
 * ====================================================================== */

function Wastage({
  draft,
  live,
  locked,
  onField,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const over = live.actualWastageKg > live.expectedWastageKg;
  const scale = Math.max(live.actualWastageKg, live.expectedWastageKg, 1);

  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
      <Band
        right={
          <span className="flex items-center gap-1.5">
            Allowed
            <Typed
              width="w-14"
              label="Wastage allowed, per cent"
              value={draft.expectedWastagePercent}
              disabled={locked}
              onChange={(next) => onField('expectedWastagePercent', Number(next || 0))}
            />
            %
          </span>
        }
      >
        Wastage
      </Band>

      <div className="space-y-2">
        {/*
          Two bars on one scale. The works allows itself five per cent and the
          question is only ever whether this job stayed inside it — which a
          pair of numbers makes you work out and a pair of bars does not.
        */}
        <WasteBar
          label="Exp. Wastage Kg."
          value={live.expectedWastageKg}
          width={live.expectedWastageKg / scale}
          tone="bg-ink-400"
        />
        <WasteBar
          label="Act. Wastage Kg."
          value={live.actualWastageKg}
          width={live.actualWastageKg / scale}
          tone={over ? 'bg-danger-500' : 'bg-success-500'}
        />

        <dl className="text-ink-600 border-ink-100 space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between">
            <dt>Wastage %</dt>
            <dd className={cn('tabular-nums', over && 'text-danger-700 font-semibold')}>
              {formatNumber(live.wastagePercent, 2)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Excess Rs.</dt>
            <dd
              className={cn(
                'tabular-nums',
                live.excessCost > 0 ? 'text-danger-700 font-semibold' : 'text-success-700',
              )}
            >
              {formatRs(live.excessCost)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function WasteBar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="text-ink-900 tabular-nums">{formatNumber(value, 2)}</span>
      </div>
      <div className="bg-ink-100 mt-1 h-1.5 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${Math.min(100, Math.max(0, width * 100))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Their Ratio block: the ink and the chemical against the film that went
 * through. The works reads it before it signs — an ink ratio at twice its
 * usual is a job that has gone wrong somewhere, and the figure says so long
 * before the cost per kilogram does.
 */
function Ratio({ ratio }: { ratio: { ink: number; chemical: number; totalOutput: number } }) {
  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
      <Band>Ratio</Band>
      <dl className="text-ink-600 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Ink</dt>
          <dd className="text-ink-900 tabular-nums">{formatNumber(ratio.ink, 2)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt>Chemical</dt>
          <dd className="text-ink-900 tabular-nums">{formatNumber(ratio.chemical, 2)}%</dd>
        </div>
        <div className="border-ink-100 flex justify-between border-t pt-1">
          <dt>Total Output</dt>
          <dd className="text-ink-900 tabular-nums">
            {formatNumber(ratio.totalOutput, 2)} <span className="text-ink-400 text-xs">kg</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ====================================================================== *
 * WORKERS SALARY and the meter
 * ====================================================================== */

function Salary({
  draft,
  live,
  locked,
  onLabour,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  onLabour: (id: string, patch: Partial<JobSheetLabour>) => void;
}) {
  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
      <Band right={`Salary Expense ${formatRs(live.salaryCost)}`}>WORKERS SALARY</Band>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead>
            <tr className="border-ink-300 border-b">
              <th className="pb-1 text-left">
                <Head>Role</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Nos</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Rs. a Day</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Days</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Amount</Head>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.labour.map((role, index) => (
              <tr key={role.id} className="border-ink-100 border-b last:border-b-0">
                <td className="text-ink-800 py-1.5 pr-2">{role.role}</td>
                {(
                  [
                    ['headcount', role.headcount, 'number'],
                    ['ratePerDay', role.ratePerDay, 'a day'],
                    ['days', role.days, 'days'],
                  ] as const
                ).map(([key, value, what]) => (
                  <td key={key} className="py-1 pr-1">
                    <Typed
                      width={key === 'ratePerDay' ? 'w-20' : 'w-16'}
                      label={`${role.role}, ${what}`}
                      value={value}
                      disabled={locked}
                      onChange={(next) => onLabour(role.id, { [key]: Number(next || 0) })}
                    />
                  </td>
                ))}
                <td className="text-ink-900 py-1.5 text-right tabular-nums">
                  {formatRs(live.labour[index]?.amount ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="border-ink-400 border-t-2">
              <td className="text-ink-900 py-2 font-semibold" colSpan={4}>
                Salary Expense
              </td>
              <td className="text-ink-900 py-2 text-right font-semibold tabular-nums">
                {formatRs(live.salaryCost)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Electricity({
  draft,
  live,
  locked,
  onField,
  onStage,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onStage: (stage: JobSheetStage, patch: Partial<JobSheetStageUsage>) => void;
}) {
  const total = live.stages.reduce((sum, stage) => sum + stage.amount, 0);

  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
      <Band
        right={
          <span className="flex items-center gap-1.5">
            Electricity/day cost
            <Typed
              width="w-20"
              label="Electricity a day"
              value={draft.electricityPerDay}
              disabled={locked}
              onChange={(next) => onField('electricityPerDay', Number(next || 0))}
            />
          </span>
        }
      >
        Electricity
      </Band>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead>
            <tr className="border-ink-300 border-b">
              <th className="pb-1 text-left">
                <Head>Stage</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Share %</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Days</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Shifts</Head>
              </th>
              <th className="pb-1 text-right">
                <Head className="text-right">Amount</Head>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.stages.map((stage, index) => (
              <tr key={stage.id} className="border-ink-100 border-b last:border-b-0">
                <td className="text-ink-800 py-1.5 pr-2">{JOB_SHEET_STAGE_LABELS[stage.stage]}</td>
                {(
                  [
                    ['sharePercent', stage.sharePercent, 'share per cent'],
                    ['days', stage.days, 'days'],
                    ['shifts', stage.shifts, 'shifts'],
                  ] as const
                ).map(([key, value, what]) => (
                  <td key={key} className="py-1 pr-1">
                    <Typed
                      width="w-16"
                      label={`${JOB_SHEET_STAGE_LABELS[stage.stage]}, ${what}`}
                      value={value}
                      disabled={locked}
                      onChange={(next) => onStage(stage.stage, { [key]: Number(next || 0) })}
                    />
                  </td>
                ))}
                <td className="text-ink-900 py-1.5 text-right tabular-nums">
                  {formatRs(live.stages[index]?.amount ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="border-ink-400 border-t-2">
              <td className="text-ink-900 py-2 font-semibold" colSpan={4}>
                Total
              </td>
              <td className="text-ink-900 py-2 text-right font-semibold tabular-nums">
                {formatRs(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-ink-500 border-ink-100 mt-1 border-t pt-2 text-xs">
        A stage that did not run takes zero days and costs nothing.
      </p>
    </section>
  );
}

/* ====================================================================== *
 * The rates the sheet costs at
 * ====================================================================== */

/**
 * The handful of rates the expenses are worked out from.
 *
 * They sit at the foot rather than beside the figures they feed because they
 * change once in a while and the figures change every job. Each one names the
 * expense it drives, so nobody has to guess which line will move.
 */
function Rates({
  draft,
  locked,
  onField,
}: {
  draft: Draft;
  locked: boolean;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const rates: {
    label: string;
    hint: string;
    key: 'transportPerKg' | 'pouchingPerKg' | 'emiPerDay' | 'profitPercent';
  }[] = [
    { label: 'Transport Expense', hint: 'Rs. a kg of material brought in', key: 'transportPerKg' },
    { label: 'Pouching Expense', hint: 'Rs. a kg pouched', key: 'pouchingPerKg' },
    { label: 'Bank EMI', hint: 'Rs. a day of production', key: 'emiPerDay' },
    { label: 'Profit', hint: '% of Basic Cost', key: 'profitPercent' },
  ];

  return (
    <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-4">
      <Band>Rates this sheet costs at</Band>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rates.map((rate) => (
          <div key={rate.key} className="border-ink-200 rounded-md border px-3 py-2">
            <div className="text-ink-700 text-xs font-semibold">{rate.label}</div>
            <div className="mt-1">
              <Typed
                width="w-24"
                label={`${rate.label}, ${rate.hint}`}
                value={draft[rate.key]}
                disabled={locked}
                onChange={(next) => onField(rate.key, Number(next || 0))}
              />
            </div>
            <div className="text-ink-400 mt-1 text-[11px]">{rate.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
