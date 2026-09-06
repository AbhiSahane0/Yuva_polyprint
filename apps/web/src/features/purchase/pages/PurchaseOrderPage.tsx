import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, PackageCheck } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  PURCHASE_STATUS_LABELS,
  unitLabel,
  type PurchaseOrderLine,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Select } from '@/components/ui/Field';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useClosePurchaseLine,
  usePurchaseOrder,
  useUpdatePurchaseOrder,
} from '../api/purchase-api';
import { ReceiveLineModal } from '../components/ReceiveLineModal';

const STATUS_TONE = {
  ORDERED: 'neutral',
  IN_TRANSIT: 'brand',
  PARTIALLY_RECEIVED: 'brand',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
} as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isPending, isError, error, refetch } = usePurchaseOrder(id ?? null);
  const update = useUpdatePurchaseOrder(id ?? '');
  const close = useClosePurchaseLine();
  const [receiving, setReceiving] = useState<PurchaseOrderLine | null>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Could not load this order"
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

  if (isPending || !order) return <LoadingState label="Loading order…" className="mt-8" />;

  /*
   * Only the three the office decides, and only while nothing has arrived.
   * Once there are deliveries the status follows them, and offering the choice
   * would let an order be marked "ordered" with stock already against it.
   */
  const arrived = order.status === 'PARTIALLY_RECEIVED' || order.status === 'RECEIVED';

  async function closeLine(line: PurchaseOrderLine) {
    const reason = window.prompt(
      `Close the remaining ${formatNumber(line.outstanding, 2)} ${unitLabel(line.unit)} of ${line.materialName}?\n\nWhy is the rest not coming?`,
    );
    if (!reason || reason.trim().length < 3) return;
    try {
      await close.mutateAsync({ lineId: line.id, reason: reason.trim() });
      toast.success('Line closed');
    } catch {
      toast.error('Could not close the line');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <Link
          to="/purchase"
          className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Purchase
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">PO-{order.number}</h1>
            <p className="text-ink-500 mt-0.5 text-sm">
              {order.supplierName} · ordered {formatDate(order.orderedOn)}
              {order.expectedOn ? ` · expected ${formatDate(order.expectedOn)}` : ''} · raised by{' '}
              {order.raisedBy}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[order.status]}>{PURCHASE_STATUS_LABELS[order.status]}</Badge>
            {order.isDelayed ? <Badge tone="warning">Delayed</Badge> : null}
            {!arrived ? (
              <div className="w-40">
                <Select
                  aria-label="Order status"
                  value={order.status}
                  onChange={async (event) => {
                    try {
                      await update.mutateAsync({
                        status: event.target.value as 'ORDERED' | 'IN_TRANSIT' | 'CANCELLED',
                      });
                      toast.success('Status updated');
                    } catch {
                      toast.error('Could not update the status');
                    }
                  }}
                >
                  <option value="ORDERED">Ordered</option>
                  <option value="IN_TRANSIT">In transit</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Order value" value={formatRs(order.total)} />
        <Card label="Accepted so far" value={formatRs(order.receivedValue)} />
        <Card label="Still on order" value={formatRs(order.total - order.receivedValue)} />
        <Card label="Lines" value={String(order.lineCount)} />
      </div>

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Lines</h2>
      <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                <th className="px-4 py-3 font-semibold">Material</th>
                <th className="px-4 py-3 text-right font-semibold">Ordered</th>
                <th className="px-4 py-3 text-right font-semibold">Accepted</th>
                <th className="px-4 py-3 text-right font-semibold">Rejected</th>
                <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                <th className="px-4 py-3 text-right font-semibold">Value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-ink-100 border-b">
                  <td className="text-ink-900 px-4 py-3 font-medium">
                    {line.materialName}
                    <span className="text-ink-400 ml-2 text-xs font-normal">
                      {formatRs(line.ratePerUnit)}/{unitLabel(line.unit)}
                    </span>
                    {line.closedAt ? (
                      <span className="text-ink-400 block text-xs font-normal">
                        Closed — {line.closedReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-ink-700 px-4 py-3 text-right tabular-nums">
                    {formatNumber(line.quantity, 2)} {unitLabel(line.unit)}
                  </td>
                  <td className="text-success-600 px-4 py-3 text-right font-medium tabular-nums">
                    {line.acceptedQuantity > 0 ? formatNumber(line.acceptedQuantity, 2) : '—'}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums',
                      line.rejectedQuantity > 0 ? 'text-danger-600 font-medium' : 'text-ink-300',
                    )}
                  >
                    {line.rejectedQuantity > 0 ? formatNumber(line.rejectedQuantity, 2) : '—'}
                  </td>
                  <td className="text-ink-700 px-4 py-3 text-right tabular-nums">
                    {line.settled ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      formatNumber(line.outstanding, 2)
                    )}
                  </td>
                  <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                    {formatRs(line.total)}
                  </td>
                  <td className="px-4 py-3">
                    {line.settled || order.status === 'CANCELLED' ? null : (
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReceiving(line)}
                          className="border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100 inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium"
                        >
                          <PackageCheck className="size-3.5" />
                          Receive
                        </button>
                        {/*
                         * A supplier who will not send the balance leaves a
                         * line that is neither open nor complete. Without this
                         * it sits on the pending list forever, and a pending
                         * list with permanent residents stops being read.
                         */}
                        <button
                          type="button"
                          onClick={() => void closeLine(line)}
                          title="Nothing more is coming"
                          className="border-ink-200 text-ink-600 hover:bg-ink-50 inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border bg-white px-2.5 py-1 text-xs font-medium"
                        >
                          <Ban className="size-3.5" />
                          Close
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Deliveries</h2>
      {order.receipts.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Nothing has arrived yet"
            description="Receiving a line records the delivery and puts the accepted stock into inventory."
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Delivered</th>
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 text-right font-semibold">Accepted</th>
                  <th className="px-4 py-3 text-right font-semibold">Rejected</th>
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {order.receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-ink-100 border-b">
                    <td className="text-ink-500 px-4 py-3 tabular-nums">
                      {formatDate(receipt.receivedOn)}
                    </td>
                    <td className="text-ink-800 px-4 py-3">{receipt.materialName}</td>
                    <td className="text-success-600 px-4 py-3 text-right font-medium tabular-nums">
                      {receipt.acceptedQuantity > 0
                        ? `${formatNumber(receipt.acceptedQuantity, 2)} ${unitLabel(receipt.unit)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {receipt.rejectedQuantity > 0 ? (
                        <span className="text-danger-600 font-medium tabular-nums">
                          {formatNumber(receipt.rejectedQuantity, 2)}
                          <span className="text-ink-400 block text-xs font-normal">
                            {receipt.rejectionReason}
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    {/*
                     * The batch this became. It is the join to inventory made
                     * visible: a delivery that created stock names it, and one
                     * that was turned away has nothing to name.
                     */}
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {receipt.batchCode ?? <span className="text-ink-300">no stock created</span>}
                    </td>
                    <td className="text-ink-400 px-4 py-3 text-xs">{receipt.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ReceiveLineModal line={receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="text-ink-900 text-lg font-bold tabular-nums">{value}</div>
      <div className="text-ink-500 mt-0.5 text-xs">{label}</div>
    </div>
  );
}
