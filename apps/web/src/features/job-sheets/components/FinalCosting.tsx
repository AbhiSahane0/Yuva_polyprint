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
import { Field, NumberInput, Select } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Answer, Band, DocCard, Shown, TYPED } from '@/components/ui/Document';
import { cn } from '@/lib/utils';

/**
 * **Manufacturing Job Card (Final Costing).**
 *
 * The end of the job. Everything before it on the works' sheet is written at a
 * machine by whoever is standing there; this is read afterwards by the office,
 * and it answers one question — **what did a kilogram of this cost to make.**
 *
 * It is built from the same pieces as the job card, because it is the same
 * family of document and an office that moves between the two all day should
 * not have to change gear. Bands open the blocks, a worked-out figure is a
 * label with a number under it, and the only yellow on the page is a box
 * somebody fills in. The first version of this screen was the spreadsheet
 * redrawn — hard yellow cells, ruled columns, nine-point type — and it read as
 * a photograph of the paper rather than as a screen.
 *
 * What it keeps from their sheet is the part that matters: **the names**,
 * spellings included, and the order the blocks come in. See
 * `JOB_SHEET_COSTING_NAMES` for why `Polysyter` and `Hardner` are not typos to
 * be fixed.
 *
 * Nothing here computes anything. Every figure comes from `costJobSheet`, the
 * same function the server runs, so the screen and the saved sheet cannot
 * disagree.
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
  /** Their Ratio block, read off the stage cards on the entry screen. */
  ratio: { ink: number; chemical: number; totalOutput: number };
}) {
  /*
   * Twenty-one rows, and on a typical job half of them are zero — four colours
   * ran, eight did not. The form keeps them all, because the form is the form;
   * the office checking a total wants the ones that moved.
   */
  const [showEmpty, setShowEmpty] = useState(true);
  const isPouch = draft.pouchingWeightKg > 0;

  return (
    <div className="space-y-3">
      {/* ================= what it came to ================= */}
      <DocCard>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Answer
            label="Cost / Kg."
            value={formatRs(live.costPerKg, 2)}
            note="Effective Price ÷ Final Output Kg."
            size="large"
          />
          <div className="grid grid-cols-2 gap-3 self-center sm:grid-cols-3">
            <Shown
              label="Effective Price"
              value={formatRs(live.effectivePrice)}
              note="Plus every expense"
            />
            <Shown
              label="Basic Cost"
              value={formatRs(live.materialCost)}
              note={`${formatNumber(live.materialKg, 2)} kg of material`}
            />
            <Shown
              label="Basic Value"
              value={formatRs(live.basicValuePerKg, 2)}
              note="A kilogram of input"
            />
          </div>
        </div>

        <Band title="Production" />
        <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Pouching Weight Kg." htmlFor="pouchingWeightKg">
            <NumberInput
              id="pouchingWeightKg"
              className={TYPED}
              aria-label="Pouching weight"
              value={draft.pouchingWeightKg === 0 ? '' : String(draft.pouchingWeightKg)}
              disabled={locked}
              onChange={(event) => onField('pouchingWeightKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field
            label="Final Output Kg."
            htmlFor="finalOutputKg"
            hint="Everything is divided by this."
          >
            <NumberInput
              id="finalOutputKg"
              className={TYPED}
              aria-label="Final output"
              value={draft.finalOutputKg === 0 ? '' : String(draft.finalOutputKg)}
              disabled={locked}
              onChange={(event) => onField('finalOutputKg', Number(event.target.value || 0))}
            />
          </Field>
          {/*
            I43 and I44 on their sheet, and the two most load-bearing figures
            on this screen: Production Time multiplies the electricity, the
            wages and the EMI. Both were on the record and in the costing from
            the first migration with no screen able to set either, so a job
            that ran a day and a half was costed as though it ran none.
          */}
          <Field label="Make Ready Time" htmlFor="makeReadyDays" hint="Days of setting up.">
            <NumberInput
              id="makeReadyDays"
              className={TYPED}
              aria-label="Make ready time, days"
              value={draft.makeReadyDays === 0 ? '' : String(draft.makeReadyDays)}
              disabled={locked}
              onChange={(event) => onField('makeReadyDays', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Production Time" htmlFor="productionDays" hint="Days the job ran.">
            <NumberInput
              id="productionDays"
              className={TYPED}
              aria-label="Production time, days"
              value={draft.productionDays === 0 ? '' : String(draft.productionDays)}
              disabled={locked}
              onChange={(event) => onField('productionDays', Number(event.target.value || 0))}
            />
          </Field>
          <Shown
            label="Material Type"
            value={isPouch ? 'Pouch Form' : 'Roll Form'}
            note={isPouch ? 'Something was pouched' : 'Nothing was pouched'}
          />
          <Shown
            label="Total Output"
            value={`${formatNumber(ratio.totalOutput, 2)} kg`}
            note="Good laminate, less 3%"
          />
        </div>
      </DocCard>

      {/* ================= the items ================= */}
      <DocCard>
        <Band
          title="Manufacturing Job Card (Final Costing)"
          right={
            <button
              type="button"
              onClick={() => setShowEmpty((on) => !on)}
              className="text-ink-500 hover:text-ink-800 cursor-pointer text-xs underline-offset-2 hover:underline"
            >
              {showEmpty ? 'Hide the rows at zero' : `Show all ${draft.lines.length} rows`}
            </button>
          }
        />
        <Items
          draft={draft}
          live={live}
          locked={locked}
          films={films}
          indexOf={indexOf}
          onLine={onLine}
          showEmpty={showEmpty}
        />
      </DocCard>

      {/* ================= what it cost beyond the material ================= */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <DocCard>
          <Band title="Basic Cost and Expenses" />
          <Expenses draft={draft} live={live} locked={locked} onField={onField} isPouch={isPouch} />
        </DocCard>

        <DocCard>
          <Band
            title="Wastage"
            right={
              <span className="inline-flex items-center gap-1.5">
                Allowed
                <NumberInput
                  className={cn(TYPED, 'w-16 px-2 py-1 text-right text-sm')}
                  aria-label="Wastage allowed, per cent"
                  value={
                    draft.expectedWastagePercent === 0 ? '' : String(draft.expectedWastagePercent)
                  }
                  disabled={locked}
                  onChange={(event) =>
                    onField('expectedWastagePercent', Number(event.target.value || 0))
                  }
                />
                %
              </span>
            }
          />
          <Wastage live={live} />

          <Band title="Ratio" />
          <div className="grid grid-cols-2 gap-3">
            <Shown
              label="Ink"
              value={`${formatNumber(ratio.ink, 2)}%`}
              note="Of the film that ran"
            />
            <Shown
              label="Chemical"
              value={`${formatNumber(ratio.chemical, 2)}%`}
              note="Ethyle and Tolluene"
            />
          </div>

          <Band title="Rates this sheet costs at" />
          <Rates draft={draft} locked={locked} onField={onField} />
        </DocCard>
      </div>

      {/* ================= the works, and the meter ================= */}
      <div className="grid gap-3 lg:grid-cols-2">
        <DocCard>
          <Band title="WORKERS SALARY" right={`Salary Expense ${formatRs(live.salaryCost)}`} />
          <Salary draft={draft} live={live} locked={locked} onLabour={onLabour} />
        </DocCard>

        <DocCard>
          <Band
            title="Electricity"
            right={
              <span className="inline-flex items-center gap-1.5">
                Electricity/day cost
                <NumberInput
                  className={cn(TYPED, 'w-24 px-2 py-1 text-right text-sm')}
                  aria-label="Electricity a day"
                  value={draft.electricityPerDay === 0 ? '' : String(draft.electricityPerDay)}
                  disabled={locked}
                  onChange={(event) =>
                    onField('electricityPerDay', Number(event.target.value || 0))
                  }
                />
              </span>
            }
          />
          <Electricity draft={draft} live={live} locked={locked} onStage={onStage} />
        </DocCard>
      </div>
    </div>
  );
}

/* ====================================================================== *
 * Item Name · Quantity in Kg. · Rate in Rs. · Amount in Rs.
 * ====================================================================== */

function sectionTitle(section: JobSheetLine['section']): string {
  return section === 'PRINTING' ? 'JOB CARD (PRINTING)' : 'Lamination Job card (Stage 2)';
}

/**
 * Where a row's quantity came from, in the words of the block that made it.
 *
 * This is the column the office audits, and the arithmetic behind it is not
 * obvious: an ink is its own fresh drum plus two fifths of its own mix, a
 * solvent is itself plus a share of the stage's pooled drum, a film is simply
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

function Items({
  draft,
  live,
  locked,
  films,
  indexOf,
  onLine,
  showEmpty,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  films: { id: string; name: string }[];
  indexOf: (position: number) => number;
  onLine: (position: number, patch: Partial<JobSheetLine>) => void;
  showEmpty: boolean;
}) {
  /* The widest row, so the bars read against each other rather than the page. */
  const biggest = Math.max(...live.lines.map((line) => Math.abs(line.amount)), 1);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[32rem]">
        <thead>
          <tr className="text-ink-500 border-ink-200 border-b text-[11px] font-medium tracking-wide uppercase">
            {/* The name takes the slack; the three money columns keep together
                at the right, where they are read against each other. */}
            <th className="w-full py-2 pr-3 text-left font-medium">Item Name</th>
            <th className="w-44 py-2 pr-3 text-right font-medium whitespace-nowrap">
              Quantity in Kg.
            </th>
            <th className="w-32 py-2 pr-3 text-right font-medium whitespace-nowrap">Rate in Rs.</th>
            <th className="w-40 py-2 text-right font-medium whitespace-nowrap">Amount in Rs.</th>
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

          <tr className="border-ink-300 border-t">
            <td className="text-ink-900 py-2.5 text-sm font-semibold">Total</td>
            <td className="text-ink-900 py-2.5 pr-3 text-right text-sm font-semibold tabular-nums">
              {formatNumber(live.materialKg, 2)}
            </td>
            <td />
            <td className="text-ink-900 py-2 text-right text-sm font-semibold tabular-nums">
              {formatRs(live.materialCost)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
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
  const amount = costed?.amount ?? 0;
  const name = costingNameAt(line.position, line.name);
  /* A film row whose grade the sheet could not work out: it would price at
     nothing and could not come off stock, so it asks rather than guessing. */
  const needsFilm = !line.materialId && line.kind === 'FILM';

  return (
    <>
      {sectionHead ? (
        <tr>
          <td colSpan={4} className="pt-3 pb-1">
            <div className="text-ink-400 text-[11px] font-semibold tracking-wider uppercase">
              {sectionHead}
            </div>
          </td>
        </tr>
      ) : null}

      <tr className="group border-ink-100 border-b align-top">
        <td className="py-2 pr-3">
          <div className={cn('text-sm font-medium', quiet ? 'text-ink-400' : 'text-ink-900')}>
            {name}
          </div>
          {/* Their name is the one the office checks; ours is the one the stock
              came off. Both, where they differ. */}
          {!quiet && name !== line.name ? (
            <div className="text-ink-400 mt-0.5 text-[11px]">{line.name}</div>
          ) : null}
          {!quiet ? (
            <div className="text-ink-400 mt-0.5 text-[11px]">{provenance(line)}</div>
          ) : null}
          {needsFilm ? (
            <Select
              className={cn(TYPED, 'mt-1.5 w-56 px-2 py-1.5 text-sm')}
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
          Worked out from the blocks on the entry screen, and typed over only
          where the drum in front of them said otherwise. Plain text until it
          is corrected, because on their sheet every quantity is a formula and
          only the rate is yellow.
        */}
        <td className="py-2 pr-3 text-right">
          {corrected ? (
            <div className="flex flex-col items-end gap-1">
              <NumberInput
                allowNegative
                disabled={locked}
                className={cn(TYPED, 'w-28 px-2 py-1.5 text-right text-sm')}
                aria-label={`${name}, quantity`}
                value={String(line.consumedOverrideKg)}
                onChange={(event) =>
                  onLine(line.position, {
                    consumedOverrideKg:
                      event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
              <span className="text-warning-700 flex items-center gap-1 text-[11px] tabular-nums">
                was {formatNumber(computed, 3)}
                <IconButton
                  className="size-6"
                  aria-label={`Use the worked-out quantity for ${name}`}
                  onClick={() => onLine(line.position, { consumedOverrideKg: null })}
                  disabled={locked}
                >
                  <RotateCcw className="size-3.5" />
                </IconButton>
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span
                className={cn(
                  'text-sm tabular-nums',
                  quiet ? 'text-ink-300' : 'text-ink-900 font-medium',
                )}
              >
                {quantity === 0 ? '—' : formatNumber(quantity, 3)}
              </span>
              {!locked ? (
                <IconButton
                  className="size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Correct the quantity for ${name}`}
                  onClick={() => onLine(line.position, { consumedOverrideKg: computed })}
                >
                  <Pencil className="size-3.5" />
                </IconButton>
              ) : null}
            </span>
          )}
        </td>

        {/* Yellow on every row of their sheet: the rate is theirs to set. */}
        <td className="py-2 pr-3 text-right">
          <NumberInput
            disabled={locked}
            className={cn(TYPED, 'w-24 px-2 py-1.5 text-right text-sm')}
            aria-label={`${name}, rate`}
            value={line.ratePerKg === 0 ? '' : String(line.ratePerKg)}
            onChange={(event) =>
              onLine(line.position, { ratePerKg: Number(event.target.value || 0) })
            }
          />
        </td>

        <td className="py-2 text-right">
          <div
            className={cn(
              'text-sm tabular-nums',
              quiet ? 'text-ink-300' : 'text-ink-900 font-semibold',
            )}
          >
            {amount === 0 ? '—' : formatRs(amount)}
          </div>
          {/* Where the money went, at a glance: this row against the biggest. */}
          {!quiet ? (
            <div className="bg-ink-100 mt-1.5 ml-auto h-1 w-24 overflow-hidden rounded-full">
              <div
                className="bg-brand-300 h-full rounded-full"
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
 * The expense column
 * ====================================================================== */

function Expenses({
  draft,
  live,
  locked,
  onField,
  isPouch,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  onField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  isPouch: boolean;
}) {
  return (
    <dl>
      <Expense label="Basic Cost" value={live.materialCost} basis="Total of Amount in Rs." />
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
      {/* The one expense their sheet types outright: cartons, tape, stretch film. */}
      <div className="border-ink-100 flex items-center justify-between gap-3 border-b py-2">
        <dt className="text-ink-700 text-sm">Packaging Exp.</dt>
        <dd>
          <NumberInput
            disabled={locked}
            className={cn(TYPED, 'w-32 px-2 py-1.5 text-right text-sm')}
            aria-label="Packaging expense"
            value={draft.packagingCost === 0 ? '' : String(draft.packagingCost)}
            onChange={(event) => onField('packagingCost', Number(event.target.value || 0))}
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
      <div className="mt-3 flex items-baseline justify-between">
        <dt className="text-ink-900 font-semibold">Effective Price</dt>
        <dd className="text-ink-900 text-xl font-bold tabular-nums">
          {formatRs(live.effectivePrice)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * An expense the sheet works out, and the office may overrule.
 *
 * The override is not a convenience. Their own spreadsheets type over their
 * formulas where the office knows something the model does not — a month the
 * meter was read differently, a transport bill that came in at a figure nobody
 * can derive. A system that cannot be corrected gets corrected in a spreadsheet
 * nobody can see, so the correction lives here, beside what it replaced.
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
    <div className="group border-ink-100 flex items-center justify-between gap-3 border-b py-2">
      <dt className="min-w-0">
        <div className="text-ink-700 text-sm">{label}</div>
        <div className={cn('text-[11px]', settled ? 'text-warning-700' : 'text-ink-400')}>
          {settled ? `By hand — was ${formatRs(computed ?? 0)}` : basis}
        </div>
      </dt>
      <dd className="shrink-0">
        {settled && onOverride ? (
          <div className="flex items-center gap-1">
            <NumberInput
              disabled={locked}
              className={cn(TYPED, 'w-32 px-2 py-1.5 text-right text-sm')}
              aria-label={`${label}, settled by hand`}
              value={String(override)}
              onChange={(event) =>
                onOverride(event.target.value === '' ? 0 : Number(event.target.value))
              }
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
          <div className="flex items-center gap-1">
            <span className="text-ink-900 text-sm tabular-nums">{formatRs(value)}</span>
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
 * Wastage
 * ====================================================================== */

/**
 * Two bars on one scale. The works allows itself five per cent, and the only
 * question anybody asks of this block is whether the job stayed inside it —
 * which a pair of numbers makes you work out and a pair of bars does not.
 */
function Wastage({ live }: { live: JobSheetCost }) {
  const over = live.actualWastageKg > live.expectedWastageKg;
  const scale = Math.max(live.actualWastageKg, live.expectedWastageKg, 1);

  return (
    <div className="space-y-3">
      <Bar
        label="Exp. Wastage Kg."
        value={live.expectedWastageKg}
        width={live.expectedWastageKg / scale}
        tone="bg-ink-300"
      />
      <Bar
        label="Act. Wastage Kg."
        value={live.actualWastageKg}
        width={live.actualWastageKg / scale}
        tone={over ? 'bg-danger-500' : 'bg-success-500'}
      />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Shown
          label="Wastage %"
          value={formatNumber(live.wastagePercent, 2)}
          tone={over ? 'bad' : 'default'}
        />
        <Shown
          label="Excess Rs."
          value={formatRs(live.excessCost)}
          note={over ? 'Over the allowance' : 'Inside the allowance'}
          tone={live.excessCost > 0 ? 'bad' : 'good'}
        />
      </div>
    </div>
  );
}

function Bar({
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
      <div className="flex items-baseline justify-between">
        <span className="text-ink-500 text-[11px] font-medium tracking-wide uppercase">
          {label}
        </span>
        <span className="text-ink-900 text-sm font-medium tabular-nums">
          {formatNumber(value, 2)}
        </span>
      </div>
      <div className="bg-ink-100 mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${Math.min(100, Math.max(0, width * 100))}%` }}
        />
      </div>
    </div>
  );
}

/* ====================================================================== *
 * WORKERS SALARY and the meter
 * ====================================================================== */

/** A figure typed into a table cell, at the weight the rest of the app uses. */
function Cell({
  label,
  value,
  disabled,
  onChange,
  width = 'w-16',
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
  width?: string;
}) {
  return (
    <NumberInput
      disabled={disabled}
      className={cn(TYPED, width, 'px-2 py-1.5 text-right text-sm')}
      aria-label={label}
      value={value === 0 ? '' : String(value)}
      onChange={(event) => onChange(Number(event.target.value || 0))}
    />
  );
}

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
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[22rem]">
        <thead>
          <tr className="text-ink-500 border-ink-200 border-b text-[11px] font-medium tracking-wide uppercase">
            <th className="py-2 pr-3 text-left font-medium">Role</th>
            <th className="py-2 pr-2 text-right font-medium">Nos</th>
            <th className="py-2 pr-2 text-right font-medium">Rs. a Day</th>
            <th className="py-2 pr-2 text-right font-medium">Days</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {draft.labour.map((role, index) => (
            <tr key={role.id} className="border-ink-100 border-b last:border-b-0">
              <td className="text-ink-800 py-1.5 pr-3 text-sm">{role.role}</td>
              <td className="py-1.5 pr-2 text-right">
                <Cell
                  label={`${role.role}, number`}
                  value={role.headcount}
                  disabled={locked}
                  onChange={(next) => onLabour(role.id, { headcount: next })}
                />
              </td>
              <td className="py-1.5 pr-2 text-right">
                <Cell
                  label={`${role.role}, a day`}
                  value={role.ratePerDay}
                  disabled={locked}
                  width="w-20"
                  onChange={(next) => onLabour(role.id, { ratePerDay: next })}
                />
              </td>
              <td className="py-1.5 pr-2 text-right">
                <Cell
                  label={`${role.role}, days`}
                  value={role.days}
                  disabled={locked}
                  onChange={(next) => onLabour(role.id, { days: next })}
                />
              </td>
              <td className="text-ink-900 py-1.5 text-right text-sm tabular-nums">
                {formatRs(live.labour[index]?.amount ?? 0)}
              </td>
            </tr>
          ))}
          <tr className="border-ink-300 border-t">
            <td className="text-ink-900 py-2 text-sm font-semibold" colSpan={4}>
              Salary Expense
            </td>
            <td className="text-ink-900 py-2 text-right text-sm font-semibold tabular-nums">
              {formatRs(live.salaryCost)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Electricity({
  draft,
  live,
  locked,
  onStage,
}: {
  draft: Draft;
  live: JobSheetCost;
  locked: boolean;
  onStage: (stage: JobSheetStage, patch: Partial<JobSheetStageUsage>) => void;
}) {
  const total = live.stages.reduce((sum, stage) => sum + stage.amount, 0);

  return (
    <>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[22rem]">
          <thead>
            <tr className="text-ink-500 border-ink-200 border-b text-[11px] font-medium tracking-wide uppercase">
              <th className="py-2 pr-3 text-left font-medium">Stage</th>
              <th className="py-2 pr-2 text-right font-medium">Share %</th>
              <th className="py-2 pr-2 text-right font-medium">Days</th>
              <th className="py-2 pr-2 text-right font-medium">Shifts</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {draft.stages.map((stage, index) => {
              const name = JOB_SHEET_STAGE_LABELS[stage.stage];
              return (
                <tr key={stage.id} className="border-ink-100 border-b last:border-b-0">
                  <td className="text-ink-800 py-1.5 pr-3 text-sm">{name}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <Cell
                      label={`${name}, share per cent`}
                      value={stage.sharePercent}
                      disabled={locked}
                      onChange={(next) => onStage(stage.stage, { sharePercent: next })}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <Cell
                      label={`${name}, days`}
                      value={stage.days}
                      disabled={locked}
                      onChange={(next) => onStage(stage.stage, { days: next })}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <Cell
                      label={`${name}, shifts`}
                      value={stage.shifts}
                      disabled={locked}
                      onChange={(next) => onStage(stage.stage, { shifts: next })}
                    />
                  </td>
                  <td className="text-ink-900 py-1.5 text-right text-sm tabular-nums">
                    {formatRs(live.stages[index]?.amount ?? 0)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-ink-300 border-t">
              <td className="text-ink-900 py-2 text-sm font-semibold" colSpan={4}>
                Total
              </td>
              <td className="text-ink-900 py-2 text-right text-sm font-semibold tabular-nums">
                {formatRs(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-ink-400 mt-2 text-xs">
        A stage that did not run takes zero days and costs nothing.
      </p>
    </>
  );
}

/* ====================================================================== *
 * The rates the sheet costs at
 * ====================================================================== */

/**
 * The handful of rates the expenses are worked out from.
 *
 * At the foot rather than beside the figures they feed, because they change
 * once in a while and the figures change every job. Each names the expense it
 * drives, so nobody has to guess which line will move.
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
    <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
      {rates.map((rate) => (
        <Field key={rate.key} label={rate.label} htmlFor={rate.key} hint={rate.hint}>
          <NumberInput
            id={rate.key}
            className={TYPED}
            aria-label={`${rate.label}, ${rate.hint}`}
            value={draft[rate.key] === 0 ? '' : String(draft[rate.key])}
            disabled={locked}
            onChange={(event) => onField(rate.key, Number(event.target.value || 0))}
          />
        </Field>
      ))}
    </div>
  );
}
