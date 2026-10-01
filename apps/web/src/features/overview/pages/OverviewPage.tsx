import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Circle, Plus } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  greeting,
  PRODUCTION_STAGE_LABELS,
  type Alert,
  type ChainLink,
  type FloorCard,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAuthStore } from '@/features/auth/auth-store';
import { cn } from '@/lib/utils';
import { useOverview } from '../api/overview-api';

const SEVERITY: Record<Alert['severity'], { dot: string; tone: 'danger' | 'warning' | 'neutral' }> =
  {
    HIGH: { dot: 'text-danger-600 fill-danger-600', tone: 'danger' },
    MEDIUM: { dot: 'text-warning-600 fill-warning-600', tone: 'warning' },
    LOW: { dot: 'text-ink-300 fill-ink-300', tone: 'neutral' },
  };

/** The stages a job passes, in floor order, so the board reads left to right. */
const STAGE_ORDER = ['PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING'] as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/** One link in the chain across the top. */
function Link({
  label,
  link,
  unit,
  href,
  onGo,
}: {
  label: string;
  link: ChainLink;
  unit?: string;
  href: string;
  onGo: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onGo(href)}
      className="border-ink-200 hover:border-brand-300 hover:bg-brand-50/30 flex-1 rounded-[var(--radius-lg)] border bg-white px-4 py-3 text-left transition-colors"
    >
      <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="text-ink-900 mt-0.5 text-2xl font-bold tabular-nums">
        {formatNumber(link.count, 0)}
      </div>
      {/* The second line is what the count is made of — kilograms on the floor,
          rupees on the books. Blank where neither means anything. */}
      <div className="text-ink-500 mt-0.5 text-xs tabular-nums">
        {link.value !== null ? formatRs(link.value) : null}
        {link.value !== null && link.kg !== null ? ' · ' : null}
        {link.kg !== null ? `${formatNumber(link.kg, 0)} ${unit ?? 'kg'}` : null}
        {link.value === null && link.kg === null ? ' ' : null}
      </div>
    </button>
  );
}

/**
 * **The daily control room.**
 *
 * The page somebody opens first thing, to answer one question: where is
 * everything, and what needs me today.
 *
 * Three bands, in the order those questions are asked. **The chain** across
 * the top — quoted, ordered, planned, on the floor, in the godown, gone out —
 * because a works wants to see the whole pipe before any part of it. **What
 * needs attention**, worst first, each line a link straight to the screen that
 * fixes it. Then **the floor itself**, grouped by stage.
 *
 * Every figure is read from the module that owns it, never recalculated here:
 * an overview that disagreed with the screen it summarises would make somebody
 * check both, every time, forever.
 *
 * It refetches itself every thirty seconds, because this is a screen that gets
 * left open.
 */
export default function OverviewPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { data, isLoading } = useOverview();

  if (isLoading || !data) return <LoadingState label="Reading the works…" />;

  const go = (href: string) => navigate(href);
  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    label: PRODUCTION_STAGE_LABELS[stage] ?? stage,
    cards: data.floor.filter((card) => card.stage === stage && card.stageLabel !== 'Not started'),
  }));
  const notStarted = data.floor.filter((card) => card.stageLabel === 'Not started');

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
            {greeting(new Date().getHours())}
            {user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            {new Date(data.asOf).toLocaleString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/quotations/new')}>
            <Plus className="size-4" />
            Quotation
          </Button>
          <Button variant="secondary" onClick={() => navigate('/orders/new')}>
            <Plus className="size-4" />
            Order
          </Button>
        </div>
      </header>

      {/* The chain. The whole pipe, in the order a job travels it. */}
      <section className="mb-6">
        <h2 className="text-ink-800 mb-2 text-xs font-semibold tracking-wider uppercase">
          Where everything is
        </h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Link label="Quoted" link={data.chain.quoted} href="/quotations" onGo={go} />
          <Link label="On the books" link={data.chain.ordered} href="/orders" onGo={go} />
          <Link label="Scheduled" link={data.chain.planned} href="/planning" onGo={go} />
          <Link label="On the floor" link={data.chain.onTheFloor} href="/production" onGo={go} />
          <Link label="In the godown" link={data.chain.inTheGodown} href="/dispatch" onGo={go} />
          <Link
            label="Gone this month"
            link={data.chain.dispatchedThisMonth}
            href="/dispatch"
            onGo={go}
          />
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* What needs somebody. */}
        <section className="lg:col-span-2">
          <h2 className="text-ink-800 mb-2 text-xs font-semibold tracking-wider uppercase">
            Needs attention
          </h2>
          {data.attention.length === 0 ? (
            <div className="border-success-200 bg-success-50/40 text-success-800 rounded-[var(--radius-lg)] border px-4 py-6 text-center text-sm">
              Nothing is asking for you. Every job has its film, every machine is up, and nothing is
              past its date.
            </div>
          ) : (
            <ul className="border-ink-200 divide-ink-100 divide-y overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
              {data.attention.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => go(alert.href)}
                    className="hover:bg-ink-25 flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <Circle className={cn('size-2.5 shrink-0', SEVERITY[alert.severity].dot)} />
                    <span className="text-ink-800 min-w-0 flex-1 text-sm">{alert.title}</span>
                    <ChevronRight className="text-ink-300 size-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Today, and what the works is holding. */}
        <section>
          <h2 className="text-ink-800 mb-2 text-xs font-semibold tracking-wider uppercase">
            Today
          </h2>
          <div className="border-ink-200 space-y-3 rounded-[var(--radius-lg)] border bg-white p-4">
            {[
              {
                label: 'Made',
                value: `${formatNumber(data.today.outputKg, 0)} kg`,
                hint: `${data.today.runs} run${data.today.runs === 1 ? '' : 's'} finished`,
              },
              {
                label: 'Waste',
                value: data.today.runs > 0 ? `${data.today.wastePercent}%` : '—',
                hint:
                  data.today.runs > 0
                    ? `${formatNumber(data.today.wasteKg, 1)} kg`
                    : 'nothing finished yet',
              },
              {
                label: 'Machines',
                value: `${data.machines.running} of ${data.machines.running + data.machines.idle + data.machines.down}`,
                hint: data.machines.down > 0 ? `${data.machines.down} down` : 'none down',
              },
              {
                label: 'Stock on hand',
                value: formatRs(data.stock.value),
                hint: `${data.stock.materialsInStock} materials`,
              },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2">
                <span className="text-ink-500 text-xs font-medium tracking-wide uppercase">
                  {row.label}
                </span>
                <span className="text-right">
                  <span className="text-ink-900 block font-semibold tabular-nums">{row.value}</span>
                  <span className="text-ink-400 block text-xs">{row.hint}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* The floor, stage by stage. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
            On the floor
          </h2>
          <button
            type="button"
            onClick={() => go('/production')}
            className="text-ink-500 hover:text-ink-900 flex items-center gap-1 text-xs"
          >
            Every job card
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        {data.floor.length === 0 ? (
          <div className="border-ink-200 text-ink-500 rounded-[var(--radius-lg)] border bg-white px-4 py-6 text-center text-sm">
            Nothing is on the floor. Start an order from Planning or Orders.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {byStage.map((column) => (
              <div key={column.stage}>
                <div className="text-ink-500 mb-1.5 flex items-baseline justify-between text-xs font-medium tracking-wide uppercase">
                  <span>{column.label}</span>
                  <span className="tabular-nums">{column.cards.length}</span>
                </div>
                <div className="space-y-2">
                  {column.cards.length === 0 ? (
                    <div className="border-ink-200 text-ink-300 rounded-[var(--radius-md)] border border-dashed px-3 py-4 text-center text-xs">
                      nothing
                    </div>
                  ) : (
                    column.cards.map((card) => <Card key={card.cardId} card={card} onGo={go} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Raised, but nobody has started it. It belongs on the board — a card
            waiting on film is the one most worth seeing. */}
        {notStarted.length > 0 ? (
          <div className="mt-4">
            <div className="text-ink-500 mb-1.5 text-xs font-medium tracking-wide uppercase">
              Raised, not started
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {notStarted.map((card) => (
                <Card key={card.cardId} card={card} onGo={go} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** One job on the board. */
function Card({ card, onGo }: { card: FloorCard; onGo: (href: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGo(`/production/${card.cardId}`)}
      className={cn(
        'w-full rounded-[var(--radius-md)] border bg-white p-3 text-left shadow-[var(--shadow-card)]',
        'hover:border-brand-300 transition-colors',
        card.isShort ? 'border-danger-200' : 'border-ink-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink-900 text-sm font-semibold">#{card.orderNumber}</span>
        {card.isShort ? (
          <Badge tone="danger">Short</Badge>
        ) : card.isOverdue ? (
          <Badge tone="warning">Late</Badge>
        ) : null}
      </div>
      <div className="text-ink-700 mt-0.5 truncate text-xs">{card.jobName}</div>
      <div className="text-ink-400 truncate text-xs">{card.customerName}</div>

      <div className="text-ink-500 mt-2 flex items-center justify-between text-xs tabular-nums">
        <span className="truncate">{card.operator || card.machineName || '—'}</span>
        <span>{formatNumber(card.quantityKg, 0)} kg</span>
      </div>

      <div className="bg-ink-100 mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', card.isShort ? 'bg-danger-400' : 'bg-brand-500')}
          style={{ width: `${Math.max(2, card.progressPercent)}%` }}
        />
      </div>
      {card.dueDate ? (
        <div className={cn('mt-1 text-xs', card.isOverdue ? 'text-danger-600' : 'text-ink-400')}>
          due {formatDate(card.dueDate)}
        </div>
      ) : null}
    </button>
  );
}
