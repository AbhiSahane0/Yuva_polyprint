import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  greeting,
  OVERVIEW_WINDOWS,
  PRODUCTION_STAGE_LABELS,
  type Alert,
  type ChainLink,
  type FloorCard,
  type OrderAtRisk,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAuthStore } from '@/features/auth/auth-store';
import { cn } from '@/lib/utils';
import { useOverview } from '../api/overview-api';
import { FortnightChart } from '../components/FortnightChart';
import { BarList, Kpi, Panel, PeriodPicker, shortRs, type BarRow } from '../components/dashboard';

/* Severity is a stripe down the edge of the row, not a dot beside the text. A
   dot has to be found; this list is read by somebody scanning for trouble. */
const SEVERITY: Record<Alert['severity'], string> = {
  HIGH: 'bg-danger-500',
  MEDIUM: 'bg-warning-500',
  LOW: 'bg-ink-300',
};

/** The stages a job passes, in floor order, so the board reads left to right. */
const STAGE_ORDER = ['PRINTING', 'LAMINATION', 'SLITTING', 'POUCHING'] as const;

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/** "in 3 days", "today", "4 days late" — the phrase an owner thinks in. */
function dueIn(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} late`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}

/** One link in the chain across the top. */
function Link({
  label,
  link,
  href,
  onGo,
}: {
  label: string;
  link: ChainLink;
  href: string;
  onGo: (href: string) => void;
}) {
  const parts = [
    link.value !== null ? shortRs(link.value) : null,
    link.kg !== null ? `${formatNumber(link.kg, 0)} kg` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onGo(href)}
      className="group border-ink-200 hover:border-brand-400 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border bg-white px-3 py-2 text-left transition-colors"
    >
      <span className="min-w-0">
        <span className="text-ink-500 group-hover:text-brand-700 block truncate text-[11px] font-medium tracking-wider uppercase transition-colors">
          {label}
        </span>
        <span className="text-ink-400 block truncate text-xs tabular-nums">
          {parts.join(' · ') || '—'}
        </span>
      </span>
      <span className="text-ink-900 shrink-0 text-xl leading-none font-bold tabular-nums">
        {formatNumber(link.count, 0)}
      </span>
    </button>
  );
}

/**
 * **The whole works on one screen.**
 *
 * Built for the owner rather than for a department: the five figures that say
 * how the business is doing, then the chain, then the shapes behind each — what
 * the floor got through, which machine earned its keep, where film is being
 * lost, who the order book is with, and what is about to be late.
 *
 * Everything time-based reads over the same window, which the picker at the top
 * changes. Every figure is read from the module that owns it, so the summary
 * and the screen behind it cannot disagree.
 */
export default function OverviewPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [days, setDays] = useState(14);
  const { data, isLoading } = useOverview(days);

  if (isLoading || !data) return <LoadingState label="Reading the works…" />;

  const go = (href: string) => navigate(href);
  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    label: PRODUCTION_STAGE_LABELS[stage] ?? stage,
    cards: data.floor.filter((card) => card.stage === stage && card.stageLabel !== 'Not started'),
  }));
  const notStarted = data.floor.filter((card) => card.stageLabel === 'Not started');
  const machineCount = data.machines.running + data.machines.idle + data.machines.down;

  /*
   * What the floor made that no machine is credited with.
   *
   * Every stage is counted in Output; only the ones booked to a machine can be
   * counted here. Pouch making is the live case — the works has no pouch-making
   * machine on the costing screen, so those runs belong to nobody. Said out
   * loud rather than quietly dropped, because otherwise this panel adds up to
   * less than the figure above it and nothing explains why.
   */
  const unattributedKg = Math.round(
    data.fortnight.outputKg - data.machineLoad.reduce((sum, machine) => sum + machine.outputKg, 0),
  );

  const machineRows: BarRow[] = data.machineLoad.map((machine) => ({
    key: machine.id,
    label: machine.name,
    value: machine.outputKg,
    display: `${formatNumber(machine.outputKg, 0)} kg`,
    sub: machine.isDown
      ? 'down now'
      : machine.runs === 0
        ? 'nothing finished'
        : `${machine.runs} ${machine.runs === 1 ? 'run' : 'runs'} · ${machine.wastePercent}% waste`,
    flag: machine.isDown ? 'bad' : machine.runs === 0 ? 'warn' : null,
  }));

  const wasteRows: BarRow[] = data.wasteByStage.map((row) => ({
    key: row.stage,
    label: row.label,
    value: row.percent,
    display: `${row.percent}%`,
    sub: `${formatNumber(row.wasteKg, 0)} kg of ${formatNumber(row.inputKg, 0)} kg`,
    flag: row.percent >= 5 ? 'bad' : row.percent >= 3.5 ? 'warn' : null,
  }));

  const customerRows: BarRow[] = data.customers.map((row) => ({
    key: row.customerId ?? row.customerName,
    label: row.customerName,
    value: row.value,
    display: shortRs(row.value),
    sub: `${row.percent}% of the book · ${row.orders} ${row.orders === 1 ? 'order' : 'orders'}`,
    flag: row.percent >= 40 ? 'warn' : null,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={days} options={OVERVIEW_WINDOWS} onChange={setDays} />
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

      {/* The five an owner asks for first. */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Kpi
          label="Order book"
          value={shortRs(data.kpis.orderBook.value)}
          hint={`${data.kpis.orderBook.count} open · ${formatNumber(data.kpis.orderBook.kg, 0)} kg`}
          onClick={() => go('/orders')}
        />
        <Kpi
          label="Delivered"
          value={shortRs(data.kpis.delivered.value)}
          trend={data.kpis.delivered}
          hint={`this month · ${formatNumber(data.kpis.delivered.kg, 0)} kg`}
          onClick={() => go('/dispatch')}
        />
        <Kpi
          label="Output"
          value={formatNumber(data.kpis.output.value, 0)}
          unit="kg"
          trend={data.kpis.output}
          hint={`over ${days} days`}
          spark={data.trend.map((day) => day.outputKg)}
          onClick={() => go('/production')}
        />
        <Kpi
          label="Waste"
          value={String(data.kpis.waste.value)}
          unit="%"
          trend={data.kpis.waste}
          hint={`${formatNumber(data.fortnight.wasteKg, 0)} kg lost`}
          tone={data.kpis.waste.value >= 5 ? 'warn' : 'plain'}
          onClick={() => go('/quality')}
        />
        <Kpi
          label="On time"
          value={data.kpis.onTime.percent === null ? '—' : String(data.kpis.onTime.percent)}
          unit={data.kpis.onTime.percent === null ? undefined : '%'}
          hint={
            data.kpis.onTime.total === 0
              ? 'nothing delivered yet'
              : `${data.kpis.onTime.total} ${data.kpis.onTime.total === 1 ? 'delivery' : 'deliveries'}${data.kpis.onTime.late > 0 ? ` · ${data.kpis.onTime.late} late` : ''}`
          }
          tone={
            data.kpis.onTime.percent === null
              ? 'plain'
              : data.kpis.onTime.percent >= 95
                ? 'good'
                : data.kpis.onTime.percent >= 80
                  ? 'warn'
                  : 'bad'
          }
          onClick={() => go('/dispatch')}
        />
      </div>

      {/* The chain, end to end. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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

      {/* The shape of the window, and what is asking for somebody. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {/* `min-w-0`, or the grid column sizes itself to the chart's minimum
            width instead of to the track, and the whole page scrolls
            sideways on a phone. */}
        <section className="min-w-0 lg:col-span-2">
          <FortnightChart trend={data.trend} fortnight={data.fortnight} days={days} />
        </section>

        <Panel title="Needs attention" action="Production" onAction={() => go('/production')}>
          {data.attention.length === 0 ? (
            <p className="text-success-800 bg-success-50/50 m-3 rounded-[var(--radius-md)] px-4 py-6 text-center text-sm">
              Nothing is asking for you. Every job has its film, every machine is up, and nothing is
              past its date.
            </p>
          ) : (
            <ul className="divide-ink-50 divide-y">
              {data.attention.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => go(alert.href)}
                    className="hover:bg-ink-25 group relative flex w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors"
                  >
                    <span
                      className={cn('absolute inset-y-0 left-0 w-1', SEVERITY[alert.severity])}
                      aria-hidden
                    />
                    <span className="text-ink-800 min-w-0 flex-1 text-sm">{alert.title}</span>
                    <ChevronRight className="text-ink-300 group-hover:text-brand-600 size-4 shrink-0 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Where the work went, where the film went, and who it is for. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title={`Machines · ${days} days`} action="Machines" onAction={() => go('/machines')}>
          <BarList rows={machineRows} empty="No machines on record." />
          <p className="text-ink-400 border-ink-50 border-t px-4 py-2 text-xs">
            {data.machines.running} running · {data.machines.idle} idle
            {data.machines.down > 0 ? ` · ${data.machines.down} down` : ''} of {machineCount}
            {unattributedKg > 0 ? ` · ${formatNumber(unattributedKg, 0)} kg on no machine` : ''}
          </p>
        </Panel>

        <Panel
          title={`Waste by stage · ${days} days`}
          action="Quality"
          onAction={() => go('/quality')}
        >
          <BarList rows={wasteRows} empty="Nothing has finished in this window." />
          <p className="text-ink-400 border-ink-50 border-t px-4 py-2 text-xs">
            Against what went on at each stage, so a heavy stage and a light one compare.
          </p>
        </Panel>

        <Panel title="Order book by customer" action="Customers" onAction={() => go('/customers')}>
          <BarList
            rows={customerRows}
            empty="Nothing on the books."
            onRow={(key) => go(`/customers/${key}`)}
          />
          <p className="text-ink-400 border-ink-50 border-t px-4 py-2 text-xs">
            {data.winRate.percent === null
              ? 'No quotation has been answered yet.'
              : `${data.winRate.percent}% of answered quotations won · ${data.winRate.sent} still out`}
          </p>
        </Panel>
      </div>

      {/* What is about to go wrong with a date on it. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Due this week"
          action="Planning"
          onAction={() => go('/planning')}
          className="lg:col-span-2"
        >
          {data.atRisk.length === 0 ? (
            <p className="text-ink-400 px-4 py-6 text-center text-sm">
              Nothing is due in the next seven days.
            </p>
          ) : (
            <ul className="divide-ink-50 divide-y">
              {data.atRisk.map((order) => (
                <AtRiskRow key={order.id} order={order} onGo={go} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Stock" action="Inventory" onAction={() => go('/inventory')}>
          <dl className="divide-ink-50 divide-y">
            <Fact label="On hand" value={formatRs(data.stock.value)} hint="at today's rates" />
            <Fact
              label="Materials"
              value={String(data.stock.materialsInStock)}
              hint="with something on the shelf"
            />
            <Fact
              label="Below level"
              value={String(data.stock.lowStock)}
              hint={data.stock.lowStock > 0 ? 'needs reordering' : 'nothing is short'}
              tone={data.stock.lowStock > 0 ? 'warn' : 'plain'}
            />
            <Fact
              label="Made today"
              value={`${formatNumber(data.today.outputKg, 0)} kg`}
              hint={`${data.today.runs} ${data.today.runs === 1 ? 'run' : 'runs'} finished`}
            />
          </dl>
        </Panel>
      </div>

      {/* The floor, stage by stage. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-ink-700 text-[11px] font-semibold tracking-wider uppercase">
            On the floor
          </h2>
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

/** One order with a date it may not make. */
function AtRiskRow({ order, onGo }: { order: OrderAtRisk; onGo: (href: string) => void }) {
  const late = order.daysLeft < 0;
  const soon = order.daysLeft >= 0 && order.daysLeft <= 2;
  return (
    <li>
      <button
        type="button"
        onClick={() => onGo(`/orders/${order.id}`)}
        className="hover:bg-ink-25 group relative flex w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 w-1',
            late ? 'bg-danger-500' : soon ? 'bg-warning-500' : 'bg-ink-200',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="text-ink-800 block truncate text-sm">
            #{order.number} · {order.jobName}
          </span>
          <span className="text-ink-400 block truncate text-xs">
            {order.customerName}
            {order.notStarted ? ' · not started' : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              'block text-xs font-semibold',
              late ? 'text-danger-700' : soon ? 'text-warning-700' : 'text-ink-600',
            )}
          >
            {dueIn(order.daysLeft)}
          </span>
          <span className="text-ink-400 block text-xs tabular-nums">
            {formatNumber(order.pendingKg, 0)} kg to go
          </span>
        </span>
        <ChevronRight className="text-ink-300 group-hover:text-brand-600 size-4 shrink-0 transition-colors" />
      </button>
    </li>
  );
}

/** One line of the stock panel. */
function Fact({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 py-2.5">
      <dt className="text-ink-500 text-[11px] font-medium tracking-wider uppercase">{label}</dt>
      <dd className="text-right">
        <span
          className={cn(
            'block font-semibold tabular-nums',
            tone === 'warn' ? 'text-warning-700' : 'text-ink-900',
          )}
        >
          {value}
        </span>
        <span className="text-ink-400 block text-xs">{hint}</span>
      </dd>
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
