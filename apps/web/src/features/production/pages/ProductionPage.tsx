import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import {
  formatNumber,
  MACHINE_KINDS,
  PRODUCTION_STAGE_LABELS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUSES,
  flagsShort,
  type MachineKind,
  type ProductionOrder,
  type ProductionStatus,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { useProductionOrders } from '../api/production-api';

const TONE: Record<ProductionStatus, 'neutral' | 'brand' | 'success' | 'warning'> = {
  PLANNED: 'neutral',
  RUNNING: 'brand',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * **Delayed is computed, never stored.**
 *
 * A status somebody has to remember to change is a status that is wrong most of
 * the time. The order promised a date; today is today; the card is late or it
 * is not. And only while it is still running — telling the office a finished
 * job was 40 days late is true and useless.
 */
function lateness(card: ProductionOrder): { text: string; late: boolean } | null {
  if (!card.dueDate) return null;
  if (card.status === 'COMPLETED') return { text: formatDate(card.dueDate), late: false };
  const days = Math.round(
    (Date.parse(`${card.dueDate}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return { text: `${formatDate(card.dueDate)} · ${-days}d late`, late: true };
  if (days === 0) return { text: `${formatDate(card.dueDate)} · today`, late: false };
  return { text: formatDate(card.dueDate), late: false };
}

/** A bar rather than a number alone: a row is scanned, not read. */
function Progress({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-ink-100 h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', percent === 100 ? 'bg-success-500' : 'bg-brand-500')}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <span className="text-ink-600 w-9 text-xs tabular-nums">{percent}%</span>
    </div>
  );
}

/**
 * **Production: what is on the floor right now.**
 *
 * Running first, then planned, then what is finished — the floor's order, not
 * the filing cabinet's. The stage filter answers the question a supervisor
 * actually asks, which is not "show me everything" but "what is waiting for the
 * press".
 */
export default function ProductionPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [stage, setStage] = useState('');

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(status ? { status: status as ProductionStatus } : {}),
      ...(stage ? { stage: stage as MachineKind } : {}),
    }),
    [debounced, status, stage],
  );

  const { data, isLoading } = useProductionOrders(params);
  const cards = data?.items ?? [];
  const running = cards.filter((c) => c.status === 'RUNNING').length;
  const late = cards.filter((c) => lateness(c)?.late).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Production</h1>
        <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
          Every production run on the floor, and which stage it has reached. A run is started from
          the order it makes — open an order and start it there.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3">
          <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">Running</div>
          <div className="text-ink-900 mt-0.5 text-xl font-bold tabular-nums">{running}</div>
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
            placeholder="Customer, job or card number…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search production runs"
          />
        </div>
        <div className="sm:w-52">
          <Select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            aria-label="Filter by stage waiting"
          >
            <option value="">Any stage</option>
            {MACHINE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                Waiting on {PRODUCTION_STAGE_LABELS[kind].toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-44">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">Every status</option>
            {PRODUCTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PRODUCTION_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading the floor…" />
      ) : cards.length === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={search || status || stage ? 'Nothing matches that' : 'Nothing on the floor'}
            description={
              search || status || stage
                ? 'Try a different search, or clear the filters.'
                : 'Open a confirmed order and start it — that raises its production run with the stages the job actually needs.'
            }
          />
        </div>
      ) : (
        <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Card</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {cards.map((card) => {
                  const when = lateness(card);
                  return (
                    <tr
                      key={card.id}
                      onClick={() => navigate(`/production/${card.id}`)}
                      className="hover:bg-ink-25 cursor-pointer"
                    >
                      <td className="text-ink-900 px-4 py-2.5 font-medium tabular-nums">
                        #{card.number}
                        <span className="text-ink-400 ml-1.5 text-xs font-normal">
                          ord {card.orderNumber}
                        </span>
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">{card.customerName}</td>
                      <td className="text-ink-700 px-4 py-2.5">
                        <span className="align-middle">{card.jobName}</span>
                        {/* The one thing on this row that stops the job. It sits
                            with the job's name rather than in a column of its
                            own, because it is only ever true of a few rows and
                            an empty column reads as a column nobody fills in. */}
                        {flagsShort(card).length > 0 ? (
                          <Badge tone="danger" className="ml-2 align-middle">
                            <AlertTriangle className="mr-1 size-3" />
                            {card.materialOverrideReason ? 'Short — allowed' : 'Short of material'}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                        {formatNumber(card.quantityKg, 0)} kg
                      </td>
                      <td className="text-ink-700 px-4 py-2.5 text-xs">
                        {card.currentStage ? PRODUCTION_STAGE_LABELS[card.currentStage] : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Progress percent={card.progressPercent} />
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
                        <Badge tone={TONE[card.status]}>
                          {PRODUCTION_STATUS_LABELS[card.status]}
                        </Badge>
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
