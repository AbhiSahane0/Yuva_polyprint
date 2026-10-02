import type { ReactNode } from 'react';
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { formatNumber, type Trend } from '@yuva/shared';
import { cn } from '@/lib/utils';

/* The pieces the overview is built from. Each one is a shape an owner can read
   at a glance: a figure with a direction, a row of bars, a panel with a way in
   to the screen behind it. */

/** A titled card with an optional link out to the screen that owns it. */
export function Panel({
  title,
  action,
  onAction,
  children,
  footer,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  /** Sits at the bottom of the card, so panels side by side line up. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        /* `min-w-0` because a panel is almost always a grid child, and a grid
           child sizes to its content unless told otherwise — one long customer
           name would widen the column and then the page. */
        'border-ink-200 flex min-w-0 flex-col rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="border-ink-100 flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-ink-700 text-[11px] font-semibold tracking-wider uppercase">{title}</h2>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-ink-400 hover:text-brand-700 flex shrink-0 items-center gap-1 text-xs transition-colors"
          >
            {action}
            <ArrowRight className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {footer ? (
        <p className="text-ink-400 border-ink-50 mt-auto border-t px-4 py-2.5 text-xs">{footer}</p>
      ) : null}
    </section>
  );
}

/**
 * How a figure has moved against the period before it.
 *
 * Green is not simply "up". Waste rising is bad news in green unless the
 * direction is read from the figure itself, which is what `riseIsGood` is for.
 * A null change means there was no previous period to compare with — a works
 * three days old has no last fortnight, and showing +100% would be a lie.
 */
export function Delta({ trend, suffix = '%' }: { trend: Trend; suffix?: string }) {
  if (trend.change === null) {
    return <span className="text-ink-300 text-xs">no earlier period</span>;
  }
  const flat = Math.abs(trend.change) < 0.05;
  const good = flat ? null : trend.change > 0 === trend.riseIsGood;
  const Icon = flat ? Minus : trend.change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
        good === null && 'bg-ink-100 text-ink-500',
        good === true && 'bg-success-50 text-success-700',
        good === false && 'bg-danger-50 text-danger-700',
      )}
    >
      <Icon className="size-3" />
      {flat ? 'level' : `${trend.change > 0 ? '+' : ''}${trend.change}${suffix}`}
    </span>
  );
}

/** A figure, its direction, and what it is made of. */
export function Kpi({
  label,
  value,
  unit,
  trend,
  hint,
  spark,
  tone = 'plain',
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  trend?: Trend;
  hint: string;
  spark?: number[];
  tone?: 'plain' | 'good' | 'warn' | 'bad';
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink-500 text-[11px] font-medium tracking-wider uppercase">
          {label}
        </span>
        {trend ? <Delta trend={trend} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            'text-[1.6rem] leading-none font-bold tabular-nums',
            tone === 'good' && 'text-success-700',
            tone === 'warn' && 'text-warning-700',
            tone === 'bad' && 'text-danger-700',
            tone === 'plain' && 'text-ink-900',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-ink-500 text-sm font-medium">{unit}</span> : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-ink-400 text-xs">{hint}</span>
        {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
      </div>
    </>
  );

  const shell =
    'border-ink-200 flex flex-col rounded-[var(--radius-lg)] border bg-white px-3.5 py-3 text-left shadow-[var(--shadow-card)]';

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(shell, 'hover:border-brand-400 transition-colors')}
    >
      {body}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** The shape of a run of days, small enough to sit inside a tile. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 56;
  const h = 18;
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-brand-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface BarRow {
  key: string;
  label: string;
  /** What the bar is drawn to. */
  value: number;
  /** The figure printed on the right. */
  display: string;
  /** Under the bar, small. */
  sub?: string;
  /** Marks this row as the one to look at. */
  flag?: 'bad' | 'warn' | null;
}

/**
 * A ranked list, each row with a bar of its own.
 *
 * The bar is a slim track under the name rather than a wash behind it. Behind
 * the row it read as a selected state — a block of pale blue with a hard edge
 * cutting through the words — and a reader has to be told it means a quantity.
 * A track with a fill is the shape everybody already knows, and it leaves the
 * label and the figure on a clean ground.
 *
 * `floor` keeps a set of close values honest. Four stages all losing about 2.5%
 * drawn against the largest of them come out as four near-full bars, which says
 * "all equally bad" when the truth is "all comfortably low". Scaling to at
 * least the floor draws them where they belong.
 */
export function BarList({
  rows,
  empty,
  floor = 0,
  onRow,
}: {
  rows: BarRow[];
  empty: string;
  floor?: number;
  onRow?: (key: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-ink-400 px-4 py-6 text-center text-sm">{empty}</p>;
  }
  const max = Math.max(...rows.map((row) => row.value), floor, 1);

  return (
    <ul className="divide-ink-50 divide-y">
      {rows.map((row) => {
        const filled = Math.min(100, (row.value / max) * 100);
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-800 min-w-0 flex-1 truncate text-sm font-medium">
                {row.label}
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  row.flag === 'bad'
                    ? 'text-danger-700'
                    : row.flag === 'warn'
                      ? 'text-warning-700'
                      : 'text-ink-900',
                )}
              >
                {row.display}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="bg-ink-100 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-300',
                    row.flag === 'bad'
                      ? 'bg-danger-500'
                      : row.flag === 'warn'
                        ? 'bg-warning-500'
                        : 'bg-brand-500',
                  )}
                  style={{ width: `${filled}%` }}
                />
              </span>
              {row.sub ? (
                <span className="text-ink-400 shrink-0 text-xs tabular-nums">{row.sub}</span>
              ) : null}
            </div>
          </>
        );
        return (
          <li key={row.key}>
            {onRow ? (
              <button
                type="button"
                onClick={() => onRow(row.key)}
                className="hover:bg-ink-25 block w-full px-4 py-2.5 text-left transition-colors"
              >
                {inner}
              </button>
            ) : (
              <div className="px-4 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 7 / 14 / 30. Three windows, because a slider is a control nobody moves twice. */
export function PeriodPicker({
  value,
  options,
  onChange,
}: {
  value: number;
  options: readonly number[];
  onChange: (days: number) => void;
}) {
  return (
    <div className="border-ink-200 inline-flex rounded-[var(--radius-md)] border bg-white p-0.5">
      {options.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(days)}
          aria-pressed={days === value}
          className={cn(
            'rounded-[calc(var(--radius-md)-3px)] px-2.5 py-1 text-xs font-medium transition-colors',
            days === value
              ? 'bg-brand-600 text-white'
              : 'text-ink-500 hover:text-ink-900 hover:bg-ink-50',
          )}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}

/** Rupees, shortened, because an owner reads a scale not a figure. */
export function shortRs(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${formatNumber(value / 1_00_00_000, 2)} Cr`;
  if (abs >= 1_00_000) return `₹${formatNumber(value / 1_00_000, 2)} L`;
  if (abs >= 1_000) return `₹${formatNumber(value / 1_000, 1)} K`;
  return `₹${formatNumber(value, 0)}`;
}
