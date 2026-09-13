import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Truck, X } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  PURCHASE_STATUS_LABELS,
  type PurchaseOrderStatus,
  type Supplier,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useDeleteSupplier, usePurchaseOrders, useSuppliers } from '../api/purchase-api';
import { SupplierModal } from '../components/SupplierModal';
import { NewOrderModal } from '../components/NewOrderModal';

const STATUS_TONE: Record<PurchaseOrderStatus, 'neutral' | 'success' | 'warning' | 'brand'> = {
  ORDERED: 'neutral',
  IN_TRANSIT: 'brand',
  PARTIALLY_RECEIVED: 'brand',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

export default function PurchasePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [newOrder, setNewOrder] = useState(false);
  const [supplier, setSupplier] = useState<string | null | undefined>(undefined);
  /*
   * Deleting is for a supplier nobody ordered from — a name typed wrong. One
   * with an order against them is refused by the server and retired instead,
   * which is the switch on their card.
   */
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const deleteSupplier = useDeleteSupplier();

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      ...(debounced ? { q: debounced } : {}),
      ...(delayedOnly ? { delayedOnly: true } : {}),
    }),
    [debounced, delayedOnly],
  );

  const { data, isPending, isError, error, refetch } = usePurchaseOrders(params);
  const { data: suppliers } = useSuppliers();
  const orders = data?.items ?? [];
  const totals = data?.totals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Purchase &amp; Suppliers</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            What is on order, who it is with, and what has arrived.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSupplier(null)}>
            <Plus className="size-4" />
            Supplier
          </Button>
          <Button onClick={() => setNewOrder(true)}>
            <Plus className="size-4" />
            Purchase order
          </Button>
        </div>
      </header>

      {totals ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Active suppliers" value={formatNumber(totals.activeSuppliers)} />
          <Summary label="Open orders" value={formatNumber(totals.openOrders)} />
          <Summary
            label="Delayed"
            value={formatNumber(totals.delayed)}
            tone={totals.delayed > 0 ? 'warning' : undefined}
            onClick={totals.delayed > 0 ? () => setDelayedOnly(true) : undefined}
          />
          {/*
           * Committed, not spent. Calling ordered-but-undelivered money "spend"
           * makes a cash position look worse than it is; the month's actual
           * spend is what has been accepted, and sits beside it on hover.
           */}
          <Summary
            label="On order"
            value={formatRs(totals.outstandingValue)}
            title={`${formatRs(totals.spendThisMonth)} accepted into stock this month`}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {delayedOnly ? (
          <button
            type="button"
            onClick={() => setDelayedOnly(false)}
            className="border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100 inline-flex cursor-pointer items-center gap-1 self-start rounded-full border px-3 py-1 text-xs font-medium"
          >
            Delayed only
            <X className="size-3" />
          </button>
        ) : null}
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="PO number or supplier…"
            className="pl-9"
            aria-label="Search purchase orders"
          />
        </div>
      </div>

      <h2 className="text-ink-900 mt-7 mb-3 text-base font-semibold">Purchase orders</h2>
      {isError ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Could not load orders"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </section>
      ) : isPending ? (
        <LoadingState label="Loading orders…" />
      ) : orders.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={delayedOnly ? 'Nothing is late' : 'No purchase orders yet'}
            description={
              delayedOnly
                ? 'Every open order is inside its expected date.'
                : 'Raise one and it will appear here, ready to receive against.'
            }
            action={
              delayedOnly ? undefined : (
                <Button onClick={() => setNewOrder(true)}>Purchase order</Button>
              )
            }
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">PO</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold">Lines</th>
                  <th className="px-4 py-3 text-right font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Ordered</th>
                  <th className="px-4 py-3 font-semibold">Expected</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-ink-100 hover:bg-ink-25 cursor-pointer border-b"
                    onClick={() => navigate(`/purchase/${order.id}`)}
                  >
                    <td className="text-ink-900 px-4 py-3 font-semibold tabular-nums">
                      PO-{order.number}
                    </td>
                    <td className="text-ink-800 px-4 py-3">{order.supplierName}</td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {order.lineCount}
                    </td>
                    <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                      {formatRs(order.total)}
                    </td>
                    <td className="text-ink-500 px-4 py-3 tabular-nums">
                      {formatDate(order.orderedOn)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 tabular-nums',
                        order.isDelayed ? 'text-warning-600 font-medium' : 'text-ink-500',
                      )}
                    >
                      {order.expectedOn ? formatDate(order.expectedOn) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[order.status]}>
                          {PURCHASE_STATUS_LABELS[order.status]}
                        </Badge>
                        {/*
                         * Late is its own badge rather than a status, because it
                         * is orthogonal: an order can be part received and late.
                         * Folding them into one label would hide whichever the
                         * office needed to see.
                         */}
                        {order.isDelayed ? <Badge tone="warning">Delayed</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Suppliers</h2>
      {!suppliers || suppliers.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="No suppliers yet"
            description="Add one and it can be ordered from."
            action={<Button onClick={() => setSupplier(null)}>Add a supplier</Button>}
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Supplies</th>
                  <th className="px-4 py-3 font-semibold">Last rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Open</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((row) => (
                  <tr
                    key={row.id}
                    className="border-ink-100 hover:bg-ink-25 cursor-pointer border-b"
                    onClick={() => setSupplier(row.id)}
                  >
                    <td className="text-ink-900 px-4 py-3 font-medium">{row.name}</td>
                    {/*
                     * What they supply and what they last charged come from the
                     * orders placed with them. A stored list would be one
                     * somebody has to maintain, and would be wrong.
                     */}
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {row.materials.length > 0 ? row.materials.join(', ') : '—'}
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-xs tabular-nums">
                      {row.lastRate
                        ? `${formatRs(row.lastRate.ratePerUnit)}/${row.lastRate.unit}`
                        : '—'}
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {row.openOrders > 0 ? row.openOrders : '—'}
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {[row.contactPerson, row.mobile].filter((v) => v && v !== 'NA').join(' · ') ||
                        '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        /* The row opens their card. Without this, deleting
                           would open the thing being deleted first. */
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleting(row);
                        }}
                        aria-label={`Delete ${row.name}`}
                        title="Delete — only a supplier nobody has ordered from"
                        className="text-ink-400 hover:bg-danger-50 hover:text-danger-600 cursor-pointer rounded-[var(--radius-md)] p-2"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <NewOrderModal open={newOrder} onClose={() => setNewOrder(false)} />
      <SupplierModal
        supplierId={supplier}
        onClose={() => setSupplier(undefined)}
        suppliers={suppliers ?? []}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete"
        loading={deleteSupplier.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteSupplier.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(`${deleting.name} deleted`);
              setDeleting(null);
            },
            onError: (cause) =>
              toast.error(
                cause instanceof ApiClientError ? cause.message : 'Could not delete that supplier',
              ),
          });
        }}
      >
        {deleting && deleting.orderCount > 0 ? (
          <>
            They are on {deleting.orderCount}{' '}
            {deleting.orderCount === 1 ? 'purchase order' : 'purchase orders'}, so this will be
            refused — an order has to stay able to say who it was placed with. Retire them instead,
            on their card: they leave the form and the orders keep their name.
          </>
        ) : (
          'They go for good. Nobody has ordered from them, so no order loses its supplier.'
        )}
      </ConfirmDialog>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  onClick,
  title,
}: {
  label: string;
  value: string;
  tone?: 'warning';
  onClick?: (() => void) | undefined;
  title?: string;
}) {
  const content = (
    <>
      <div
        className={cn(
          'text-lg font-bold tabular-nums',
          tone === 'warning' ? 'text-warning-600' : 'text-ink-900',
        )}
      >
        {value}
      </div>
      <div className="text-ink-500 mt-0.5 flex items-center gap-1 text-xs">
        {label}
        {label === 'Delayed' && tone === 'warning' ? (
          <Truck className="size-3" aria-hidden />
        ) : null}
      </div>
    </>
  );

  const className =
    'border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 text-left shadow-[var(--shadow-card)]';

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(className, 'hover:bg-ink-25 cursor-pointer')}
    >
      {content}
    </button>
  ) : (
    <div className={className} title={title}>
      {content}
    </div>
  );
}
