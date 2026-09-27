import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageCheck, Plus, Search, Truck } from 'lucide-react';
import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUSES,
  formatNumber,
  formatRs,
  type DispatchStatus,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { useDispatches, useReadyToSend } from '../api/dispatch-api';

const TONE: Record<DispatchStatus, 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  DISPATCHED: 'success',
  CANCELLED: 'warning',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/** One figure across the top. Coloured only when it is asking for something. */
function Stat({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border bg-white px-4 py-3',
        alarm ? 'border-danger-200' : 'border-ink-200',
      )}
    >
      <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-xl font-bold tabular-nums',
          alarm ? 'text-danger-600' : 'text-ink-900',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * **Dispatch: what left the building, and what is still waiting to.**
 *
 * Two lists, and the order they are in is the point. The **godown** comes first —
 * finished goods standing on the floor — because that is what somebody is here to
 * act on. The notes themselves come second: a record, read when a customer rings.
 *
 * Nothing in the godown list is stored. It is what the finished job cards made,
 * less what the posted notes have taken out, so there is no "ready to dispatch"
 * flag anybody has to remember to tick — which is the flag that would be wrong
 * by Thursday.
 */
export default function DispatchPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'dispatch');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      ...(debounced ? { q: debounced } : {}),
      ...(status ? { status: status as DispatchStatus } : {}),
    }),
    [debounced, status],
  );

  const { data, isLoading } = useDispatches(params);
  const { data: queue } = useReadyToSend();

  const notes = data?.items ?? [];
  const totals = data?.totals;
  const ready = queue ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Dispatch</h1>
          <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
            What has left the works and on whose lorry. One note is one lorry to one customer, with
            a line per order aboard — and sending the last of an order is what completes it.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => navigate('/dispatch/new')}>
            <Plus className="size-4" />
            New note
          </Button>
        ) : null}
      </header>

      {totals ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="In the godown" value={`${formatNumber(totals.readyKg, 0)} kg`} />
          <Stat label="Orders ready" value={String(totals.ordersReadyToSend)} />
          <Stat
            label="Past due"
            value={String(totals.overdueOrders)}
            alarm={totals.overdueOrders > 0}
          />
          <Stat
            label="Sent this month"
            value={`${formatNumber(totals.dispatchedThisMonthKg, 0)} kg`}
          />
        </div>
      ) : null}

      {/*
        The queue somebody is actually here for. Capped at what fits on a screen
        — the rest is one click away on the note form, which is where they are
        going anyway.
      */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-ink-900 flex items-center gap-2 text-base font-semibold">
            <PackageCheck className="text-ink-400 size-4" />
            Waiting to go
          </h2>
          {totals && totals.drafts > 0 ? (
            <span className="text-ink-500 text-sm">
              {totals.drafts} draft{totals.drafts === 1 ? '' : 's'} not yet sent
            </span>
          ) : null}
        </div>

        {ready.length === 0 ? (
          <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
            <EmptyState
              title="Nothing is waiting to go"
              description="An order turns up here once a job card against it is finished. Until something has been made, there is nothing to send."
            />
          </div>
        ) : (
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Order</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                    <th className="px-4 py-2.5 text-right font-medium">Made</th>
                    <th className="px-4 py-2.5 text-right font-medium">Gone</th>
                    <th className="px-4 py-2.5 text-right font-medium">In the godown</th>
                    <th className="px-4 py-2.5 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {ready.slice(0, 12).map((row) => (
                    <tr
                      key={row.orderId}
                      onClick={() =>
                        canEdit
                          ? navigate(
                              `/dispatch/new${row.customerId ? `?customerId=${row.customerId}` : ''}`,
                            )
                          : navigate(`/orders/${row.orderId}`)
                      }
                      className="hover:bg-ink-25 cursor-pointer"
                    >
                      <td className="text-ink-900 px-4 py-2.5 font-medium tabular-nums">
                        #{row.orderNumber}
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">{row.customerName}</td>
                      <td className="text-ink-700 px-4 py-2.5">{row.jobName}</td>
                      <td className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                        {formatNumber(row.orderedKg, 0)}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                        {formatNumber(row.producedKg, 0)}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                        {row.dispatchedKg > 0 ? formatNumber(row.dispatchedKg, 0) : '—'}
                      </td>
                      <td className="text-ink-900 px-4 py-2.5 text-right font-semibold tabular-nums">
                        {formatNumber(row.readyKg, 3)} kg
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {row.dueDate ? (
                          row.isOverdue ? (
                            <Badge tone="danger">{formatDate(row.dueDate)}</Badge>
                          ) : (
                            <span className="text-ink-500">{formatDate(row.dueDate)}</span>
                          )
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ready.length > 12 ? (
              <div className="border-ink-200 text-ink-500 border-t px-4 py-2 text-xs">
                and {ready.length - 12} more — all of it is on the note form
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-ink-900 mb-3 flex items-center gap-2 text-base font-semibold">
          <Truck className="text-ink-400 size-4" />
          Dispatch notes
        </h2>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Customer, job, vehicle, LR or note number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search dispatch notes"
            />
          </div>
          <div className="sm:w-48">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="">Every status</option>
              {DISPATCH_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {DISPATCH_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <LoadingState label="Loading dispatch notes…" />
        ) : notes.length === 0 ? (
          <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
            <EmptyState
              title={search || status ? 'Nothing matches that' : 'No notes yet'}
              description={
                search || status
                  ? 'Try a different search, or clear the status filter.'
                  : 'Raise one when a lorry is being loaded. It saves as a draft until it actually goes.'
              }
              action={
                !search && !status && canEdit ? (
                  <Button variant="secondary" onClick={() => navigate('/dispatch/new')}>
                    <Plus className="size-4" />
                    New note
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Note</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Vehicle</th>
                    <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-4 py-2.5 text-right font-medium">Weight</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {notes.map((note) => (
                    <tr
                      key={note.id}
                      onClick={() => navigate(`/dispatch/${note.id}`)}
                      className="hover:bg-ink-25 cursor-pointer"
                    >
                      <td className="text-ink-900 px-4 py-2.5 font-medium tabular-nums">
                        #{note.number}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs whitespace-nowrap">
                        {formatDate(note.dispatchDate)}
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">{note.customerName}</td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs">
                        {note.vehicleNumber || <span className="text-ink-300">not yet</span>}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                        {note.lineCount}
                      </td>
                      <td className="text-ink-900 px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatNumber(note.totalKg, 0)} kg
                      </td>
                      <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                        {formatRs(note.totalValue)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={TONE[note.status]}>
                          {DISPATCH_STATUS_LABELS[note.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
