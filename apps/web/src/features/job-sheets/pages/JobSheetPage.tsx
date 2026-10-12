import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageMinus, Save } from 'lucide-react';
import {
  costJobSheet,
  formatNumber,
  JOB_SHEET_STATUS_LABELS,
  mixDrumFor,
  type JobSheet,
  type JobSheetCost,
  type JobSheetLabour,
  type JobSheetLine,
  type JobSheetReel,
  type JobSheetReelInput,
  type JobSheetStage,
  type JobSheetStageUsage,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
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
import { FinalCosting } from '../components/FinalCosting';
import { Band, Head, RowName, Typed, Worked, YELLOW } from '../components/sheet-form';
import { DocCard } from '@/components/ui/Document';
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

/**
 * The two halves of the sheet.
 *
 * `?view=costing` rather than component state, so the office can keep a link to
 * the costing of a job and land on it — and so the back button behaves the way
 * anybody who has used a browser expects it to.
 */
const VIEWS = [
  { key: 'entry', label: 'Stage entry' },
  { key: 'costing', label: 'Final Costing' },
] as const;

type View = (typeof VIEWS)[number]['key'];

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

  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'costing' ? 'costing' : 'entry';
  const setView = (next: View) => {
    const copy = new URLSearchParams(params);
    if (next === 'entry') copy.delete('view');
    else copy.set('view', next);
    setParams(copy, { replace: true });
  };

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

  /** One line of the wage bill. */
  const setLabour = (id: string, patch: Partial<JobSheetLabour>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            labour: current.labour.map((role) => (role.id === id ? { ...role, ...patch } : role)),
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
        /*
         * The six overheads the office may settle by hand.
         *
         * They have been on the record and in the costing since the beginning
         * and no screen could set one, so an office that disagreed with the
         * worked-out electricity had nowhere to say so. Null is the ordinary
         * state and means "work it out".
         */
        electricityOverride: draft.electricityOverride,
        salaryOverride: draft.salaryOverride,
        transportOverride: draft.transportOverride,
        pouchingOverride: draft.pouchingOverride,
        emiOverride: draft.emiOverride,
        profitOverride: draft.profitOverride,
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
          <Button variant="ghost" onClick={() => navigate('/job-sheets')} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
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
        Two readers, two screens, one record.

        **Stage entry** is filled in at a machine by whoever is standing there,
        a drum in front of them, reading down a form they have used for years.
        **Final Costing** is read afterwards by the office, which is not filling
        anything in — it is checking a figure and wants to see what moved it.
        Their paper has both, one after the other on the same sheet; on a screen
        that made a page nobody could find anything on, because every block
        either mattered enormously or not at all depending on which of the two
        jobs you had come to do.

        It is still one record, and Save still saves all of it.
      */}
      <div
        className="border-ink-200 -mb-1 flex gap-1 border-b"
        role="tablist"
        aria-label="Job sheet"
      >
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={view === item.key}
            onClick={() => setView(item.key)}
            className={cn(
              'cursor-pointer rounded-t-md px-4 py-2 text-sm font-semibold transition-colors',
              view === item.key
                ? 'border-brand-600 text-brand-700 -mb-px border-b-2 bg-white'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'entry' ? (
        <div className="space-y-5">
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
          <DocCard>
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
          </DocCard>

          {/* ---- Details of Roll, and the other items beside it ---- */}
          <DocCard>
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
          </DocCard>

          {/* ---- Fresh Ink and Mix Ink ---- */}
          <DocCard>
            <Band>Fresh Ink &nbsp;·&nbsp; Mix Ink</Band>
            <InkGrid lines={draft.lines} onLine={setLine} disabled={locked} />
          </DocCard>

          {/* ---- Output Rolls Gross Weight ---- */}
          <DocCard>
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
          </DocCard>

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
          <DocCard>
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
          </DocCard>

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
        </div>
      ) : null}

      {view === 'costing' ? (
        <FinalCosting
          draft={draft}
          live={live}
          locked={locked}
          films={films}
          indexOf={indexOf}
          onField={set}
          onLine={setLine}
          onLabour={setLabour}
          onStage={setStage}
          ratio={{
            ink: inkRatio,
            chemical: chemicalRatio,
            totalOutput: (draft.producedGrossKg - draft.producedCoreKg) * 0.97,
          }}
        />
      ) : null}

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
