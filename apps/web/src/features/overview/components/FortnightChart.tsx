import { useId, useState } from 'react';
import { formatNumber, type OverviewDay, type OverviewFortnight } from '@yuva/shared';
import { cn } from '@/lib/utils';

/**
 * **A fortnight of output, with waste laid over it.**
 *
 * The one shape on the overview. A works reads a fortnight faster than it reads
 * either of today's figures: whether the floor is keeping up, and whether waste
 * moves with the weight or against it.
 *
 * Two series on one frame because they only mean something together. The bars
 * are kilograms off the machines. The line is waste as a percentage of what
 * went on — a percentage rather than kilograms, because a heavy day loses more
 * film than a light one without being any worse at it, and the whole point is
 * to compare days.
 *
 * Quiet days keep their place with an empty bar. Dropping them would put Friday
 * next to Monday and draw a fortnight of six working days as though it were
 * fourteen.
 *
 * Drawn by hand rather than with a chart library: two series, fourteen points,
 * no interaction beyond a tooltip. A library would be more code on the page
 * than the chart is.
 */

/* The drawing's own coordinate space. The SVG scales to its container; these
   are only the proportions, so nothing here depends on the rendered width. */
const W = 760;
const H = 190;
const PAD = { top: 14, right: 40, bottom: 26, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** A round number at or above the heaviest day, so the top gridline is readable. */
function ceilingFor(max: number): number {
  if (max <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (step / 2)) * (step / 2);
}

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return String(date.getUTCDate());
}

function fullDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function FortnightChart({
  trend,
  fortnight,
  days,
}: {
  trend: OverviewDay[];
  fortnight: OverviewFortnight;
  days: number;
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (trend.length === 0) return null;

  const kgTop = ceilingFor(fortnight.bestDayKg);
  /* Waste gets its own scale. Pinned to at least 5% so an ordinary 2.5% day
     sits mid-frame instead of being flattened onto the floor of the chart. */
  const pctTop = ceilingFor(Math.max(5, ...trend.map((day) => day.wastePercent)));

  const band = PLOT_W / trend.length;
  const barW = Math.min(26, band * 0.56);
  /* Every date on a week, every other on a month — thirty labels in this width
     overlap into a grey smear. */
  const labelEvery = trend.length > 20 ? 3 : trend.length > 10 ? 2 : 1;
  const xOf = (index: number) => PAD.left + band * index + band / 2;
  const yOfKg = (kg: number) => PAD.top + PLOT_H - (kg / kgTop) * PLOT_H;
  const yOfPct = (pct: number) => PAD.top + PLOT_H - (pct / pctTop) * PLOT_H;

  /* The waste line is drawn through the days that ran. A day nothing finished
     has no waste percentage — it has no reading at all — so the line breaks
     rather than dropping to zero and inventing a perfect day. */
  const segments: OverviewDay[][] = [];
  let run: OverviewDay[] = [];
  for (const day of trend) {
    if (day.runs > 0) run.push(day);
    else if (run.length > 0) {
      segments.push(run);
      run = [];
    }
  }
  if (run.length > 0) segments.push(run);
  const pointsOf = (days: OverviewDay[]) =>
    days.map((day) => `${xOf(trend.indexOf(day))},${yOfPct(day.wastePercent)}`).join(' ');

  const shown = hovered === null ? null : trend[hovered];

  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      {/* What the fortnight came to, before the shape of it. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Figure
            label="Made"
            value={formatNumber(fortnight.outputKg, 0)}
            unit="kg"
            hint={`${fortnight.workingDays} working ${fortnight.workingDays === 1 ? 'day' : 'days'} of ${days}`}
          />
          <Figure
            label="Waste"
            value={String(fortnight.wastePercent)}
            unit="%"
            hint={`${formatNumber(fortnight.wasteKg, 0)} kg lost`}
            tone={fortnight.wastePercent >= 5 ? 'warn' : 'plain'}
          />
          <Figure
            label="Best day"
            value={formatNumber(fortnight.bestDayKg, 0)}
            unit="kg"
            hint={`${fortnight.runs} runs finished`}
          />
        </div>

        {/*
         * The reading for whichever day the cursor is over.
         *
         * Up here with the totals rather than floating over the plot: a tooltip
         * in the corner of the drawing sat on top of the right-hand axis, and
         * one that follows the pointer covers the bars either side of the one
         * being read. This place is always empty and always legible.
         */}
        <div className="min-h-[2.5rem] text-right text-xs">
          {shown ? (
            <>
              <div className="text-ink-900 font-semibold">{fullDate(shown.date)}</div>
              {shown.runs > 0 ? (
                <div className="tabular-nums">
                  <span className="text-ink-600">
                    {formatNumber(shown.outputKg, 0)} kg · {shown.runs}{' '}
                    {shown.runs === 1 ? 'run' : 'runs'}
                  </span>
                  <span className="text-warning-700"> · {shown.wastePercent}% waste</span>
                </div>
              ) : (
                <div className="text-ink-400">nothing finished</div>
              )}
            </>
          ) : (
            <div className="text-ink-400 hidden sm:block">Hover a day for its figures</div>
          )}
        </div>
      </div>

      {/*
       * The drawing keeps its own size and scrolls on a narrow screen rather
       * than shrinking to fit. An SVG with a fixed viewBox scales both axes
       * together, so at phone width the whole chart — ten-pixel axis labels
       * included — came out at under half size and could not be read. A
       * fortnight is fourteen columns wide whatever the screen is.
       */}
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[190px] w-full min-w-[620px]"
          role="img"
          aria-label={`Output and waste for the last ${trend.length} days. ${formatNumber(fortnight.outputKg, 0)} kilograms made, ${fortnight.wastePercent}% waste.`}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-500)" />
              <stop offset="100%" stopColor="var(--color-brand-400)" />
            </linearGradient>
          </defs>

          {/* Four gridlines, each labelled with a weight the chart reaches. */}
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = PAD.top + PLOT_H - step * PLOT_H;
            return (
              <g key={step}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke="var(--color-ink-100)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--color-ink-400)"
                >
                  {step === 0 ? '0' : formatNumber(kgTop * step, 0)}
                </text>
                <text
                  x={W - PAD.right + 8}
                  y={y + 3.5}
                  fontSize="10"
                  fill="var(--color-warning-600)"
                  opacity={step === 0 ? 0.55 : 1}
                >
                  {step === 0 ? '0' : `${Math.round(pctTop * step * 10) / 10}%`}
                </text>
              </g>
            );
          })}

          {/* The bars: what came off the machines. */}
          {trend.map((day, index) => {
            const y = yOfKg(day.outputKg);
            const quiet = day.runs === 0;
            return (
              <g key={day.date} onMouseEnter={() => setHovered(index)} className="cursor-default">
                {/* A full-height target, so the tooltip catches a quiet day too. */}
                <rect
                  x={xOf(index) - band / 2}
                  y={PAD.top}
                  width={band}
                  height={PLOT_H}
                  fill={hovered === index ? 'var(--color-ink-50)' : 'transparent'}
                />
                {quiet ? (
                  <line
                    x1={xOf(index) - barW / 2}
                    y1={PAD.top + PLOT_H}
                    x2={xOf(index) + barW / 2}
                    y2={PAD.top + PLOT_H}
                    stroke="var(--color-ink-200)"
                    strokeWidth="2"
                  />
                ) : (
                  <rect
                    x={xOf(index) - barW / 2}
                    y={y}
                    width={barW}
                    height={Math.max(2, PAD.top + PLOT_H - y)}
                    rx="3"
                    fill={`url(#${gradientId})`}
                    opacity={hovered === null || hovered === index ? 1 : 0.45}
                  />
                )}
                {index % labelEvery === 0 || index === trend.length - 1 || hovered === index ? (
                  <text
                    x={xOf(index)}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill={hovered === index ? 'var(--color-ink-700)' : 'var(--color-ink-400)'}
                  >
                    {dayLabel(day.date)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* The waste line, over the top. */}
          {segments.map((days) => (
            <polyline
              key={days[0]?.date}
              points={pointsOf(days)}
              fill="none"
              stroke="var(--color-warning-500)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {trend.map((day, index) =>
            day.runs > 0 ? (
              <circle
                key={day.date}
                cx={xOf(index)}
                cy={yOfPct(day.wastePercent)}
                r={hovered === index ? 4 : 2.75}
                fill="white"
                stroke="var(--color-warning-500)"
                strokeWidth="2"
              />
            ) : null,
          )}

          {/* The floor of the plot, so the bars sit on something. */}
          <line
            x1={PAD.left}
            y1={PAD.top + PLOT_H}
            x2={W - PAD.right}
            y2={PAD.top + PLOT_H}
            stroke="var(--color-ink-200)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="text-ink-500 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-brand-500 inline-block size-2.5 rounded-sm" />
          Kilograms off the machines
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-warning-500 inline-block h-0.5 w-3.5 rounded-full" />
          Waste, against what went on
        </span>
      </div>
    </div>
  );
}

/** One of the three figures above the chart. */
function Figure({
  label,
  value,
  unit,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  unit: string;
  hint: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div>
      <div className="text-ink-500 text-[11px] font-medium tracking-wider uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 flex items-baseline gap-1 font-semibold tabular-nums',
          tone === 'warn' ? 'text-warning-700' : 'text-ink-900',
        )}
      >
        <span className="text-2xl leading-none">{value}</span>
        <span className="text-ink-500 text-sm">{unit}</span>
      </div>
      <div className="text-ink-400 mt-0.5 text-xs">{hint}</div>
    </div>
  );
}
