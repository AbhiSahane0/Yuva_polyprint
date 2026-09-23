import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { useOrders } from '../api/order-api';

/* Cancelled reads as a warning rather than a failure, which is the tone a lost
   quotation already carries — it ended, and somebody should notice, but it is
   not an error the screen is reporting. */
const TONE: Record<OrderStatus, 'neutral' | 'brand' | 'success' | 'warning'> = {
  CONFIRMED: 'neutral',
  IN_PRODUCTION: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'warning',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * How late, in plain words.
 *
 * A date on its own makes somebody do the arithmetic every time they read the
 * row, and the answer they actually want is "is this a problem". Only asked of
 * an order still open — a completed one was due whenever it was due, and
 * telling the office it is 40 days late is both true and useless.
 */
function due(order: Order): { text: string; late: boolean } | null {
  if (!order.dueDate) return null;
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return { text: formatDate(order.dueDate), late: false };
  }
  const days = Math.round(
    (Date.parse(`${order.dueDate}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return { text: `${formatDate(order.dueDate)} · ${-days}d late`, late: true };
  if (days === 0) return { text: `${formatDate(order.dueDate)} · today`, late: false };
  if (days <= 7) return { text: `${formatDate(order.dueDate)} · in ${days}d`, late: false };
  return { text: formatDate(order.dueDate), late: false };
}

/**
 * **Orders: what the customer actually asked for.**
 *
 * A quotation is an offer and a job sheet is a post-mortem. This is the thing
 * in between that neither of them is — a commitment, with a quantity, a rate, a
 * date it is wanted by and a place it has got to.
 *
 * Ordered by what is open and soonest due, not by number. A list ordered by
 * number puts the oldest order at the bottom on the day it goes late, which is
 * the one morning anybody needs to see it.
 */
export default function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(status ? { status: status as OrderStatus } : {}),
    }),
    [debounced, status],
  );

  const { data, isLoading } = useOrders(params);
  const orders = data?.items ?? [];

  const open = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'IN_PRODUCTION');
  const late = open.filter((o) => due(o)?.late).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Orders</h1>
          <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
            What the customer has committed to — the quantity, the rate agreed and the day it is
            wanted. A won quotation raises one of these per job; anything taken over the phone is
            typed here.
          </p>
        </div>
        <Button onClick={() => navigate('/orders/new')}>
          <Plus className="size-4" />
          New order
        </Button>
      </header>

      {/*
        Two figures, because they are the two questions asked of this screen
        every morning: how much is on, and how much of it is late. Late is the
        one that changes what anybody does today, so it earns its own colour
        only when there is some.
      */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3">
          <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">Open</div>
          <div className="text-ink-900 mt-0.5 text-xl font-bold tabular-nums">{open.length}</div>
        </div>
        <div
          className={cn(
            'rounded-[var(--radius-lg)] border bg-white px-4 py-3',
            late > 0 ? 'border-danger-200' : 'border-ink-200',
          )}
        >
          <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">Past due</div>
          <div
            className={cn(
              'mt-0.5 text-xl font-bold tabular-nums',
              late > 0 ? 'text-danger-600' : 'text-ink-900',
            )}
          >
            {late}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Customer, job, PO number or order number…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search orders"
          />
        </div>
        <div className="sm:w-52">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">Every status</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading orders…" />
      ) : orders.length === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={search || status ? 'Nothing matches that' : 'No orders yet'}
            description={
              search || status
                ? 'Try a different search, or clear the status filter.'
                : 'Win a quotation and its jobs arrive here as orders, or type one for repeat business.'
            }
            action={
              search || status ? undefined : (
                <Button variant="secondary" onClick={() => navigate('/orders/new')}>
                  <Plus className="size-4" />
                  New order
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {orders.map((order) => {
                  const when = due(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="hover:bg-ink-25 cursor-pointer"
                    >
                      <td className="text-ink-900 px-4 py-2.5 font-medium tabular-nums">
                        #{order.number}
                        {order.quotationNumber !== null ? (
                          <span className="text-ink-400 ml-1.5 text-xs font-normal">
                            from Q{order.quotationNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">{order.customerName}</td>
                      <td className="text-ink-700 px-4 py-2.5">{order.jobName}</td>
                      <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                        {formatNumber(order.quantityKg, 0)} kg
                      </td>
                      <td className="text-ink-900 px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatRs(order.amount)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-xs whitespace-nowrap',
                          when?.late ? 'text-danger-600 font-medium' : 'text-ink-500',
                        )}
                      >
                        {when ? when.text : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
