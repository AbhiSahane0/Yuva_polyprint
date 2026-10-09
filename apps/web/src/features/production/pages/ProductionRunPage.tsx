import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
  canMoveProductionTo,
  formatNumber,
  laminationLabel,
  PRODUCTION_STAGE_LABELS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUSES,
  STAGE_STATUS_LABELS,
  stageWasteKnown,
  type LaminationLabel,
  type ProductionOrder,
  type ProductionStageRow,
  type ProductionStatus,
  type StageStatus,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Field, NumberInput, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useCostingMasterData } from '@/features/costing/api/costing-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useCreateJobSheet } from '@/features/job-sheets/api/job-sheet-api';
import { useEmployees } from '@/features/employees/api/employee-api';
import { OperatorSelect } from '../components/OperatorSelect';
import { MaterialPanel } from '../components/MaterialPanel';
import {
  useDeleteProduction,
  useProductionOrder,
  useUpdateProduction,
  useUpdateStage,
} from '../api/production-api';

const TONE: Record<ProductionStatus, 'neutral' | 'brand' | 'success' | 'warning'> = {
  PLANNED: 'neutral',
  RUNNING: 'brand',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
};

const STAGE_TONE: Record<StageStatus, string> = {
  PENDING: 'border-ink-200 bg-white',
  RUNNING: 'border-brand-300 bg-brand-50/40',
  DONE: 'border-success-200 bg-success-50/30',
  SKIPPED: 'border-ink-200 bg-ink-25',
};

/**
 * What a stage is called, and — on a lamination row — what it bonds.
 *
 * The works has two laminators and runs one of them, so "Lamination 1" and
 * "Lamination 2" read as the two machines. They are not: a laminator bonds two
 * films at a time, so a three-ply job goes through twice, on whichever machine
 * the works uses. Naming the films is what stops the number being mistaken for
 * a machine.
 */
function stageTitle(stage: ProductionStageRow, card: ProductionOrder): LaminationLabel {
  if (stage.stage !== 'LAMINATION') {
    return { title: PRODUCTION_STAGE_LABELS[stage.stage], bonds: '' };
  }
  return laminationLabel({
    pass: stage.pass,
    totalPasses: card.stages.filter((s) => s.stage === 'LAMINATION').length,
    plies: card.plies,
  });
}

/**
 * **The production run — what the floor actually did, stage by stage.**
 *
 * One block per stage rather than a table, because a stage is filled in by
 * somebody standing at a machine with two weights and a name, not read across
 * in a row. The stages that do not apply stay on the card marked
 * "Skipped — not required": a gap would read as something nobody has got to
 * yet, which is the opposite of what it means.
 */
export default function ProductionRunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'jobs');

  const { data: card, isPending, isError } = useProductionOrder(id ?? null);
  const { data: master } = useCostingMasterData();
  /*
   * Everybody, including those who have left: a stage filled in months ago may
   * name somebody who has since gone, and a dropdown that cannot show its own
   * value shows a blank — which reads as nobody ran it.
   */
  const { data: works } = useEmployees({ includeLeft: true });
  const update = useUpdateProduction();
  const updateStage = useUpdateStage();
  const remove = useDeleteProduction();
  const startSheet = useCreateJobSheet();
  const [deleting, setDeleting] = useState(false);

  if (isPending) return <LoadingState label="Loading the production run…" />;
  if (isError || !card) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="That production run is not on record"
          description="It may have been deleted."
          action={
            <Button variant="secondary" onClick={() => navigate('/production')}>
              Back to production
            </Button>
          }
        />
      </div>
    );
  }

  /* Captured past the guard above, so the handlers below — which TypeScript
     does not narrow into — can name the card without asserting it exists. */
  const cardId = card.id;
  const ended = card.status === 'COMPLETED';
  const nextStatuses = PRODUCTION_STATUSES.filter(
    (status) => status !== card.status && canMoveProductionTo(card.status, status),
  );

  async function move(status: ProductionStatus) {
    try {
      await update.mutateAsync({ id: card!.id, input: { status } });
      toast.success(
        `Card #${card!.number} is now ${PRODUCTION_STATUS_LABELS[status].toLowerCase()}`,
      );
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  /** Raises the sheet that will cost this run, already pointed at this card. */
  async function recordCost() {
    try {
      const sheet = await startSheet.mutateAsync({
        date: new Date().toISOString().slice(0, 10),
        productionOrderId: card!.id,
      });
      navigate(`/job-sheets/${sheet.id}`);
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError ? caught.message : 'Could not start a job sheet',
      );
    }
  }

  /**
   * A flow step: start, finish, skip, put back.
   *
   * Waits for the server, because it is the server that decides. Starting a
   * stage can be refused outright when the film is not there, and it moves the
   * card and the order with it — none of which can be guessed at here.
   */
  async function moveStage(
    stageId: string,
    input: Parameters<typeof updateStage.mutateAsync>[0]['input'],
  ) {
    try {
      await updateStage.mutateAsync({ cardId, stageId, input });
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  /**
   * A field: the machine, who ran it, a weight.
   *
   * Shows at once and saves behind itself. `optimistic` is what the screen
   * should read while the request is in the air — the id the control is bound
   * to, plus the name the card prints beside it, which the server snapshots
   * and this page already knows. A failure puts the old value back.
   */
  async function setField(
    stageId: string,
    input: Parameters<typeof updateStage.mutateAsync>[0]['input'],
    optimistic: NonNullable<Parameters<typeof updateStage.mutateAsync>[0]['optimistic']>,
  ) {
    try {
      await updateStage.mutateAsync({ cardId, stageId, input, optimistic });
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  const people = works?.items ?? [];

  /* Only machines of this stage's own kind. A slitter is not a choice for the
     press, and offering it is offering a mistake. */
  const machinesFor = (stage: ProductionStageRow) =>
    (master?.machines ?? []).filter((m) => m.kind === stage.stage && m.isActive);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate('/production')}
        className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Production
      </button>

      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
              Production run #{card.number}
            </h1>
            <Badge tone={TONE[card.status]}>{PRODUCTION_STATUS_LABELS[card.status]}</Badge>
          </div>
          <p className="text-ink-500 mt-0.5 text-sm">
            {card.customerName} · {card.jobName} ·{' '}
            <button
              type="button"
              onClick={() => navigate(`/orders/${card.orderId}`)}
              className="text-brand-700 hover:underline"
            >
              order #{card.orderNumber}
            </button>
          </p>
        </div>

        {canEdit ? (
          <>
            <div className="hidden shrink-0 items-center gap-2 sm:flex sm:flex-nowrap">
              {/*
               * The handover from the floor to the office, and the reason it is
               * on this screen at all: a sheet raised here is LINKED to the
               * card, and posting a linked sheet releases the card's claim on
               * its film. A sheet started from the Job sheets list has to have
               * the card picked by hand, and the one nobody picks is the one
               * that leaves stock reading low.
               */}
              {card.jobSheetId ? (
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/job-sheets/${card.jobSheetId}`)}
                  className="whitespace-nowrap"
                >
                  Job sheet {card.jobSheetNumber}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={startSheet.isPending}
                  onClick={() => void recordCost()}
                  className="whitespace-nowrap"
                >
                  Record what it cost
                </Button>
              )}
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  variant={status === 'COMPLETED' ? 'primary' : 'secondary'}
                  loading={update.isPending}
                  onClick={() => void move(status)}
                  className="whitespace-nowrap"
                >
                  {PRODUCTION_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
            <ActionMenu
              className="sm:hidden"
              label={`Actions for production run ${card.number}`}
              actions={[
                card.jobSheetId
                  ? {
                      label: `Job sheet ${card.jobSheetNumber}`,
                      onSelect: () => navigate(`/job-sheets/${card.jobSheetId}`),
                    }
                  : { label: 'Record what it cost', onSelect: () => void recordCost() },
                ...nextStatuses.map((status) => ({
                  label: PRODUCTION_STATUS_LABELS[status],
                  onSelect: () => void move(status),
                })),
              ]}
            />
          </>
        ) : null}
      </header>

      {/* Where it has got to, in one line. The bar is the same one the list
          shows, so the two screens cannot disagree about progress. */}
      <section className="border-ink-200 mb-5 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">Making</div>
            <div className="text-ink-900 mt-0.5 text-sm tabular-nums">
              {formatNumber(card.quantityKg, 3)} kg
            </div>
          </div>
          <div className="min-w-48 flex-1">
            <div className="text-ink-500 mb-1 flex items-center justify-between text-xs">
              <span className="font-medium tracking-wide uppercase">Progress</span>
              <span className="tabular-nums">{card.progressPercent}%</span>
            </div>
            <div className="bg-ink-100 h-2 overflow-hidden rounded-full">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  card.progressPercent === 100 ? 'bg-success-500' : 'bg-brand-500',
                )}
                style={{ width: `${Math.max(card.progressPercent, 2)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Above the stages on purpose: whether the film is there is the first
          question, and the answer to it decides whether any of the stages
          below can be started at all. */}
      <MaterialPanel card={card} canEdit={canEdit} />

      <h2 className="text-ink-800 mb-3 text-xs font-semibold tracking-wider uppercase">Stages</h2>

      <div className="flex flex-col gap-3">
        {card.stages.map((stage) => {
          const skipped = stage.status === 'SKIPPED';
          const locked = !canEdit || ended || skipped;
          return (
            <section
              key={stage.id}
              className={cn('rounded-[var(--radius-lg)] border p-4', STAGE_TONE[stage.status])}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-ink-400 text-xs font-medium tabular-nums">
                    {stage.position}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3
                        className={cn(
                          'text-sm font-semibold',
                          skipped ? 'text-ink-400' : 'text-ink-900',
                        )}
                      >
                        {stageTitle(stage, card).title}
                      </h3>
                      <span className="text-ink-500 text-xs">
                        {STAGE_STATUS_LABELS[stage.status]}
                      </span>
                    </div>
                    {/* Which two films go on the machine for this pass. The
                        number above is the pass, not the machine — the works
                        runs one laminator whatever the count says. */}
                    {stageTitle(stage, card).bonds ? (
                      <div className="text-ink-400 mt-0.5 text-xs">
                        {stageTitle(stage, card).bonds}
                      </div>
                    ) : null}
                  </div>
                </div>

                {canEdit && !ended ? (
                  <div className="flex items-center gap-1.5">
                    {stage.status === 'PENDING' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void moveStage(stage.id, { status: 'RUNNING' })}
                        >
                          Start
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void moveStage(stage.id, { status: 'SKIPPED' })}
                        >
                          Not needed
                        </Button>
                      </>
                    ) : null}
                    {stage.status === 'RUNNING' ? (
                      <Button
                        size="sm"
                        onClick={() => void moveStage(stage.id, { status: 'DONE' })}
                      >
                        Finish
                      </Button>
                    ) : null}
                    {skipped ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void moveStage(stage.id, { status: 'PENDING' })}
                      >
                        Put back
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {skipped ? null : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label="Machine" htmlFor={`machine-${stage.id}`}>
                    <Select
                      id={`machine-${stage.id}`}
                      value={stage.machineId ?? ''}
                      disabled={locked}
                      onChange={(event) => {
                        const machineId = event.target.value || null;
                        void setField(
                          stage.id,
                          { machineId },
                          {
                            machineId,
                            machineName:
                              machinesFor(stage).find((m) => m.id === machineId)?.name ?? '',
                          },
                        );
                      }}
                    >
                      <option value="">— pick one —</option>
                      {machinesFor(stage).map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Operator" htmlFor={`operator-${stage.id}`}>
                    <OperatorSelect
                      id={`operator-${stage.id}`}
                      stage={stage}
                      people={people}
                      disabled={locked}
                      onPick={(operatorId) =>
                        void setField(
                          stage.id,
                          { operatorId },
                          {
                            operatorId,
                            operator: people.find((p) => p.id === operatorId)?.name ?? '',
                          },
                        )
                      }
                    />
                  </Field>

                  <Field label="In, kg" htmlFor={`in-${stage.id}`}>
                    <NumberInput
                      id={`in-${stage.id}`}
                      defaultValue={stage.inputKg ? String(stage.inputKg) : ''}
                      disabled={locked}
                      onBlur={(event) => {
                        const inputKg = Number(event.target.value || 0);
                        if (inputKg === stage.inputKg) return;
                        void setField(stage.id, { inputKg }, { inputKg });
                      }}
                    />
                  </Field>

                  <Field label="Out, kg" htmlFor={`out-${stage.id}`}>
                    <NumberInput
                      id={`out-${stage.id}`}
                      defaultValue={stage.outputKg ? String(stage.outputKg) : ''}
                      disabled={locked}
                      onBlur={(event) => {
                        const outputKg = Number(event.target.value || 0);
                        if (outputKg === stage.outputKg) return;
                        void setField(stage.id, { outputKg }, { outputKg });
                      }}
                    />
                  </Field>

                  {/*
                    Waste is shown, never typed. A third figure that can
                    disagree with the two it comes from is a figure nobody can
                    trust — and a negative one is worth seeing, because it means
                    one of the two weights is wrong.
                  */}
                  <div>
                    <div className="text-ink-500 text-xs font-medium">Waste</div>
                    <div
                      className={cn(
                        'mt-2 text-sm font-medium tabular-nums',
                        stage.wasteKg < 0 ? 'text-warning-700' : 'text-ink-800',
                      )}
                    >
                      {stageWasteKnown(stage) ? `${formatNumber(stage.wasteKg, 3)} kg` : '—'}
                    </div>
                    {stage.wasteKg < 0 ? (
                      <div className="text-warning-700 mt-0.5 text-xs">
                        More out than in — check a weight
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {canEdit && card.status === 'PLANNED' && !card.startedAt ? (
        <div className="border-ink-200 mt-6 flex justify-end border-t pt-4">
          <Button variant="dangerGhost" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            Delete this production run
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting}
        title={`Delete production run #${card.number}?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(card.id, {
            onSuccess: () => {
              toast.success(`Production run #${card.number} deleted`);
              navigate('/production');
            },
            onError: (caught) =>
              toast.error(caught instanceof ApiClientError ? caught.message : 'Could not delete'),
            onSettled: () => setDeleting(false),
          })
        }
      >
        Nothing has run on it, so there is no material behind it and nothing to explain. The order
        keeps its own record and can be started again.
      </ConfirmDialog>
    </div>
  );
}
