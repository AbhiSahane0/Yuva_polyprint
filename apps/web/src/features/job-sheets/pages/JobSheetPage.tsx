import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageMinus, Save } from 'lucide-react';
import {
  costJobSheet,
  formatNumber,
  formatRs,
  JOB_SHEET_STAGE_LABELS,
  JOB_SHEET_STATUS_LABELS,
  mixDrumFor,
  type JobSheet,
  type JobSheetCost,
  type JobSheetLine,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useProductionOrders } from '@/features/production/api/production-api';
import {
  useCostJobSheet,
  useJobSheet,
  usePostJobSheetToStock,
  useUpdateJobSheet,
} from '../api/job-sheet-api';

/**
 * **One job sheet, laid out the way the paper one is.**
 *
 * The person filling this in is standing at a machine with a drum in front of
 * them, reading down a printed form they have used for years. So the twenty-one
 * rows are always there in the works' own order, the columns are the ones on
 * the paper — issued, returned, consumed — and a row they do not use stays at
 * zero rather than being hidden. A form whose shape changes with the job is a
 * form somebody has to read before they can fill it in.
 *
 * Two columns are the app earning its keep. **Consumed** is computed as they
 * type, so nobody does issued-minus-returned-plus-two-fifths-of-the-drum in
 * their head. And it can be **typed over** — the works' own spreadsheet does
 * exactly that on two of its fourteen tabs, and the figure it replaced stays
 * beside it so the correction is visible instead of lost.
 *
 * **Every figure on the page is live.** The whole sheet is re-costed in the
 * browser on each keystroke, through the very same `costJobSheet` the server
 * uses — one implementation, so the preview and the saved figure cannot
 * disagree. Without it the money sat still while the weights moved, and a
 * corrected line showed 30 kg at Rs 240 beside an amount of Rs 8,890 left over
 * from the last save. A screen whose job is "type it in and see what it cost"
 * has to answer while you are typing.
 */

/** Everything on the sheet that the office can change. */
type Draft = Omit<JobSheet, 'lines' | 'labour' | 'stages'> & {
  lines: JobSheetLine[];
  labour: JobSheet['labour'];
  stages: JobSheet['stages'];
};

const cell = 'w-full rounded-md border border-ink-200 px-2 py-1 text-right text-sm tabular-nums';

/*
 * The consumed box shows the computed figure as its placeholder, because typing
 * over it is what an override IS. But a placeholder at the browser's default
 * grey reads as an empty box, and this is the column the office checks — so it
 * is darkened to near body text. Still lighter than a typed figure, which is
 * the distinction that matters.
 */
const consumedCell = `${cell} placeholder:text-ink-600`;

/** A weight box. Signed, because a drum genuinely can come back fuller. */
function Weight({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <NumberInput
      allowNegative
      disabled={disabled}
      value={value === 0 ? '' : String(value)}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      placeholder="0"
      className={cell}
    />
  );
}

export default function JobSheetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useJobSheet(id);

  const save = useUpdateJobSheet(id ?? '');

  /*
   * Every card, filtered here rather than by the server: the works runs a few
   * dozen at a time, and a query parameter for "unsheeted" would be a second
   * way of asking a question the list already answers.
   */
  const { data: cards } = useProductionOrders({ pageSize: 200 });
  const cost = useCostJobSheet(id ?? '');
  const post = usePostJobSheetToStock(id ?? '');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [posting, setPosting] = useState(false);

  /*
   * The server's copy replaces the draft whenever it changes — which is after
   * every save, because saving re-costs the sheet and returns the figures. A
   * draft that survived that would show the office the numbers they typed
   * beside a cost per kilogram worked out from different ones.
   */
  useEffect(() => {
    if (data) setDraft(data as Draft);
  }, [data]);

  const locked = Boolean(draft?.stockPostedAt);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const setLine = (position: number, patch: Partial<JobSheetLine>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.position === position ? { ...line, ...patch } : line,
            ),
          }
        : current,
    );

  /**
   * The sheet as it stands, costed here and now.
   *
   * The same function the server runs, so there is one costing and not two that
   * have to be kept in step.
   */
  const live: JobSheetCost | null = useMemo(() => {
    if (!draft) return null;
    return costJobSheet({
      lines: draft.lines.map((line) => {
        const drum = mixDrumFor(line, draft);
        return {
          name: line.name,
          issuedKg: line.issuedKg,
          returnedKg: line.returnedKg,
          mixIssuedKg: line.mixSharePercent > 0 ? drum.issued : 0,
          mixReturnedKg: line.mixSharePercent > 0 ? drum.returned : 0,
          mixSharePercent: line.mixSharePercent,
          consumedOverrideKg: line.consumedOverrideKg,
          ratePerKg: line.ratePerKg,
        };
      }),
      electricityPerDay: draft.electricityPerDay,
      stages: draft.stages,
      labour: draft.labour,
      transportPerKg: draft.transportPerKg,
      pouchingPerKg: draft.pouchingPerKg,
      pouchingWeightKg: draft.pouchingWeightKg,
      packagingCost: draft.packagingCost,
      emiPerDay: draft.emiPerDay,
      emiDays: draft.productionDays,
      profitPercent: draft.profitPercent,
      overrides: {
        electricity: draft.electricityOverride,
        salary: draft.salaryOverride,
        transport: draft.transportOverride,
        pouching: draft.pouchingOverride,
        emi: draft.emiOverride,
        profit: draft.profitOverride,
      },
      producedKg: draft.producedGrossKg - draft.producedCoreKg,
      finalOutputKg: draft.finalOutputKg,
      expectedWastagePercent: draft.expectedWastagePercent,
    });
  }, [draft]);

  /** A line's index in the sheet, so its costed twin can be found. */
  const indexOf = (position: number) =>
    draft?.lines.findIndex((line) => line.position === position) ?? -1;

  const printing = useMemo(
    () => draft?.lines.filter((line) => line.section === 'PRINTING') ?? [],
    [draft],
  );
  const lamination = useMemo(
    () => draft?.lines.filter((line) => line.section === 'LAMINATION') ?? [],
    [draft],
  );

  /* Cards nothing else costs, plus whichever this sheet already names — which
     would otherwise vanish from its own dropdown. */
  const linkableCards = (cards?.items ?? []).filter(
    (card) => !card.jobSheetId || card.jobSheetId === id,
  );

  async function onSave() {
    if (!draft) return;
    try {
      await save.mutateAsync({
        date: draft.date,
        productionOrderId: draft.productionOrderId,
        jobName: draft.jobName,
        operatorName: draft.operatorName,
        filmType: draft.filmType,
        webWidthMm: draft.webWidthMm,
        micron: draft.micron,
        circumferenceMm: draft.circumferenceMm,
        cylinderCount: draft.cylinderCount,
        printMixIssuedKg: draft.printMixIssuedKg,
        printMixReturnedKg: draft.printMixReturnedKg,
        lamMixIssuedKg: draft.lamMixIssuedKg,
        lamMixReturnedKg: draft.lamMixReturnedKg,
        makeReadyDays: draft.makeReadyDays,
        productionDays: draft.productionDays,
        printedGrossKg: draft.printedGrossKg,
        printedCoreKg: draft.printedCoreKg,
        producedGrossKg: draft.producedGrossKg,
        producedCoreKg: draft.producedCoreKg,
        finalOutputKg: draft.finalOutputKg,
        pouchingWeightKg: draft.pouchingWeightKg,
        electricityPerDay: draft.electricityPerDay,
        transportPerKg: draft.transportPerKg,
        pouchingPerKg: draft.pouchingPerKg,
        packagingCost: draft.packagingCost,
        emiPerDay: draft.emiPerDay,
        profitPercent: draft.profitPercent,
        expectedWastagePercent: draft.expectedWastagePercent,
        notes: draft.notes,
        lines: draft.lines.map((line) => ({
          position: line.position,
          section: line.section,
          kind: line.kind,
          materialId: line.materialId,
          name: line.name,
          issuedKg: line.issuedKg,
          returnedKg: line.returnedKg,
          mixIssuedKg: line.mixIssuedKg,
          mixReturnedKg: line.mixReturnedKg,
          mixSharePercent: line.mixSharePercent,
          consumedOverrideKg: line.consumedOverrideKg,
          ratePerKg: line.ratePerKg,
        })),
        labour: draft.labour.map((role) => ({
          position: role.position,
          role: role.role,
          headcount: role.headcount,
          ratePerDay: role.ratePerDay,
          days: role.days,
        })),
        stages: draft.stages.map((stage) => ({
          stage: stage.stage,
          sharePercent: stage.sharePercent,
          days: stage.days,
          shifts: stage.shifts,
        })),
      });
      toast.success('Job sheet saved');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the sheet');
    }
  }

  async function onCost() {
    try {
      await cost.mutateAsync();
      toast.success('Costed');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not cost the sheet');
    }
  }

  async function onPost() {
    try {
      const result = await post.mutateAsync();
      setPosting(false);
      toast.success(
        result.skipped.length === 0
          ? `${result.posted} materials taken off stock`
          : `${result.posted} taken off stock. No catalogue material on: ${result.skipped.join(', ')}`,
      );
    } catch (error) {
      setPosting(false);
      toast.error(error instanceof ApiClientError ? error.message : 'Could not post to stock');
    }
  }

  if (isLoading || !draft || !live) return <LoadingState />;

  const lineRows = (lines: JobSheetLine[]) =>
    lines.map((line) => {
      const corrected = line.consumedOverrideKg !== null;
      const costed = live.lines[indexOf(line.position)];
      return (
        <tr key={line.id} className="border-ink-100 border-b last:border-b-0">
          <td className="text-ink-800 px-2 py-1.5 whitespace-nowrap">
            {line.name}
            {line.mixSharePercent > 0 ? (
              <span className="text-ink-400 ml-1.5 text-xs">
                {formatNumber(line.mixSharePercent, 0)}% of mix
              </span>
            ) : null}
            {!line.materialId ? (
              <span className="text-warning-700 ml-1.5 text-xs">no catalogue rate</span>
            ) : null}
          </td>
          <td className="px-1 py-1">
            <Weight
              value={line.issuedKg}
              disabled={locked}
              onChange={(next) => setLine(line.position, { issuedKg: next })}
            />
          </td>
          <td className="px-1 py-1">
            <Weight
              value={line.returnedKg}
              disabled={locked}
              onChange={(next) => setLine(line.position, { returnedKg: next })}
            />
          </td>
          {/* Its own drum, for an ink. The solvents draw from the pooled one above. */}
          <td className="px-1 py-1">
            {line.kind === 'INK' ? (
              <Weight
                value={line.mixIssuedKg}
                disabled={locked}
                onChange={(next) => setLine(line.position, { mixIssuedKg: next })}
              />
            ) : (
              <span className="text-ink-300 block text-center">—</span>
            )}
          </td>
          <td className="px-1 py-1">
            {line.kind === 'INK' ? (
              <Weight
                value={line.mixReturnedKg}
                disabled={locked}
                onChange={(next) => setLine(line.position, { mixReturnedKg: next })}
              />
            ) : (
              <span className="text-ink-300 block text-center">—</span>
            )}
          </td>
          <td className="px-1 py-1">
            <NumberInput
              disabled={locked}
              value={line.ratePerKg === 0 ? '' : String(line.ratePerKg)}
              onChange={(event) =>
                setLine(line.position, { ratePerKg: Number(event.target.value || 0) })
              }
              placeholder="0"
              className={cell}
            />
          </td>
          {/*
            Computed as they type, and typed over where the drum says otherwise.
            The computed figure stays beside it, so a correction is visible on
            the page rather than lost behind the number that replaced it.
          */}
          <td className="px-1 py-1">
            <NumberInput
              allowNegative
              disabled={locked}
              value={corrected ? String(line.consumedOverrideKg) : ''}
              onChange={(event) =>
                setLine(line.position, {
                  consumedOverrideKg: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              placeholder={formatNumber(costed?.computedKg ?? 0, 3)}
              className={
                corrected ? `${cell} border-warning-400 bg-warning-50 font-semibold` : consumedCell
              }
            />
            {corrected ? (
              <div className="text-warning-700 mt-0.5 text-right text-[11px] tabular-nums">
                was {formatNumber(costed?.computedKg ?? 0, 3)}
              </div>
            ) : null}
          </td>
          <td className="text-ink-900 px-2 py-1.5 text-right font-medium tabular-nums">
            {formatRs(costed?.amount ?? 0)}
          </td>
        </tr>
      );
    });

  const head = (
    <thead>
      <tr className="border-ink-200 text-ink-500 border-b text-xs tracking-wide uppercase">
        <th className="px-2 py-2 text-left font-semibold">Item</th>
        <th className="px-1 py-2 text-right font-semibold">Issued</th>
        <th className="px-1 py-2 text-right font-semibold">Returned</th>
        <th className="px-1 py-2 text-right font-semibold">Mix out</th>
        <th className="px-1 py-2 text-right font-semibold">Mix back</th>
        <th className="px-1 py-2 text-right font-semibold">Rate</th>
        <th className="px-1 py-2 text-right font-semibold">Consumed</th>
        <th className="px-2 py-2 text-right font-semibold">Amount</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/job-sheets')}
            aria-label="Back to job sheets"
            className="text-ink-500 hover:text-ink-900 mt-1"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-ink-900 text-xl font-semibold">Job sheet {draft.number}</h1>
              <Badge tone={draft.status === 'CLOSED' ? 'success' : 'neutral'}>
                {JOB_SHEET_STATUS_LABELS[draft.status]}
              </Badge>
            </div>
            <p className="text-ink-500 mt-0.5 text-sm">
              {draft.jobName || 'Untitled job'}
              {draft.customerName ? ` · ${draft.customerName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onSave} disabled={locked || save.isPending}>
            <Save className="size-4" />
            Save
          </Button>
          <Button onClick={onCost} disabled={locked || cost.isPending}>
            <Check className="size-4" />
            Cost this sheet
          </Button>
          {draft.status !== 'OPEN' && !locked ? (
            <Button variant="secondary" onClick={() => setPosting(true)}>
              <PackageMinus className="size-4" />
              Take off stock
            </Button>
          ) : null}
        </div>
      </header>

      {locked ? (
        <p className="border-success-200 bg-success-50 text-success-800 rounded-md border px-3 py-2 text-sm">
          This sheet was taken off stock on{' '}
          {new Date(draft.stockPostedAt as string).toLocaleDateString()}. It is a record now and
          cannot be changed — correct it with a stock adjustment instead.
        </p>
      ) : null}

      {/* ---- The header of the paper sheet ---- */}
      <section className="border-ink-200 rounded-lg border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date" htmlFor="date">
            <Input
              id="date"
              type="date"
              value={draft.date}
              disabled={locked}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
          {/*
           * Which run this sheet is the costing of.
           *
           * Worth setting rather than skipping: **posting the sheet releases
           * that card's claim on its film**. Without the link the claim stands
           * until somebody completes the card, and until then free stock reads
           * low by this whole run.
           *
           * Only cards nothing else costs are offered — one run, one costing.
           */}
          <Field
            label="Job card"
            htmlFor="productionOrderId"
            hint="Taking this sheet off stock frees the card's claim on its film"
          >
            <Select
              id="productionOrderId"
              value={draft.productionOrderId ?? ''}
              disabled={locked}
              onChange={(event) => set('productionOrderId', event.target.value || null)}
            >
              <option value="">Not against a job card</option>
              {linkableCards.map((card) => (
                <option key={card.id} value={card.id}>
                  #{card.number} — {card.customerName} · {card.jobName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job name" htmlFor="jobName">
            <Input
              id="jobName"
              value={draft.jobName}
              disabled={locked}
              onChange={(event) => set('jobName', event.target.value)}
            />
          </Field>
          <Field label="Operator" htmlFor="operator">
            <Input
              id="operator"
              value={draft.operatorName}
              disabled={locked}
              onChange={(event) => set('operatorName', event.target.value)}
            />
          </Field>
          <Field label="Material" htmlFor="filmType">
            <Input
              id="filmType"
              placeholder="Polyester / HSPP"
              value={draft.filmType}
              disabled={locked}
              onChange={(event) => set('filmType', event.target.value)}
            />
          </Field>
          <Field label="Width (mm)" htmlFor="width">
            <NumberInput
              id="width"
              value={draft.webWidthMm ?? ''}
              disabled={locked}
              onChange={(event) => set('webWidthMm', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Thickness (micron)" htmlFor="micron">
            <NumberInput
              id="micron"
              value={draft.micron ?? ''}
              disabled={locked}
              onChange={(event) => set('micron', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Circumference (mm)" htmlFor="circ">
            <NumberInput
              id="circ"
              value={draft.circumferenceMm ?? ''}
              disabled={locked}
              onChange={(event) => set('circumferenceMm', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Cylinders" htmlFor="cyl">
            <NumberInput
              id="cyl"
              value={draft.cylinderCount || ''}
              disabled={locked}
              onChange={(event) => set('cylinderCount', Number(event.target.value || 0))}
            />
          </Field>
        </div>
      </section>

      {/* ---- Printing ---- */}
      <section className="border-ink-200 overflow-hidden rounded-lg border bg-white">
        <div className="border-ink-200 flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-ink-900 font-semibold">Printing</h2>
          {/*
            The pooled drum. Each colour has its own mix on its own row; the
            solvents are booked back out of the total of all of them, which is
            what these two boxes hold.
          */}
          <div className="flex items-end gap-3">
            <Field label="Mix ink out (kg)" htmlFor="pmi">
              <NumberInput
                id="pmi"
                allowNegative
                className="w-28 text-right"
                value={draft.printMixIssuedKg || ''}
                disabled={locked}
                onChange={(event) => set('printMixIssuedKg', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Mix ink back (kg)" htmlFor="pmr">
              <NumberInput
                id="pmr"
                allowNegative
                className="w-28 text-right"
                value={draft.printMixReturnedKg || ''}
                disabled={locked}
                onChange={(event) => set('printMixReturnedKg', Number(event.target.value || 0))}
              />
            </Field>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            {head}
            <tbody>{lineRows(printing)}</tbody>
          </table>
        </div>
      </section>

      {/* ---- Lamination ---- */}
      <section className="border-ink-200 overflow-hidden rounded-lg border bg-white">
        <div className="border-ink-200 flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-ink-900 font-semibold">Lamination</h2>
          <div className="flex items-end gap-3">
            <Field label="Mix out (kg)" htmlFor="lmi">
              <NumberInput
                id="lmi"
                allowNegative
                className="w-28 text-right"
                value={draft.lamMixIssuedKg || ''}
                disabled={locked}
                onChange={(event) => set('lamMixIssuedKg', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Mix back (kg)" htmlFor="lmr">
              <NumberInput
                id="lmr"
                allowNegative
                className="w-28 text-right"
                value={draft.lamMixReturnedKg || ''}
                disabled={locked}
                onChange={(event) => set('lamMixReturnedKg', Number(event.target.value || 0))}
              />
            </Field>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            {head}
            <tbody>{lineRows(lamination)}</tbody>
          </table>
        </div>
      </section>

      {/* ---- Output and time ---- */}
      <section className="border-ink-200 rounded-lg border bg-white p-4">
        <h2 className="text-ink-900 mb-3 font-semibold">Output and time</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Printed rolls gross (kg)" htmlFor="pg">
            <NumberInput
              id="pg"
              value={draft.printedGrossKg || ''}
              disabled={locked}
              onChange={(event) => set('printedGrossKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Printed cores (kg)" htmlFor="pc">
            <NumberInput
              id="pc"
              value={draft.printedCoreKg || ''}
              disabled={locked}
              onChange={(event) => set('printedCoreKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Laminated gross (kg)" htmlFor="lg">
            <NumberInput
              id="lg"
              value={draft.producedGrossKg || ''}
              disabled={locked}
              onChange={(event) => set('producedGrossKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Laminated cores (kg)" htmlFor="lc">
            <NumberInput
              id="lc"
              value={draft.producedCoreKg || ''}
              disabled={locked}
              onChange={(event) => set('producedCoreKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field
            label="Final output (kg)"
            htmlFor="fo"
            hint="What was packed. The cost is divided by this."
          >
            <NumberInput
              id="fo"
              value={draft.finalOutputKg || ''}
              disabled={locked}
              onChange={(event) => set('finalOutputKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Pouched (kg)" htmlFor="pw" hint="Zero on a roll job.">
            <NumberInput
              id="pw"
              value={draft.pouchingWeightKg || ''}
              disabled={locked}
              onChange={(event) => set('pouchingWeightKg', Number(event.target.value || 0))}
            />
          </Field>
          <Field label="Make-ready (days)" htmlFor="mr">
            <NumberInput
              id="mr"
              value={draft.makeReadyDays || ''}
              disabled={locked}
              onChange={(event) => set('makeReadyDays', Number(event.target.value || 0))}
            />
          </Field>
          <Field
            label="Production (days)"
            htmlFor="pd"
            hint="What the wages and the EMI are charged against."
          >
            <NumberInput
              id="pd"
              value={draft.productionDays || ''}
              disabled={locked}
              onChange={(event) => set('productionDays', Number(event.target.value || 0))}
            />
          </Field>
        </div>
      </section>

      {/* ---- Crew and power ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border-ink-200 overflow-hidden rounded-lg border bg-white">
          <h2 className="text-ink-900 border-ink-200 border-b px-4 py-3 font-semibold">Crew</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink-200 text-ink-500 border-b text-xs tracking-wide uppercase">
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-1 py-2 text-right font-semibold">Nos</th>
                <th className="px-1 py-2 text-right font-semibold">A day</th>
                <th className="px-1 py-2 text-right font-semibold">Days</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {draft.labour.map((role) => (
                <tr key={role.id} className="border-ink-100 border-b last:border-b-0">
                  <td className="text-ink-800 px-3 py-1.5">{role.role}</td>
                  {(
                    [
                      ['headcount', role.headcount],
                      ['ratePerDay', role.ratePerDay],
                      ['days', role.days],
                    ] as const
                  ).map(([key, value]) => (
                    <td key={key} className="px-1 py-1">
                      <NumberInput
                        disabled={locked}
                        value={value === 0 ? '' : String(value)}
                        placeholder="0"
                        className={cell}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  labour: current.labour.map((item) =>
                                    item.id === role.id
                                      ? { ...item, [key]: Number(event.target.value || 0) }
                                      : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="text-ink-900 px-3 py-1.5 text-right tabular-nums">
                    {formatRs(live.labour[draft.labour.indexOf(role)]?.amount ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="border-ink-200 overflow-hidden rounded-lg border bg-white">
          <div className="border-ink-200 flex items-end justify-between gap-3 border-b px-4 py-3">
            <h2 className="text-ink-900 font-semibold">Electricity</h2>
            <Field label="A day (Rs)" htmlFor="epd">
              <NumberInput
                id="epd"
                className="w-28 text-right"
                value={draft.electricityPerDay || ''}
                disabled={locked}
                onChange={(event) => set('electricityPerDay', Number(event.target.value || 0))}
              />
            </Field>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink-200 text-ink-500 border-b text-xs tracking-wide uppercase">
                <th className="px-3 py-2 text-left font-semibold">Stage</th>
                <th className="px-1 py-2 text-right font-semibold">Share %</th>
                <th className="px-1 py-2 text-right font-semibold">Days</th>
                <th className="px-1 py-2 text-right font-semibold">Shifts</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {draft.stages.map((stage) => (
                <tr key={stage.id} className="border-ink-100 border-b last:border-b-0">
                  <td className="text-ink-800 px-3 py-1.5">
                    {JOB_SHEET_STAGE_LABELS[stage.stage]}
                  </td>
                  {(
                    [
                      ['sharePercent', stage.sharePercent],
                      ['days', stage.days],
                      ['shifts', stage.shifts],
                    ] as const
                  ).map(([key, value]) => (
                    <td key={key} className="px-1 py-1">
                      <NumberInput
                        disabled={locked}
                        value={value === 0 ? '' : String(value)}
                        placeholder="0"
                        className={cell}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  stages: current.stages.map((item) =>
                                    item.id === stage.id
                                      ? { ...item, [key]: Number(event.target.value || 0) }
                                      : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="text-ink-900 px-3 py-1.5 text-right tabular-nums">
                    {formatRs(live.stages[draft.stages.indexOf(stage)]?.amount ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* A stage that did not run is zero days and costs nothing. */}
          <p className="text-ink-500 border-ink-100 border-t px-4 py-2 text-xs">
            A stage that did not run takes zero days and costs nothing.
          </p>
        </section>
      </div>

      {/* ---- What it came to ---- */}
      <section className="border-ink-200 grid gap-5 rounded-lg border bg-white p-4 lg:grid-cols-2">
        <div>
          <h2 className="text-ink-900 mb-3 font-semibold">Overheads</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Transport (Rs a kg)" htmlFor="tpk" hint="Charged on material brought in.">
              <NumberInput
                id="tpk"
                value={draft.transportPerKg || ''}
                disabled={locked}
                onChange={(event) => set('transportPerKg', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Pouching (Rs a kg)" htmlFor="ppk">
              <NumberInput
                id="ppk"
                value={draft.pouchingPerKg || ''}
                disabled={locked}
                onChange={(event) => set('pouchingPerKg', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Packaging (Rs)" htmlFor="pkg">
              <NumberInput
                id="pkg"
                value={draft.packagingCost || ''}
                disabled={locked}
                onChange={(event) => set('packagingCost', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Bank EMI (Rs a day)" htmlFor="emi">
              <NumberInput
                id="emi"
                value={draft.emiPerDay || ''}
                disabled={locked}
                onChange={(event) => set('emiPerDay', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Profit %" htmlFor="pp" hint="Taken on the material.">
              <NumberInput
                id="pp"
                value={draft.profitPercent || ''}
                disabled={locked}
                onChange={(event) => set('profitPercent', Number(event.target.value || 0))}
              />
            </Field>
            <Field label="Wastage allowed %" htmlFor="ew">
              <NumberInput
                id="ew"
                value={draft.expectedWastagePercent || ''}
                disabled={locked}
                onChange={(event) => set('expectedWastagePercent', Number(event.target.value || 0))}
              />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="text-ink-900 mb-3 font-semibold">What it came to</h2>
          <dl className="text-sm">
            {(
              [
                ['Material', live.materialCost],
                ['Electricity', live.electricityCost],
                ['Salary', live.salaryCost],
                ['Transport', live.transportCost],
                ['Pouching', live.pouchingCost],
                ['Packaging', live.packagingCost],
                ['Bank EMI', live.emiCost],
                ['Profit', live.profit],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="border-ink-100 flex justify-between border-b py-1.5">
                <dt className="text-ink-600">{label}</dt>
                <dd className="text-ink-900 tabular-nums">{formatRs(value)}</dd>
              </div>
            ))}
            <div className="border-brand-600 flex justify-between border-t-2 pt-2.5 pb-1.5">
              <dt className="text-ink-900 font-semibold">Effective price</dt>
              <dd className="text-ink-900 font-semibold tabular-nums">
                {formatRs(live.effectivePrice)}
              </dd>
            </div>
            <div className="bg-brand-50 mt-2 flex items-baseline justify-between rounded-md px-3 py-2">
              <dt className="text-ink-900 font-semibold">Cost a kilogram</dt>
              <dd className="text-brand-700 text-lg font-bold tabular-nums">
                {formatRs(live.costPerKg, 2)}
              </dd>
            </div>
          </dl>

          <dl className="text-ink-600 mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Material consumed</dt>
              <dd className="tabular-nums">{formatNumber(live.materialKg, 3)} kg</dd>
            </div>
            <div className="flex justify-between">
              <dt>Basic value a kilogram</dt>
              <dd className="tabular-nums">{formatRs(live.basicValuePerKg, 2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Wastage allowed</dt>
              <dd className="tabular-nums">{formatNumber(live.expectedWastageKg, 3)} kg</dd>
            </div>
            <div className="flex justify-between">
              <dt>Wastage actual</dt>
              <dd
                className={
                  live.actualWastageKg > live.expectedWastageKg
                    ? 'text-danger-700 font-semibold tabular-nums'
                    : 'tabular-nums'
                }
              >
                {formatNumber(live.actualWastageKg, 3)} kg ({formatNumber(live.wastagePercent, 2)}
                %)
              </dd>
            </div>
            {/* Negative when the job beat its allowance, which is worth seeing. */}
            <div className="flex justify-between">
              <dt>{live.excessCost >= 0 ? 'Excess wastage cost' : 'Under the allowance by'}</dt>
              <dd
                className={
                  live.excessCost > 0
                    ? 'text-danger-700 font-semibold tabular-nums'
                    : 'text-success-700 font-semibold tabular-nums'
                }
              >
                {formatRs(Math.abs(live.excessCost))}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <ConfirmDialog
        open={posting}
        title="Take this material off stock?"
        confirmLabel="Take off stock"
        tone="danger"
        loading={post.isPending}
        onClose={() => setPosting(false)}
        onConfirm={() => void onPost()}
      >
        Every line with a catalogue material is issued from the oldest batch first, against this
        job. It cannot be undone, and the sheet is closed to editing afterwards.
      </ConfirmDialog>
    </div>
  );
}
