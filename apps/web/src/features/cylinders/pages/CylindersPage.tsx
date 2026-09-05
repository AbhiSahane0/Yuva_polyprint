import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import {
  CYLINDER_STATUS_LABELS,
  formatNumber,
  formatRs,
  OWNERSHIP_LABELS,
  type CylinderStatus,
  type DesignSummary,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { useDesigns } from '../api/cylinder-api';
import { RegisterSetModal } from '../components/RegisterSetModal';

const STATUS_TONE: Record<CylinderStatus | 'NONE', 'neutral' | 'success' | 'warning' | 'brand'> = {
  IN_STORE: 'success',
  ALLOCATED: 'brand',
  IN_USE: 'brand',
  DAMAGED: 'warning',
  NEEDS_REWORK: 'warning',
  RETIRED: 'neutral',
  NONE: 'neutral',
};

/**
 * `CYL-3301 – 3304` where the numbers run on, the list otherwise.
 *
 * A set is usually consecutive and a range is how the office says it aloud;
 * printing six numbers where two would do makes the column unreadable.
 */
export function formatCodes(codes: string[]): string {
  if (codes.length === 0) return '—';
  if (codes.length === 1) return codes[0]!;

  const match = /^(.*?)(\d+)$/.exec(codes[0]!);
  if (match) {
    const [, prefix] = match;
    const numbers = codes.map((code) => {
      const parsed = /^(.*?)(\d+)$/.exec(code);
      return parsed && parsed[1] === prefix ? Number(parsed[2]) : null;
    });
    if (numbers.every((n): n is number => n !== null)) {
      const sorted = [...numbers].sort((a, b) => a - b);
      const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
      if (consecutive) return `${codes[0]} – ${sorted[sorted.length - 1]}`;
    }
  }
  return codes.join(', ');
}

export default function CylindersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [registering, setRegistering] = useState(false);

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      ...(debounced ? { q: debounced } : {}),
      ...(attentionOnly ? { attentionOnly: true } : {}),
    }),
    [debounced, attentionOnly],
  );

  const { data, isPending, isError, error, refetch } = useDesigns(params);
  const designs = data?.items ?? [];
  const totals = data?.totals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Design &amp; Cylinders</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            Every design and the engraved set it prints from — where each cylinder is, and what
            state it is in.
          </p>
        </div>
        <Button onClick={() => setRegistering(true)}>
          <Plus className="size-4" />
          Register a set
        </Button>
      </header>

      {totals ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Designs with a set" value={formatNumber(totals.designs)} />
          <Summary label="Cylinders" value={formatNumber(totals.cylinders)} />
          <Summary label="Out of the store" value={formatNumber(totals.inUse)} />
          {/*
           * Damaged or needing rework. The reason anybody opens this screen
           * twice, and the figure that stops a job at the machine.
           */}
          <Summary
            label="Damaged / needs rework"
            value={formatNumber(totals.attention)}
            tone={totals.attention > 0 ? 'warning' : undefined}
            onClick={totals.attention > 0 ? () => setAttentionOnly(true) : undefined}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {attentionOnly ? (
          <button
            type="button"
            onClick={() => setAttentionOnly(false)}
            className="border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100 inline-flex cursor-pointer items-center gap-1 self-start rounded-full border px-3 py-1 text-xs font-medium"
          >
            Needs attention
            <X className="size-3" />
          </button>
        ) : null}
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Design, customer or cylinder number…"
            className="pl-9"
            aria-label="Search designs and cylinders"
          />
        </div>
      </div>

      {isError ? (
        <section className="border-ink-200 mt-6 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Could not load the register"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </section>
      ) : isPending ? (
        <LoadingState label="Loading designs…" className="mt-8" />
      ) : designs.length === 0 ? (
        <section className="border-ink-200 mt-6 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={attentionOnly ? 'Nothing needs attention' : 'No sets registered yet'}
            description={
              attentionOnly
                ? 'Every registered cylinder is usable.'
                : 'Register a set against a design and its cylinders appear here, each with its own history.'
            }
            action={
              attentionOnly ? undefined : (
                <Button onClick={() => setRegistering(true)}>Register a set</Button>
              )
            }
          />
        </section>
      ) : (
        <section className="border-ink-200 mt-4 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Design</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Cylinders</th>
                  <th className="px-4 py-3 text-right font-semibold">Colours</th>
                  <th className="px-4 py-3 font-semibold">Where</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 text-right font-semibold">Cost</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {designs.map((design) => (
                  <DesignRow key={design.jobId} design={design} onOpen={navigate} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-ink-100 divide-y md:hidden">
            {designs.map((design) => (
              <li key={design.jobId}>
                <button
                  type="button"
                  onClick={() => navigate(`/cylinders/${design.jobId}`)}
                  className="w-full cursor-pointer px-4 py-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-ink-900 text-sm font-medium">{design.jobName}</p>
                    <Badge tone={STATUS_TONE[design.status]}>
                      {design.status === 'NONE' ? 'No set' : CYLINDER_STATUS_LABELS[design.status]}
                    </Badge>
                  </div>
                  <p className="text-ink-500 mt-1 text-xs">
                    {design.customerName ?? 'No customer'} · {formatCodes(design.codes)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RegisterSetModal open={registering} onClose={() => setRegistering(false)} />
    </div>
  );
}

function DesignRow({ design, onOpen }: { design: DesignSummary; onOpen: (to: string) => void }) {
  /*
   * What the job says it needs, against what has been registered. A set of four
   * where the job expects six is a set with two cylinders missing — and that is
   * exactly the discrepancy this register exists to surface.
   */
  const short =
    design.expectedCylinders !== null && design.cylinderCount < design.expectedCylinders;

  return (
    <tr
      className="border-ink-100 hover:bg-ink-25 cursor-pointer border-b"
      onClick={() => onOpen(`/cylinders/${design.jobId}`)}
    >
      <td className="text-ink-900 px-4 py-3 font-medium">
        {design.jobName}
        <span className="text-ink-400 ml-2 text-xs font-normal">{design.jobCode}</span>
      </td>
      <td className="text-ink-800 px-4 py-3">{design.customerName ?? '—'}</td>
      <td className="text-ink-600 px-4 py-3 text-xs">
        {formatCodes(design.codes)}
        {short ? (
          <span
            className="text-warning-600 block"
            title={`The job expects ${design.expectedCylinders}`}
          >
            {design.cylinderCount} of {design.expectedCylinders} registered
          </span>
        ) : null}
      </td>
      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">{design.cylinderCount}</td>
      <td className="text-ink-500 px-4 py-3 text-xs">
        {design.locations.length > 0 ? design.locations.join(', ') : '—'}
      </td>
      <td className="text-ink-500 px-4 py-3 text-xs">
        {design.ownership === null
          ? '—'
          : design.ownership === 'MIXED'
            ? 'Mixed'
            : OWNERSHIP_LABELS[design.ownership]}
      </td>
      <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
        {design.totalCost > 0 ? (
          formatRs(design.totalCost)
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge tone={STATUS_TONE[design.status]}>
          {design.status === 'NONE' ? 'No set' : CYLINDER_STATUS_LABELS[design.status]}
        </Badge>
      </td>
    </tr>
  );
}

function Summary({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: 'warning';
  onClick?: (() => void) | undefined;
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
      <div className="text-ink-500 mt-0.5 text-xs">{label}</div>
    </>
  );
  const className =
    'border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 text-left shadow-[var(--shadow-card)]';

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, 'hover:bg-ink-25 cursor-pointer')}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
