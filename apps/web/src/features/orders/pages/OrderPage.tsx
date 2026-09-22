import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
  canMoveOrderTo,
  formatNumber,
  formatRs,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Field, Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useDeleteOrder, useOrder, useUpdateOrder } from '../api/order-api';

const TONE: Record<OrderStatus, 'neutral' | 'brand' | 'success' | 'warning'> = {
  CONFIRMED: 'neutral',
  IN_PRODUCTION: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'warning',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="text-ink-900 mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/**
 * **One order: what was agreed, and where it has got to.**
 *
 * The status is a dropdown of only the places it may actually go — see
 * `canMoveOrderTo`. Offering every status and refusing four of them on save
 * teaches the office to expect errors; offering two teaches them the rule.
 */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'quotations');

  const { data: order, isPending, isError } = useOrder(id ?? null);
  const update = useUpdateOrder();
  const remove = useDeleteOrder();

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (isPending) return <LoadingState label="Loading the order…" />;
  if (isError || !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="That order is not on record"
          description="It may have been deleted."
          action={
            <Button variant="secondary" onClick={() => navigate('/orders')}>
              Back to orders
            </Button>
          }
        />
      </div>
    );
  }

  const ended = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  /*
   * Where it can go FROM here — not including where it already is.
   *
   * `canMoveOrderTo` allows staying put, because a PATCH that changes only the
   * due date resends the status it already has. A button offering to mark a
   * confirmed order confirmed is that rule leaking onto the screen.
   *
   * Cancelling is left out because it asks for a reason, so it has its own
   * button and its own dialog.
   */
  const nextStatuses = ORDER_STATUSES.filter(
    (status) =>
      status !== 'CANCELLED' && status !== order.status && canMoveOrderTo(order.status, status),
  );

  async function move(status: OrderStatus, cancelledReason?: string) {
    try {
      await update.mutateAsync({ id: order!.id, input: { status, cancelledReason } });
      toast.success(`Order #${order!.number} is now ${ORDER_STATUS_LABELS[status].toLowerCase()}`);
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  async function patch(input: Partial<Order>) {
    try {
      await update.mutateAsync({ id: order!.id, input });
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate('/orders')}
        className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Orders
      </button>

      {/*
        A row at every width, not a stack below `sm`.

        Stacking put the menu button on its own line under the title, left
        aligned, with the sheet opening rightwards from it into empty space. The
        actions belong beside the thing they act on — and the title block
        shrinks (`min-w-0`) and wraps instead, which is what should give.
      */}
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Order #{order.number}</h1>
            <Badge tone={TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
          </div>
          <p className="text-ink-500 mt-0.5 text-sm">
            {order.customerName} · {order.jobName}
            {order.quotationNumber !== null ? ` · from quotation #${order.quotationNumber}` : null}
          </p>
        </div>

        {canEdit && !ended ? (
          <>
            {/*
              One row on a desktop, one button on a phone.

              Three actions wrapped onto two lines at desktop width, which read
              as two groups when they are one. `flex-nowrap` with the title
              block allowed to shrink (`min-w-0`) keeps them together; the
              labels never wrap mid-word.

              Below `sm` the same three go behind a menu. Stacked full-width
              they pushed the order's own figures — the quantity, the rate, the
              amount — off the first screen, and the page is read far more often
              than it is acted on.
            */}
            <div className="hidden shrink-0 items-center gap-2 sm:flex sm:flex-nowrap">
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  variant={status === 'COMPLETED' ? 'primary' : 'secondary'}
                  loading={update.isPending}
                  onClick={() => void move(status)}
                  className="whitespace-nowrap"
                >
                  Mark {ORDER_STATUS_LABELS[status].toLowerCase()}
                </Button>
              ))}
              <Button
                variant="dangerGhost"
                className="whitespace-nowrap"
                onClick={() => setCancelling(true)}
              >
                Cancel order
              </Button>
            </div>

            <ActionMenu
              className="sm:hidden"
              label={`Actions for order ${order.number}`}
              actions={[
                ...nextStatuses.map((status) => ({
                  label: `Mark ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
                  onSelect: () => void move(status),
                })),
                { label: 'Cancel order', danger: true, onSelect: () => setCancelling(true) },
              ]}
            />
          </>
        ) : null}
      </header>

      {/* What was agreed. Read-only figures, because changing what a customer
          committed to is a correction rather than an edit — the two the office
          genuinely revises are below. */}
      <section className="border-ink-200 mb-5 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 className="text-ink-800 mb-3 text-xs font-semibold tracking-wider uppercase">
          What was agreed
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Quantity">
            <span className="tabular-nums">{formatNumber(order.quantityKg, 3)} kg</span>
            {order.quantityPouches > 0 ? (
              <div className="text-ink-500 text-xs tabular-nums">
                {formatNumber(order.quantityPouches, 0)} pouches
              </div>
            ) : null}
          </Fact>
          <Fact label="Rate">
            <span className="tabular-nums">{formatRs(order.ratePerKg, 2)}/kg</span>
            {order.ratePerPouch > 0 ? (
              <div className="text-ink-500 text-xs tabular-nums">
                {formatRs(order.ratePerPouch, 4)} each
              </div>
            ) : null}
          </Fact>
          <Fact label="Amount">
            <span className="font-semibold tabular-nums">{formatRs(order.amount)}</span>
          </Fact>
          <Fact label="Ordered">{formatDate(order.orderDate)}</Fact>
        </div>
      </section>

      <section className="border-ink-200 mb-5 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 className="text-ink-800 mb-3 text-xs font-semibold tracking-wider uppercase">
          Theirs to chase us on
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Due" htmlFor="dueDate" hint="Blank while nobody has promised one">
            <Input
              id="dueDate"
              type="date"
              defaultValue={order.dueDate ?? ''}
              disabled={!canEdit || ended}
              onBlur={(event) =>
                event.target.value !== (order.dueDate ?? '') &&
                void patch({ dueDate: event.target.value || null })
              }
            />
          </Field>
          <Field
            label="Their PO number"
            htmlFor="customerPoNumber"
            hint="What they quote back on the phone"
          >
            <Input
              id="customerPoNumber"
              defaultValue={order.customerPoNumber}
              disabled={!canEdit || ended}
              onBlur={(event) =>
                event.target.value.trim() !== order.customerPoNumber &&
                void patch({ customerPoNumber: event.target.value.trim() })
              }
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Input
              id="notes"
              defaultValue={order.notes}
              disabled={!canEdit || ended}
              onBlur={(event) =>
                event.target.value.trim() !== order.notes &&
                void patch({ notes: event.target.value.trim() })
              }
            />
          </Field>
        </div>
      </section>

      {order.status === 'CANCELLED' ? (
        <section className="border-warning-200 bg-warning-50 mb-5 rounded-[var(--radius-lg)] border p-4">
          <h2 className="text-warning-700 text-xs font-semibold tracking-wider uppercase">
            Cancelled {formatDate(order.cancelledAt?.slice(0, 10) ?? null)}
          </h2>
          <p className="text-warning-700 mt-1 text-sm">
            {order.cancelledReason || 'No reason was recorded.'}
          </p>
        </section>
      ) : null}

      {canEdit && order.status === 'CONFIRMED' ? (
        <div className="border-ink-200 flex justify-end border-t pt-4">
          {/* Only while nobody has started it. Once a run is behind it, a
              deleted order is a run nothing explains — cancelling says the same
              thing and keeps the record. */}
          <Button variant="dangerGhost" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            Delete this order
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={cancelling}
        title={`Cancel order #${order.number}?`}
        confirmLabel="Cancel the order"
        loading={update.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={() => {
          void move('CANCELLED', reason.trim());
          setCancelling(false);
          setReason('');
        }}
      >
        It stops being counted as open work. The record stays, with the reason — &ldquo;we cancelled
        it&rdquo; teaches nothing a year later, and the reason does.
        <div className="mt-3">
          <Field label="Why" htmlFor="cancelReason">
            <Input
              id="cancelReason"
              autoFocus
              value={reason}
              placeholder="Customer changed the spec"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        title={`Delete order #${order.number}?`}
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          remove.mutate(order.id, {
            onSuccess: () => {
              toast.success(`Order #${order.number} deleted`);
              navigate('/orders');
            },
            onError: (caught) =>
              toast.error(caught instanceof ApiClientError ? caught.message : 'Could not delete'),
            onSettled: () => setDeleting(false),
          });
        }}
      >
        It goes for good, with no record that it was ever raised. If the customer ordered this and
        then changed their mind, <strong>cancel it instead</strong> — that keeps the reason.
      </ConfirmDialog>
    </div>
  );
}
