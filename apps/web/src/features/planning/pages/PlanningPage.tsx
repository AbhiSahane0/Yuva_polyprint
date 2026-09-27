import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Factory, Search } from 'lucide-react';
import {
  formatNumber,
  PLANNING_STATUS_LABELS,
  PLANNING_STATUSES,
  type PlanningRow,
  type PlanningStatus,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { PlanModal } from '../components/PlanModal';
import { useMachineLoad, usePlanningBoard } from '../api/planning-api';

const TONE: Record<PlanningStatus, 'danger' | 'neutral' | 'brand' | 'success'> = {
  BLOCKED: 'danger',
  READY: 'neutral',
  SCHEDULED: 'brand',
  STARTED: 'success',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

function Stat({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border bg-white px-4 py-3',
        alarm && value > 0 ? 'border-danger-200' : 'border-ink-200',
      )}
    >
      <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-xl font-bold tabular-nums',
          alarm && value > 0 ? 'text-danger-600' : 'text-ink-900',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** What the material column says, in the fewest words that are still true. */
function MaterialCell({ row }: { row: PlanningRow }) {
  if (row.cardId) return <span className="text-ink-400 text-xs">claimed by the card</span>;
  if (row.materialUnknown) {
    return (
      <span
        className="text-ink-400 text-xs"
        title="This order was not priced from a quotation, so there is no structure to work a requirement out of. Check the stock by hand."
      >
        not priced — check by hand
      </span>
    );
  }
  if (row.shortOf.length === 0) return <Badge tone="success">Film in</Badge>;
  return (
    <span
      className="text-danger-700 text-xs font-medium"
      title={row.materials
        .filter((line) => line.shortBy > 0)
        .map((line) => `${line.name}: short ${formatNumber(line.shortBy, 3)} kg`)
        .join('\n')}
    >
      Short of {row.shortOf.length === 1 ? row.shortOf[0] : `${row.shortOf.length} materials`}
    </span>
  );
}

/**
 * **Planning — the gate between an order and the floor.**
 *
 * Two questions, and the board is laid out to answer them in the order they
 * are asked: *can it run*, and *when does it run and on what*.
 *
 * Worst first. An order short of film sorts above everything, whatever its
 * date, because it is the only row on the screen that somebody can still do
 * something about this morning. A board sorted by order number buries it.
 *
 * Nothing here is a status anybody sets. The film check is the job card's own,
 * asked early; the estimate is the works' own figures; whether a plan makes its
 * date is arithmetic. The only stored facts on the whole screen are the date
 * and the machine somebody chose.
 */
export default function PlanningPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canPlan = canAccess(user, 'jobs');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [planning, setPlanning] = useState<PlanningRow | null>(null);
  const debounced = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      ...(debounced ? { q: debounced } : {}),
      ...(status ? { status: status as PlanningStatus } : {}),
    }),
    [debounced, status],
  );

  const { data, isLoading } = usePlanningBoard(params);
  const { data: load } = useMachineLoad();

  const rows = data?.items ?? [];
  const totals = data?.totals;
  const booked = (load ?? []).filter((machine) => machine.orders.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Planning</h1>
        <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
          The gate between an order and the floor: whether the film is in, when the job is meant to
          start, and which machine it is booked onto. Nothing here holds any stock — the job card
          still does the claiming.
        </p>
      </header>

      {totals ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Short of material" value={totals.blocked} alarm />
          <Stat label="Ready to schedule" value={totals.ready} />
          <Stat label="Scheduled" value={totals.scheduled} />
          <Stat label="Landing late" value={totals.landingLate} alarm />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Customer, job, PO number or order number…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search planning"
          />
        </div>
        <div className="sm:w-52">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">Everything open</option>
            {PLANNING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PLANNING_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Working out what can run…" />
      ) : rows.length === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={search || status ? 'Nothing matches that' : 'Nothing waiting to be planned'}
            description={
              search || status
                ? 'Try a different search, or clear the status filter.'
                : 'Orders appear here as soon as they are confirmed, and drop off once the floor has a card for them.'
            }
          />
        </div>
      ) : (
        <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2.5 font-medium">Material</th>
                  <th className="px-4 py-2.5 font-medium">Starts</th>
                  <th className="px-4 py-2.5 font-medium">Machine</th>
                  <th className="px-4 py-2.5 font-medium">Off by / due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {rows.map((row) => (
                  <tr
                    key={row.orderId}
                    onClick={() =>
                      canPlan && !row.cardId ? setPlanning(row) : navigate(`/orders/${row.orderId}`)
                    }
                    className={cn(
                      'hover:bg-ink-25 cursor-pointer',
                      row.status === 'BLOCKED' && 'bg-danger-50/30',
                    )}
                  >
                    <td className="text-ink-900 px-4 py-2.5 font-medium tabular-nums">
                      #{row.orderNumber}
                      <div className="text-ink-400 text-xs font-normal">{row.customerName}</div>
                    </td>
                    <td className="text-ink-700 px-4 py-2.5">
                      {row.jobName}
                      {row.planNote ? (
                        <div className="text-ink-400 text-xs italic">{row.planNote}</div>
                      ) : null}
                    </td>
                    <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(row.quantityKg, 0)} kg
                      <div className="text-ink-400 text-xs">~{row.estimateDays}d</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <MaterialCell row={row} />
                    </td>
                    <td className="text-ink-700 px-4 py-2.5 text-xs whitespace-nowrap">
                      {row.plannedStart ? (
                        formatDate(row.plannedStart)
                      ) : (
                        <span className="text-ink-300">not dated</span>
                      )}
                    </td>
                    <td className="text-ink-700 px-4 py-2.5 text-xs">
                      {row.plannedMachineName ?? <span className="text-ink-300">—</span>}
                      {/* A warning, never a block: you schedule around a
                          service, which is the point of knowing about one. */}
                      {row.plannedMachineDown ? (
                        <div className="text-danger-700 font-medium">
                          down — {row.plannedMachineDown}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {/* The plan against the promise. Only worth a line when
                          there is both a plan and a promise to compare. */}
                      {row.plannedFinish ? (
                        <span
                          className={row.landsLate ? 'text-danger-700 font-medium' : 'text-ink-600'}
                        >
                          {row.landsLate ? (
                            <AlertTriangle className="mr-1 inline size-3.5 align-text-bottom" />
                          ) : null}
                          {formatDate(row.plannedFinish)}
                          {row.landsLate ? ` · ${row.daysLate}d late` : ''}
                        </span>
                      ) : row.dueDate ? (
                        <span className={row.isOverdue ? 'text-danger-600' : 'text-ink-500'}>
                          due {formatDate(row.dueDate)}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={TONE[row.status]}>{PLANNING_STATUS_LABELS[row.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        The other half of the question. The board above says what each order is
        waiting for; this says what each machine is in for — which is the thing
        that stops three jobs being booked onto Tuesday's press.
      */}
      {booked.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-ink-900 mb-3 flex items-center gap-2 text-base font-semibold">
            <Factory className="text-ink-400 size-4" />
            What each machine has coming
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {booked.map((machine) => (
              <div
                key={machine.machineId}
                className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)]"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ink-900 text-sm font-semibold">{machine.machineName}</span>
                  <span className="text-ink-500 text-xs tabular-nums">
                    {machine.orders.length} job{machine.orders.length === 1 ? '' : 's'} ·{' '}
                    {formatNumber(machine.totalKg, 0)} kg · ~{machine.bookedDays}d
                  </span>
                </div>
                <ul className="divide-ink-100 divide-y text-sm">
                  {machine.orders.map((order) => (
                    <li
                      key={order.orderId}
                      className="flex items-baseline justify-between gap-2 py-1.5"
                    >
                      <span className="min-w-0">
                        <span className="text-ink-700">#{order.orderNumber}</span>{' '}
                        <span className="text-ink-500 text-xs">{order.jobName}</span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs whitespace-nowrap tabular-nums',
                          order.landsLate ? 'text-danger-700 font-medium' : 'text-ink-500',
                        )}
                      >
                        {formatDate(order.plannedStart)}
                        {order.landsLate ? ' · late' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canPlan && rows.some((row) => !row.cardId) ? (
        <p className="text-ink-400 mt-6 flex items-center gap-1.5 text-xs">
          <CalendarClock className="size-3.5" />
          Click any order that is not yet on the floor to book it onto a day and a machine.
        </p>
      ) : null}

      <PlanModal row={planning} onClose={() => setPlanning(null)} />
    </div>
  );
}
