import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';
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
import { FortnightChart } from '../components/FortnightChart';

/*
 * Severity is carried by a stripe down the edge of the row rather than a dot
 * beside the text. A dot has to be found; a stripe is the first thing the eye
 * reaches, and the list is read by somebody scanning for what is wrong.
 */
const SEVERITY: Record<
  Alert['severity'],
  { stripe: string; tone: 'danger' | 'warning' | 'neutral' }
> = {
  HIGH: { stripe: 'bg-danger-500', tone: 'danger' },
  MEDIUM: { stripe: 'bg-warning-500', tone: 'warning' },
  LOW: { stripe: 'bg-ink-300', tone: 'neutral' },
};

/** The stages a job passes, in floor order, so the board reads left to right. */
const STAGE_ORDER = ['PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING'] as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * One link in the chain across the top.
 *
 * The count is the headline because it is what somebody pictures — four jobs on
 * the floor, two quotations out. What the count is made of goes underneath:
 * kilograms where the link is about material, rupees where it is about money,
 * and nothing at all where neither is meaningful, rather than a zero that looks
 * like a figure.
 */
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
  const parts = [
    link.value !== null ? formatRs(link.value) : null,
    link.kg !== null ? `${formatNumber(link.kg, 0)} ${unit ?? 'kg'}` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onGo(href)}
      className={cn(
        'group border-ink-200 relative flex flex-col justify-between rounded-[var(--radius-lg)] border bg-white px-3.5 py-3 text-left',
        'hover:border-brand-400 hover:shadow-[var(--shadow-card)] transition-all duration-150',
      )}
    >
      <div className="text-ink-500 group-hover:text-brand-700 text-[11px] font-medium tracking-wider uppercase transition-colors">
        {label}
      </div>
      <div className="text-ink-900 mt-1.5 text-[1.75rem] leading-none font-bold tabular-nums">
        {formatNumber(link.count, 0)}
      </div>
      <div className="text-ink-500 mt-1.5 min-h-[1rem] text-xs tabular-nums">
        {parts.join(' · ')}
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
 * Four bands, in the order those questions are asked. **The chain** across the
 * top — quoted, ordered, planned, on the floor, in the godown, gone out —
 * because a works wants to see the whole pipe before any part of it. **What
 * needs attention**, worst first, each line a link straight to the screen that
 * fixes it, with today's figures beside it. **The last fortnight**, as a shape
 * rather than a number, because whether the floor is keeping up is a question
 * about a run of days and not about this one. Then **the floor itself**,
 * grouped by stage.
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
  const machineCount = data.machines.running + data.machines.idle + data.machines.down;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold tracking-tight sm:text-2xl">
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
      <section className="mb-5">
        <SectionHeading>Where everything is</SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        {/* What needs somebody. */}
        <section className="lg:col-span-2">
          <SectionHeading>Needs attention</SectionHeading>
          {data.attention.length === 0 ? (
            <div className="border-success-200 bg-success-50/50 text-success-800 flex h-full min-h-[8rem] items-center justify-center rounded-[var(--radius-lg)] border px-4 py-6 text-center text-sm">
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
                    className="hover:bg-ink-25 group relative flex w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors"
                  >
                    <span
                      className={cn(
                        'absolute top-0 bottom-0 left-0 w-1',
                        SEVERITY[alert.severity].stripe,
                      )}
                      aria-hidden
                    />
                    <span className="text-ink-800 min-w-0 flex-1 text-sm">{alert.title}</span>
                    <ChevronRight className="text-ink-300 group-hover:text-brand-600 size-4 shrink-0 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Today, and what the works is holding. */}
        <section>
          <SectionHeading>Today</SectionHeading>
          <div className="border-ink-200 divide-ink-100 h-full divide-y rounded-[var(--radius-lg)] border bg-white">
            <Stat
              label="Made"
              value={`${formatNumber(data.today.outputKg, 0)} kg`}
              hint={`${data.today.runs} run${data.today.runs === 1 ? '' : 's'} finished`}
            />
            <Stat
              label="Waste"
              value={data.today.runs > 0 ? `${data.today.wastePercent}%` : '—'}
              hint={
                data.today.runs > 0
                  ? `${formatNumber(data.today.wasteKg, 1)} kg`
                  : 'nothing finished yet'
              }
              tone={data.today.runs > 0 && data.today.wastePercent >= 5 ? 'warn' : 'plain'}
            />
            <Stat
              label="Machines"
              value={`${data.machines.running} of ${machineCount}`}
              hint={data.machines.down > 0 ? `${data.machines.down} down` : 'none down'}
              tone={data.machines.down > 0 ? 'bad' : 'plain'}
            />
            <Stat
              label="Stock on hand"
              value={formatRs(data.stock.value)}
              hint={`${data.stock.materialsInStock} materials`}
            />
          </div>
        </section>
      </div>

      {/* The fortnight. The only thing on the page that is a shape. */}
      <section className="mb-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <SectionHeading className="mb-0">The last fortnight</SectionHeading>
          <button
            type="button"
            onClick={() => go('/quality')}
            className="text-ink-500 hover:text-ink-900 flex shrink-0 items-center gap-1 text-xs transition-colors"
          >
            Waste by stage
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <FortnightChart trend={data.trend} fortnight={data.fortnight} />
      </section>

      {/* The floor, stage by stage. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <SectionHeading className="mb-0">On the floor</SectionHeading>
          <button
            type="button"
            onClick={() => go('/production')}
            className="text-ink-500 hover:text-ink-900 flex shrink-0 items-center gap-1 text-xs transition-colors"
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
                <div className="text-ink-500 mb-1.5 flex items-baseline justify-between text-[11px] font-medium tracking-wider uppercase">
                  <span>{column.label}</span>
                  <span className="text-ink-400 tabular-nums">{column.cards.length}</span>
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
            <div className="text-ink-500 mb-1.5 text-[11px] font-medium tracking-wider uppercase">
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

/** Every band is titled the same way, so the page reads as a sequence. */
function SectionHeading({ children, className }: { children: string; className?: string }) {
  return (
    <h2
      className={cn(
        'text-ink-700 mb-2 text-[11px] font-semibold tracking-wider uppercase',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** One row of the Today rail. */
function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'plain' | 'warn' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 py-3">
      <span className="text-ink-500 text-[11px] font-medium tracking-wider uppercase">{label}</span>
      <span className="text-right">
        <span
          className={cn(
            'block font-semibold tabular-nums',
            tone === 'bad'
              ? 'text-danger-700'
              : tone === 'warn'
                ? 'text-warning-700'
                : 'text-ink-900',
          )}
        >
          {value}
        </span>
        <span className="text-ink-400 block text-xs">{hint}</span>
      </span>
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
        'hover:border-brand-400 hover:shadow-[var(--shadow-elevated)] transition-all duration-150',
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
