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
  type JobSheetReel,
  type JobSheetReelInput,
  type JobSheetStage,
  type JobSheetStageUsage,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useProductionOrders } from '@/features/production/api/production-api';
import { useMaterials } from '@/features/rates/api/rate-api';
import { Weighings } from '../components/Weighings';
import { InkGrid } from '../components/InkGrid';
import { RollRow } from '../components/RollRow';
import { StageCard, type StageCardRow } from '../components/StageCard';
import { Band, Head, RowName, Typed, Worked, YELLOW } from '../components/sheet-form';
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

/** A weight box. Signed, because a drum genuinely can come back fuller. */

/**
 * A weighing as the draft holds it.
 *
 * The editor deals in weights; the server deals in rows with ids. A reel the
 * office has just typed has no id yet — it is a number in a box — so it gets
 * an empty one and takes its position from where it sits. The server replaces
 * the whole list on save anyway: a reel has no identity of its own.
 */
const asReels = (reels: JobSheetReelInput[]): JobSheetReel[] =>
  reels.map((reel, index) => ({
    ...reel,
    id: '',
    position: index + 1,
    coreKg: reel.coreKg ?? 0,
    reelNumber: reel.reelNumber ?? '',
  }));

/** A label and its box, as the form sets them: name on the left, box right. */
function SheetPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-700 w-32 shrink-0 text-sm font-medium">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** One line of the costing column: a name and what it came to. */
function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-ink-100 flex justify-between border-b py-1.5">
      <dt className="text-ink-600">{label}</dt>
      <dd className="text-ink-900 tabular-nums">{formatRs(value)}</dd>
    </div>
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

  /*
   * The films the office may put against a row the sheet could not name —
   * priced as at THIS sheet's date, like everything else on it.
   */
  const { data: materials } = useMaterials(draft?.date);
  const films = useMemo(
    () => (materials ?? []).filter((material) => material.category === 'FILM'),
    [materials],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  /**
   * Replaces the rolls for one machine, leaving the other machine's alone.
   *
   * The two lists live in one column on the sheet because they are one kind of
   * thing — a roll that came off something — and which machine it came off is
   * what decides whether it swells the printed figure or the laminated one.
   */
  /** One stage's own row: its share, its days, and the operator's remarks. */
  const setStage = (stage: JobSheetStage, patch: Partial<JobSheetStageUsage>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            stages: current.stages.map((row) => (row.stage === stage ? { ...row, ...patch } : row)),
          }
        : current,
    );

  const setOutput = (stage: JobSheetStage, reels: JobSheetReelInput[]) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            outputReels: [
              ...current.outputReels.filter((reel) => reel.stage !== stage),
              ...reels.map((reel, index) => ({
                id: '',
                position: index + 1,
                stage,
                weightKg: reel.weightKg,
                coreKg: reel.coreKg ?? 0,
                reelNumber: reel.reelNumber ?? '',
              })),
            ],
          }
        : current,
    );

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

  /* Cards nothing else costs, plus whichever this sheet already names — which
     would otherwise vanish from its own dropdown. */
  const linkableCards = (cards?.items ?? []).filter(
    (card) => !card.jobSheetId || card.jobSheetId === id,
  );

  /** Reports whether the sheet is now saved, so printing can wait for it. */
  async function onSave(): Promise<boolean> {
    if (!draft) return false;
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
          /* Weights only — the server gives them their rows back, and the
             issued and returned totals above are recomputed from them. */
          issueReels: line.issueReels.map((reel) => ({
            weightKg: reel.weightKg,
            coreKg: 0,
            reelNumber: reel.reelNumber,
          })),
          returnReels: line.returnReels.map((reel) => ({
            weightKg: reel.weightKg,
            coreKg: 0,
            reelNumber: reel.reelNumber,
          })),
        })),
        outputReels: draft.outputReels.map((reel) => ({
          stage: reel.stage,
          weightKg: reel.weightKg,
          coreKg: reel.coreKg,
          reelNumber: reel.reelNumber,
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
      return true;
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the sheet');
      return false;
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

  /* ------------------------------------------------------------------ *
   * The works' own blocks, read off the twenty-one rows.
   *
   * Their form groups what ours lists: the print web is "Details of Roll",
   * the three solvents are "Other Items", the colours are the ink grid, and
   * the lamination films and chemicals are the Stage 2 block. The rows are
   * the same rows — this is only which heading each sits under.
   * ------------------------------------------------------------------ */
  const line = (position: number) => draft.lines.find((row) => row.position === position);
  const consumedOf = (position: number) => live.lines[indexOf(position)]?.consumedKg ?? 0;

  const filmRow = line(1);
  const otherItems = draft.lines.filter(
    (row) => row.section === 'PRINTING' && row.kind === 'SOLVENT',
  );
  const otherItemsConsumed = otherItems.reduce((sum, row) => sum + consumedOf(row.position), 0);
  const laminationFilms = draft.lines.filter(
    (row) => row.section === 'LAMINATION' && row.kind === 'FILM',
  );
  const laminationChemicals = draft.lines.filter(
    (row) => row.section === 'LAMINATION' && row.kind !== 'FILM',
  );

  const stageUsage = (stage: JobSheetStage) => draft.stages.find((row) => row.stage === stage);
  const printingStage = stageUsage('PRINTING');
  const laminationStage = stageUsage('LAMINATION_1');

  /*
   * The two cards, which are summaries and never entry.
   *
   * Every figure is the rows above with the mixed drum folded in, which is
   * what their own card formulas do: ink plus 40% of the mix, ethyl plus 40,
   * toluene plus 20, adhesive plus 40, hardener plus 5, ethyl (lam) plus 60.
   */
  const inkRows = draft.lines.filter((row) => row.kind === 'INK');
  const sumOf = (rows: JobSheetLine[], pick: (row: JobSheetLine) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  const printMixIn = sumOf(inkRows, (row) => row.mixIssuedKg);
  const printMixBack = sumOf(inkRows, (row) => row.mixReturnedKg);
  const lamMixIn = draft.lamMixIssuedKg;
  const lamMixBack = draft.lamMixReturnedKg;

  const card = (name: string, input: number, balance: number): StageCardRow => ({
    name,
    input,
    balance,
    consumption: input - balance,
  });

  const printingCardRows: StageCardRow[] = [
    card('Polyster Film', filmRow?.issuedKg ?? 0, filmRow?.returnedKg ?? 0),
    card(
      'Printing Ink',
      sumOf(inkRows, (row) => row.issuedKg) + printMixIn * 0.4,
      sumOf(inkRows, (row) => row.returnedKg) + printMixBack * 0.4,
    ),
    card(
      'Ethyle',
      (line(2)?.issuedKg ?? 0) + printMixIn * 0.4,
      (line(2)?.returnedKg ?? 0) + printMixBack * 0.4,
    ),
    card(
      'Tolvin',
      (line(3)?.issuedKg ?? 0) + printMixIn * 0.2,
      (line(3)?.returnedKg ?? 0) + printMixBack * 0.2,
    ),
    card('MIBK', line(4)?.issuedKg ?? 0, line(4)?.returnedKg ?? 0),
    card('Prod. Kg.', draft.printedGrossKg, draft.printedCoreKg),
  ];

  const laminationCardRows: StageCardRow[] = [
    /* What the press made is what the laminator was given. */
    card('Stage 1 Roll', draft.printedGrossKg - draft.printedCoreKg, 0),
    card('Metalized Film', line(17)?.issuedKg ?? 0, line(17)?.returnedKg ?? 0),
    card('Poly', line(18)?.issuedKg ?? 0, line(18)?.returnedKg ?? 0),
    card(
      'Adhesive',
      (line(19)?.issuedKg ?? 0) + lamMixIn * 0.4,
      (line(19)?.returnedKg ?? 0) + lamMixBack * 0.4,
    ),
    card(
      'Hardner',
      (line(20)?.issuedKg ?? 0) + lamMixIn * 0.05,
      (line(20)?.returnedKg ?? 0) + lamMixBack * 0.05,
    ),
    card(
      'Ethyle',
      (line(21)?.issuedKg ?? 0) + lamMixIn * 0.6,
      (line(21)?.returnedKg ?? 0) + lamMixBack * 0.6,
    ),
    card('Production', draft.producedGrossKg, draft.producedCoreKg),
  ];

  /*
   * Their Ratio block: the ink and the chemical as a percentage of the film
   * that went through. A sanity check the works reads before it signs — an
   * ink ratio twice its usual is a job that has gone wrong somewhere.
   */
  const filmConsumed = consumedOf(1);
  const inkConsumed = printingCardRows[1]?.consumption ?? 0;
  const chemicalConsumed =
    (printingCardRows[2]?.consumption ?? 0) + (printingCardRows[3]?.consumption ?? 0);
  const inkRatio = filmConsumed > 0 ? (inkConsumed / filmConsumed) * 100 : 0;
  const chemicalRatio = filmConsumed > 0 ? (chemicalConsumed / filmConsumed) * 100 : 0;

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

      {/*
        A job sheet is what the run CONSUMED.

        The instruction it worked from — film, sizes, metres, hours — is a job
        card, which is its own document on its own screen, written before the
        run by different people. The two were briefly one page; they are not
        one thing.
      */}
      {/* ======================= the works' own sheet ======================= */}

      {/*
        The head of the paper: who, what and how big.

        Laid out as their form reads it — Sr. No. and Date along the top, then
        the job, the material and the cylinder. Yellow is theirs: every box on
        this sheet that the works types is yellow, and nothing else is.
      */}
      <section className="border-ink-300 rounded border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <Head>Sr. No.</Head>
            <Worked value={draft.number} places={0} className="w-20 font-semibold" />
          </div>
          <div className="flex items-end gap-2">
            <Head>Date</Head>
            <Input
              type="date"
              className={cn(YELLOW, 'w-40')}
              aria-label="Date"
              value={draft.date}
              disabled={locked}
              onChange={(event) => set('date', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          <SheetPair label="Job Name:">
            <Input
              className={cn(YELLOW, 'w-full')}
              aria-label="Job name"
              value={draft.jobName}
              disabled={locked}
              onChange={(event) => set('jobName', event.target.value)}
            />
          </SheetPair>
          <SheetPair label="Width:">
            <Typed
              width="w-24"
              label="Width in mm"
              value={draft.webWidthMm ?? 0}
              disabled={locked}
              onChange={(next) => set('webWidthMm', Number(next || 0))}
            />
          </SheetPair>
          <SheetPair label="Material:">
            <Input
              className={cn(YELLOW, 'w-full')}
              aria-label="Material"
              placeholder="Polyster / HSPP"
              value={draft.filmType}
              disabled={locked}
              onChange={(event) => set('filmType', event.target.value)}
            />
          </SheetPair>
          <SheetPair label="Thickness:">
            <Typed
              width="w-24"
              label="Thickness in micron"
              value={draft.micron ?? 0}
              disabled={locked}
              onChange={(next) => set('micron', Number(next || 0))}
            />
          </SheetPair>
          <SheetPair label="No. of Cylinder:">
            <Typed
              width="w-24"
              label="Number of cylinders"
              value={draft.cylinderCount}
              disabled={locked}
              onChange={(next) => set('cylinderCount', Number(next || 0))}
            />
          </SheetPair>
          <SheetPair label="Circumference:">
            <Typed
              width="w-24"
              label="Circumference in mm"
              value={draft.circumferenceMm ?? 0}
              disabled={locked}
              onChange={(next) => set('circumferenceMm', Number(next || 0))}
            />
          </SheetPair>
          <SheetPair label="Operator Name:">
            <Input
              className={cn(YELLOW, 'w-full')}
              aria-label="Operator name"
              value={draft.operatorName}
              disabled={locked}
              onChange={(event) => set('operatorName', event.target.value)}
            />
          </SheetPair>
          <SheetPair label="Production run:">
            <Select
              className="w-full"
              aria-label="Production run"
              value={draft.productionOrderId ?? ''}
              disabled={locked}
              onChange={(event) => set('productionOrderId', event.target.value || null)}
            >
              <option value="">Not against a production run</option>
              {linkableCards.map((card) => (
                <option key={card.id} value={card.id}>
                  #{card.number} — {card.customerName} · {card.jobName}
                </option>
              ))}
            </Select>
          </SheetPair>
        </div>
      </section>

      {/* ---- Details of Roll, and the other items beside it ---- */}
      <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
        <Band>Details of Roll</Band>
        {filmRow ? (
          <RollRow
            name="Material Net Weight"
            reels={filmRow.issueReels}
            onReels={(reels) => setLine(filmRow.position, { issueReels: asReels(reels) })}
            balance={filmRow.returnedKg}
            onBalance={(next) => setLine(filmRow.position, { returnedKg: next })}
            disabled={locked}
            extra={{
              head: 'Westage',
              node: (
                <Typed
                  width="w-[72px]"
                  label="Printing wastage, kg"
                  value={printingStage?.wastageKg ?? 0}
                  disabled={locked}
                  onChange={(next) => setStage('PRINTING', { wastageKg: Number(next || 0) })}
                />
              ),
            }}
          />
        ) : null}

        <Band right={`Consumed together: ${formatNumber(otherItemsConsumed, 3)} kg`}>
          Other Items
        </Band>
        {otherItems.map((line) => (
          <RollRow
            key={line.id}
            name={line.name}
            reels={line.issueReels}
            onReels={(reels) => setLine(line.position, { issueReels: asReels(reels) })}
            balance={line.returnedKg}
            onBalance={(next) => setLine(line.position, { returnedKg: next })}
            disabled={locked}
          />
        ))}
      </section>

      {/* ---- Fresh Ink and Mix Ink ---- */}
      <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
        <Band>Fresh Ink &nbsp;·&nbsp; Mix Ink</Band>
        <InkGrid lines={draft.lines} onLine={setLine} disabled={locked} />
      </section>

      {/* ---- Output Rolls Gross Weight ---- */}
      <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
        <Band>Output Rolls Gross Weight</Band>
        <div className="py-2">
          <Weighings
            withCores
            label="Rolls off the press"
            reels={draft.outputReels.filter((reel) => reel.stage === 'PRINTING')}
            disabled={locked}
            onChange={(reels) => setOutput('PRINTING', reels)}
          />
        </div>
      </section>

      {/* ---- JOB CARD (PRINTING) ---- */}
      <StageCard
        title="JOB CARD (PRINTING)"
        srNo={draft.number}
        date={draft.date}
        rows={printingCardRows}
        usage={printingStage}
        onUsage={setStage}
        disabled={locked}
      />

      {/* ---- Lamination Job card (Stage 2): what went on ---- */}
      <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-3">
        <Band>Lamination Job card (Stage 2)</Band>
        {laminationFilms.map((line) => (
          <RollRow
            key={line.id}
            name={line.name}
            reels={line.issueReels}
            onReels={(reels) => setLine(line.position, { issueReels: asReels(reels) })}
            balance={line.returnedKg}
            onBalance={(next) => setLine(line.position, { returnedKg: next })}
            disabled={locked}
          />
        ))}

        <Band>Quanity Received</Band>
        {laminationChemicals.map((line) => (
          <RollRow
            key={line.id}
            name={line.name}
            reels={line.issueReels}
            onReels={(reels) => setLine(line.position, { issueReels: asReels(reels) })}
            balance={line.returnedKg}
            onBalance={(next) => setLine(line.position, { returnedKg: next })}
            disabled={locked}
          />
        ))}
        <div className="border-ink-100 flex flex-wrap items-end gap-3 border-t pt-2">
          <RowName>Mix</RowName>
          <div>
            <Head>Total</Head>
            <Typed
              label="Lamination mix out"
              value={draft.lamMixIssuedKg}
              disabled={locked}
              onChange={(next) => set('lamMixIssuedKg', Number(next || 0))}
            />
          </div>
          <div>
            <Head>Bal.</Head>
            <Typed
              label="Lamination mix back"
              value={draft.lamMixReturnedKg}
              disabled={locked}
              onChange={(next) => set('lamMixReturnedKg', Number(next || 0))}
            />
          </div>
          <div>
            <Head>Cons.</Head>
            <Worked value={draft.lamMixIssuedKg - draft.lamMixReturnedKg} />
          </div>
          <p className="text-ink-500 ml-2 text-xs">
            The adhesive takes 40% of this drum, the hardener 5% and the ethyl 60%.
          </p>
        </div>

        <Band>Produced Quantity</Band>
        <div className="py-2">
          <Weighings
            withCores
            label="Rolls off the laminator"
            reels={draft.outputReels.filter((reel) => reel.stage === 'LAMINATION_1')}
            disabled={locked}
            onChange={(reels) => setOutput('LAMINATION_1', reels)}
          />
        </div>
      </section>

      {/* ---- Lamination Job card (Stage 2): the card ---- */}
      <StageCard
        title="Lamination Job card (Stage 2)"
        srNo={draft.number}
        date={draft.date}
        rows={laminationCardRows}
        usage={laminationStage}
        onUsage={setStage}
        disabled={locked}
      />

      {/* ---- Manufacturing Job Card (Final Costing) ---- */}
      <section className="border-ink-300 overflow-hidden rounded border bg-white px-4 pb-4">
        <Band right={`Final Output ${formatNumber(draft.finalOutputKg, 2)} kg`}>
          Manufacturing Job Card (Final Costing)
        </Band>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* The item table, as their form rules it. */}
          <div className="overflow-x-auto pt-2">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-ink-300 border-b text-left">
                  <th className="pb-1">
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
                {draft.lines.map((line) => {
                  const costed = live.lines[indexOf(line.position)];
                  const corrected = line.consumedOverrideKg !== null;
                  return (
                    <tr key={line.id} className="border-ink-100 border-b last:border-b-0">
                      <td className="text-ink-800 py-1 pr-2">
                        {line.name}
                        {!line.materialId && line.kind === 'FILM' ? (
                          <Select
                            className="mt-1 w-52 text-xs"
                            value=""
                            disabled={locked}
                            aria-label={`Which film is ${line.name}?`}
                            onChange={(event) => {
                              const picked = films.find((f) => f.id === event.target.value);
                              if (picked) {
                                setLine(line.position, {
                                  materialId: picked.id,
                                  name: picked.name,
                                });
                              }
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
                        Worked out from the rows above, and typed over only
                        where the drum in front of them says otherwise — the
                        computed figure stays visible beside the correction.
                      */}
                      <td className="py-1 pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <NumberInput
                            allowNegative
                            disabled={locked}
                            className={cn(
                              'w-24 text-right',
                              corrected ? `${YELLOW} font-semibold` : 'bg-white',
                            )}
                            aria-label={`${line.name}, quantity`}
                            value={corrected ? String(line.consumedOverrideKg) : ''}
                            placeholder={formatNumber(costed?.computedKg ?? 0, 3)}
                            onChange={(event) =>
                              setLine(line.position, {
                                consumedOverrideKg:
                                  event.target.value === '' ? null : Number(event.target.value),
                              })
                            }
                          />
                        </div>
                        {corrected ? (
                          <div className="text-warning-700 text-right text-[11px] tabular-nums">
                            was {formatNumber(costed?.computedKg ?? 0, 3)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2">
                        <Typed
                          width="w-20"
                          label={`${line.name}, rate`}
                          value={line.ratePerKg}
                          disabled={locked}
                          onChange={(next) =>
                            setLine(line.position, { ratePerKg: Number(next || 0) })
                          }
                        />
                      </td>
                      <td className="text-ink-900 py-1 text-right font-medium tabular-nums">
                        {formatRs(costed?.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-ink-400 border-t-2">
                  <td className="text-ink-900 py-1.5 font-semibold">Total</td>
                  <td className="text-ink-900 py-1.5 text-right font-semibold tabular-nums">
                    {formatNumber(live.materialKg, 2)}
                  </td>
                  <td />
                  <td className="text-ink-900 py-1.5 text-right font-semibold tabular-nums">
                    {formatRs(live.materialCost)}
                  </td>
                </tr>
                <tr>
                  <td className="text-ink-700 py-1.5">Basic Value</td>
                  <td />
                  <td />
                  <td className="text-ink-900 py-1.5 text-right font-semibold tabular-nums">
                    {formatRs(live.basicValuePerKg, 2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* The right-hand column of their form: what it came to. */}
          <div className="pt-2">
            <dl className="text-sm">
              <Money label="Basic Cost" value={live.materialCost} />
              <Money label="Electricity Expense" value={live.electricityCost} />
              <Money label="Salary" value={live.salaryCost} />
              <Money label="Transport Expense" value={live.transportCost} />
              <Money label="Pouching Expense" value={live.pouchingCost} />
              <Money label="Packaging Exp." value={live.packagingCost} />
              <Money label="Bank EMI" value={live.emiCost} />
              <Money label="Profit" value={live.profit} />
              <div className="border-ink-400 flex justify-between border-t-2 py-2">
                <dt className="text-ink-900 font-semibold">Effective Price</dt>
                <dd className="text-ink-900 font-semibold tabular-nums">
                  {formatRs(live.effectivePrice)}
                </dd>
              </div>
            </dl>

            {/* Their green cell: the figure the whole sheet is for. */}
            <div className="mt-2 flex items-baseline justify-between rounded border border-[#4CAF50] bg-[#E8F5E9] px-3 py-2">
              <span className="text-ink-900 font-semibold">Cost / Kg.</span>
              <span className="text-lg font-bold tabular-nums text-[#1B5E20]">
                {formatRs(live.costPerKg, 2)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <SheetPair label="Pouching Weight Kg.">
                <Typed
                  width="w-24"
                  label="Pouching weight"
                  value={draft.pouchingWeightKg}
                  disabled={locked}
                  onChange={(next) => set('pouchingWeightKg', Number(next || 0))}
                />
              </SheetPair>
              <SheetPair label="Final Output Kg.">
                <Typed
                  width="w-24"
                  label="Final output"
                  value={draft.finalOutputKg}
                  disabled={locked}
                  onChange={(next) => set('finalOutputKg', Number(next || 0))}
                />
              </SheetPair>
            </div>

            <dl className="text-ink-600 mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Material Type</dt>
                <dd className="text-ink-900 font-medium">
                  {draft.pouchingWeightKg > 0 ? 'Pouch Form' : 'Roll Form'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Exp. Wastage Kg.</dt>
                <dd className="tabular-nums">{formatNumber(live.expectedWastageKg, 2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Act. Wastage Kg.</dt>
                <dd
                  className={
                    live.actualWastageKg > live.expectedWastageKg
                      ? 'text-danger-700 font-semibold tabular-nums'
                      : 'tabular-nums'
                  }
                >
                  {formatNumber(live.actualWastageKg, 2)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Wastage %</dt>
                <dd className="tabular-nums">{formatNumber(live.wastagePercent, 2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Excess Rs.</dt>
                <dd
                  className={
                    live.excessCost > 0
                      ? 'text-danger-700 font-semibold tabular-nums'
                      : 'text-success-700 tabular-nums'
                  }
                >
                  {formatRs(live.excessCost)}
                </dd>
              </div>
            </dl>

            {/* Their Ratio block: a sanity check on the ink and the chemical. */}
            <div className="border-ink-200 mt-3 rounded border p-2.5">
              <Head>Ratio</Head>
              <dl className="text-ink-600 mt-1 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Ink</dt>
                  <dd className="tabular-nums">{formatNumber(inkRatio, 2)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Chemical</dt>
                  <dd className="tabular-nums">{formatNumber(chemicalRatio, 2)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Total Output</dt>
                  <dd className="tabular-nums">
                    {formatNumber((draft.producedGrossKg - draft.producedCoreKg) * 0.97, 2)} kg
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/*
        WORKERS SALARY, the electricity split and the overheads — the three
        blocks their form carries at the foot of the costing, in their order.
      */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border-ink-200 overflow-hidden rounded-lg border bg-white">
          <h2 className="text-ink-900 border-ink-200 border-b px-4 py-3 font-semibold">
            WORKERS SALARY
          </h2>
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

        <section className="border-ink-200 rounded-lg border bg-white p-4 lg:col-span-2">
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
        </section>
      </div>

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
