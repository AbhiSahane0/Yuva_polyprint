import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  ClipboardCheck,
  PackagePlus,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  formatNumber,
  formatRs,
  HEALTH_LABELS,
  MOVEMENT_LABELS,
  unitLabel,
  type StockMovement,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Field, NumberInput } from '@/components/ui/Field';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useMaterialStock, useSetReorderLevel } from '../api/inventory-api';
import { ReceiveStockModal } from '../components/ReceiveStockModal';
import { StockActionModal, type StockAction } from '../components/StockActionModal';

const HEALTH_TONE = {
  HEALTHY: 'success',
  LOW: 'warning',
  OUT: 'warning',
  UNSET: 'neutral',
  // Never received here. Grey, because it is not a problem — it is a material
  // on the price list that this works does not hold.
  NOT_STOCKED: 'neutral',
} as const;

/** dd-mm-yyyy, matching the quotation list. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * What a movement did, in the column the wireframe puts it in.
 *
 * A transfer shows the two locations rather than a quantity, because zero in a
 * quantity column reads as "nothing moved" when the truth is "stock moved, the
 * amount did not change".
 */
function MovementQuantity({ movement, unit }: { movement: StockMovement; unit: string }) {
  if (movement.kind === 'TRANSFER') {
    return (
      <span className="text-ink-500 text-xs">
        {movement.fromLocation || '—'} → {movement.toLocation}
      </span>
    );
  }
  if (movement.quantity === 0) {
    // A count that agreed with the books. Recorded because it is evidence the
    // shelf was checked, and shown as such rather than as a zero.
    return <span className="text-ink-400 text-xs">no change</span>;
  }
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        movement.quantity > 0 ? 'text-success-600' : 'text-danger-600',
      )}
    >
      {movement.quantity > 0 ? '+' : ''}
      {formatNumber(movement.quantity, 2)} {unit}
    </span>
  );
}

export default function MaterialStockPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError, error, refetch } = useMaterialStock(id ?? null);
  const setLevel = useSetReorderLevel(id ?? '');

  const [receiving, setReceiving] = useState(false);
  const [action, setAction] = useState<StockAction | null>(null);
  const [levelDraft, setLevelDraft] = useState<string | null>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Could not load this material"
          description={error instanceof Error ? error.message : 'Something went wrong.'}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (isPending || !data) return <LoadingState label="Loading stock…" className="mt-8" />;

  const { summary, batches, movements } = data;
  const level = levelDraft ?? (summary.reorderLevel === null ? '' : String(summary.reorderLevel));

  async function saveLevel() {
    try {
      await setLevel.mutateAsync({ reorderLevel: level === '' ? null : Number(level) });
      toast.success(level === '' ? 'Reorder level cleared' : `Reorder level set to ${level}`);
      setLevelDraft(null);
    } catch {
      toast.error('Could not save the reorder level');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <Link
          to="/inventory"
          className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Inventory
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">{summary.name}</h1>
            <p className="text-ink-500 mt-0.5 text-sm">
              {summary.batchCount > 0
                ? `${summary.batchCount} batch${summary.batchCount === 1 ? '' : 'es'}`
                : 'No stock on hand'}
              {summary.locations.length > 0 ? ` · ${summary.locations.join(', ')}` : ''}
              {summary.lastMovedAt ? ` · last moved ${formatWhen(summary.lastMovedAt)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAction('TRANSFER')}>
              <ArrowLeftRight className="size-4" />
              Transfer
            </Button>
            <Button variant="secondary" onClick={() => setAction('ADJUST')}>
              <ClipboardCheck className="size-4" />
              Count
            </Button>
            <Button variant="secondary" onClick={() => setAction('WASTE')}>
              <Trash2 className="size-4" />
              Waste
            </Button>
            <Button variant="secondary" onClick={() => setReceiving(true)}>
              <PackagePlus className="size-4" />
              Receive
            </Button>
            <Button onClick={() => setAction('ISSUE')}>
              <Undo2 className="size-4" />
              Issue
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="text-ink-900 text-lg font-bold tabular-nums">
            {formatNumber(summary.quantity, 2)}
            <span className="text-ink-400 ml-1 text-sm font-normal">{summary.unit}</span>
          </div>
          <div className="text-ink-500 mt-0.5 text-xs">On hand</div>
        </div>
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <Badge tone={HEALTH_TONE[summary.health]}>{HEALTH_LABELS[summary.health]}</Badge>
          <div className="text-ink-500 mt-1.5 text-xs">Status</div>
        </div>
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="text-ink-900 text-lg font-bold tabular-nums">
            {summary.value > 0 ? formatRs(summary.value) : '—'}
          </div>
          {/*
           * At what was paid, per batch. Today's rate answers what it would
           * cost to replace this, which is a different question — and valuing
           * at it would move the figure every morning when rates are keyed in.
           */}
          <div className="text-ink-500 mt-0.5 text-xs">Value at cost</div>
        </div>
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="text-ink-900 text-lg font-bold tabular-nums">
            {summary.currentRate === null ? '—' : formatRs(summary.currentRate, 2)}
          </div>
          <div className="text-ink-500 mt-0.5 text-xs">Today's rate</div>
        </div>
      </div>

      {/*
       * The level, set here rather than on the Rates screen: it is a stock
       * decision, and this is where somebody looking at a nearly-empty shelf
       * actually is.
       */}
      <section className="border-ink-200 mt-4 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-end gap-3">
          <Field label="Reorder level" htmlFor="reorderLevel">
            <NumberInput
              id="reorderLevel"
              value={level}
              onChange={(event) => setLevelDraft(event.target.value)}
              placeholder="None set"
            />
          </Field>

          <Button
            variant="secondary"
            onClick={() => void saveLevel()}
            loading={setLevel.isPending}
            disabled={levelDraft === null}
          >
            Save
          </Button>
        </div>
      </section>

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Batches</h2>
      {batches.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="No batches yet"
            description="Receive a delivery and it will open a batch here."
            action={<Button onClick={() => setReceiving(true)}>Receive material</Button>}
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 text-right font-semibold">Remaining</th>
                  <th className="px-4 py-3 text-right font-semibold">Of</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className={cn(
                      'border-ink-100 border-b',
                      // An emptied batch stays for its history but is plainly done.
                      batch.quantity <= 0 && 'text-ink-400',
                    )}
                  >
                    <td className="px-4 py-3 font-medium">
                      {batch.batchCode}
                      {batch.reference ? (
                        <span className="text-ink-400 ml-2 text-xs font-normal">
                          {batch.reference}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-500 px-4 py-3 tabular-nums">
                      {formatDate(batch.receivedOn)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatNumber(batch.quantity, 2)}
                    </td>
                    <td className="text-ink-400 px-4 py-3 text-right tabular-nums">
                      {formatNumber(batch.initialQuantity, 2)}
                      {/*
                       * What the delivery note said, when it was in another
                       * unit. This is the whole reason it is stored: a batch
                       * that reads 2,000 kg cannot otherwise be checked against
                       * a note that says 2 tonnes.
                       */}
                      {batch.purchaseUnit ? (
                        <span className="text-ink-400 block text-xs font-normal">
                          {/* Whole tonnes read as "2 ton", not "2.000 ton". */}
                          {formatNumber(
                            batch.purchaseQuantity ?? 0,
                            (batch.purchaseQuantity ?? 0) % 1 === 0 ? 0 : 3,
                          )}{' '}
                          {unitLabel(batch.purchaseUnit)}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-500 px-4 py-3">{batch.location}</td>
                    <td className="text-ink-500 px-4 py-3 text-right tabular-nums">
                      {batch.ratePerUnit === null ? '—' : formatRs(batch.ratePerUnit, 2)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {batch.value > 0 ? formatRs(batch.value) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Stock movement history</h2>
      {movements.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Nothing has moved yet"
            description="Receipts and issues appear here."
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">What</th>
                  <th className="px-4 py-3 font-semibold">Change</th>
                  <th className="px-4 py-3 font-semibold">Against</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                  <th className="px-4 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-ink-100 border-b">
                    <td className="text-ink-500 px-4 py-3 text-xs whitespace-nowrap">
                      {formatWhen(movement.createdAt)}
                    </td>
                    <td className="text-ink-800 px-4 py-3">
                      {MOVEMENT_LABELS[movement.kind]}
                      <span className="text-ink-400 ml-2 text-xs">{movement.batchCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <MovementQuantity movement={movement} unit={summary.unit} />
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {movement.jobName ?? movement.reference ?? ''}
                      {movement.notes ? (
                        <span className="text-ink-400">
                          {movement.jobName || movement.reference ? ' · ' : ''}
                          {movement.notes}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                      {formatNumber(movement.balanceAfter, 2)}
                    </td>
                    <td className="text-ink-400 px-4 py-3 text-xs">{movement.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ReceiveStockModal
        open={receiving}
        onClose={() => setReceiving(false)}
        materialId={summary.materialId}
      />
      <StockActionModal action={action} stock={data} jobs={[]} onClose={() => setAction(null)} />
    </div>
  );
}
