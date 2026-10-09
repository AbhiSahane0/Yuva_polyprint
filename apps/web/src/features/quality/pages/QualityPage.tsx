import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, ShieldCheck } from 'lucide-react';
import {
  formatNumber,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  PRODUCTION_STAGE_LABELS,
  type IssueSeverity,
  type QualityIssue,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { IssueModal } from '../components/IssueModal';
import { useQualityBoard } from '../api/quality-api';

const SEVERITY_TONE: Record<IssueSeverity, 'danger' | 'warning' | 'neutral'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}`;
}

function Stat({
  label,
  value,
  hint,
  alarm,
}: {
  label: string;
  value: string;
  hint?: string;
  alarm?: boolean;
}) {
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
      {hint ? <div className="text-ink-400 mt-0.5 text-xs">{hint}</div> : null}
    </div>
  );
}

/**
 * **Quality & waste.**
 *
 * Two questions on one screen, and they are deliberately different numbers.
 *
 * **Where is the material going?** Waste by process, and the last fortnight
 * day by day. Nothing here is newly recorded — every stage has said what went
 * on and what came off since the production run was built. Grouping it by process is
 * the whole point: a works losing 6% at lamination and 1% everywhere else has
 * a laminator problem, and no amount of staring at individual jobs says so.
 *
 * **What is still wrong?** The issues, worst first, and the oldest of those
 * above the newest — an issue open a week outranks one raised this morning,
 * because it is the one being ignored.
 *
 * A **rejection** is the one figure that leaves this screen: finished film
 * that cannot be sent, which Dispatch counts out of the godown. It is never
 * added to waste. The material left the shelf once and was lost once.
 */
export default function QualityPage() {
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'jobs');

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [editing, setEditing] = useState<QualityIssue | null>(null);
  const [raising, setRaising] = useState(false);
  const debounced = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      ...(debounced ? { q: debounced } : {}),
      ...(severity ? { severity: severity as IssueSeverity } : {}),
      ...(openOnly ? { openOnly: true } : {}),
      days: 14,
    }),
    [debounced, severity, openOnly],
  );

  const { data, isLoading } = useQualityBoard(params);
  const totals = data?.totals;
  const issues = data?.issues ?? [];
  const byStage = data?.byStage ?? [];
  const trend = data?.trend ?? [];

  /* The tallest day sets the scale. An empty fortnight draws flat rather than
     dividing by zero. */
  const peak = Math.max(1, ...trend.map((day) => day.wasteKg));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Quality &amp; waste</h1>
          <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
            Where material is being lost, and what is still wrong. Waste is what the machine lost
            and is already on every stage; a rejection is finished film that cannot be sent, and
            Dispatch counts it out of the godown.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setRaising(true)}>
            <Plus className="size-4" />
            Log an issue
          </Button>
        ) : null}
      </header>

      {totals ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Waste today"
            value={`${totals.todayWastePercent}%`}
            hint={`${formatNumber(totals.todayWasteKg, 1)} kg`}
          />
          <Stat
            label="Rejected"
            value={`${formatNumber(totals.rejectedKg, 0)} kg`}
            hint="cannot be sent"
            alarm={totals.rejectedKg > 0}
          />
          <Stat label="Open issues" value={String(totals.openIssues)} />
          <Stat
            label="High severity"
            value={String(totals.highSeverity)}
            hint="open"
            alarm={totals.highSeverity > 0}
          />
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
          <h2 className="text-ink-800 mb-1 text-xs font-semibold tracking-wider uppercase">
            Waste by stage
          </h2>
          <p className="text-ink-500 mb-3 text-sm">
            Last fortnight. The percentage is what to compare, not the weight.
          </p>
          {byStage.length === 0 ? (
            <p className="text-ink-400 text-sm">No stage has finished in the last fortnight.</p>
          ) : (
            <ul className="space-y-2.5">
              {byStage.map((row) => (
                <li key={row.stage}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink-700">
                      {PRODUCTION_STAGE_LABELS[row.stage] ?? row.stage}
                      <span className="text-ink-400 ml-1.5 text-xs">
                        {row.runs} run{row.runs === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="text-ink-900 font-semibold tabular-nums">
                      {formatNumber(row.wasteKg, 1)} kg
                      <span className="text-ink-500 ml-1.5 font-normal">{row.percent}%</span>
                    </span>
                  </div>
                  <div className="bg-ink-100 h-2 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        row.percent >= 8
                          ? 'bg-danger-500'
                          : row.percent >= 5
                            ? 'bg-warning-500'
                            : 'bg-brand-500',
                      )}
                      /* Against the worst stage, so the bars compare with each
                         other rather than with an arbitrary ceiling. */
                      style={{
                        width: `${Math.max(3, (row.wasteKg / Math.max(1, byStage[0]!.wasteKg)) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
          <h2 className="text-ink-800 mb-1 text-xs font-semibold tracking-wider uppercase">
            Waste, last fortnight
          </h2>
          <p className="text-ink-500 mb-3 text-sm">
            Quiet days are noughts, not gaps — a fortnight with the empty days left out is not a
            trend.
          </p>
          {/*
            Stretch, not items-end. With items-end each column shrinks to its
            content, and the bar's percentage height then resolves against a
            zero-height parent — the chart renders blank, silently, with every
            figure behind it correct.
          */}
          <div className="flex h-32 items-stretch gap-1">
            {trend.map((day) => (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col justify-end"
                title={`${shortDate(day.date)} — ${formatNumber(day.wasteKg, 1)} kg of ${formatNumber(day.inputKg, 0)} kg (${day.percent}%)`}
              >
                <div
                  className={cn(
                    'w-full rounded-t',
                    day.wasteKg === 0 ? 'bg-ink-100' : 'bg-brand-400 group-hover:bg-brand-500',
                  )}
                  style={{ height: `${Math.max(2, (day.wasteKg / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="text-ink-400 mt-1.5 flex justify-between text-xs">
            <span>{trend[0] ? shortDate(trend[0].date) : ''}</span>
            <span>today</span>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Issue, job, customer, who is on it…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search issues"
            />
          </div>
          <div className="sm:w-40">
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              aria-label="Filter by severity"
            >
              <option value="">Any severity</option>
              {ISSUE_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {ISSUE_SEVERITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant={openOnly ? 'primary' : 'secondary'}
            onClick={() => setOpenOnly(!openOnly)}
          >
            {openOnly ? 'Open only' : 'All issues'}
          </Button>
        </div>

        {isLoading ? (
          <LoadingState label="Working out where it is going…" />
        ) : issues.length === 0 ? (
          <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
            <EmptyState
              title={openOnly && !search && !severity ? 'Nothing open' : 'Nothing matches that'}
              description={
                openOnly && !search && !severity
                  ? 'No issue is outstanding. The machine screen raises one when an operator presses Problem.'
                  : 'Try a different search, or show all issues.'
              }
            />
          </div>
        ) : (
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Issue</th>
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 font-medium">Found at</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rejected</th>
                    <th className="px-4 py-2.5 font-medium">How bad</th>
                    <th className="px-4 py-2.5 font-medium">On it</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {issues.map((issue) => (
                    <tr
                      key={issue.id}
                      onClick={() => canEdit && setEditing(issue)}
                      className={cn(
                        canEdit && 'hover:bg-ink-25 cursor-pointer',
                        issue.isOpen && issue.severity === 'HIGH' && 'bg-danger-50/30',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="text-ink-900 font-medium">{issue.title}</div>
                        <div className="text-ink-400 text-xs">
                          #{issue.number} · raised by {issue.raisedBy || 'the works'}
                          {issue.isOpen && issue.openForDays > 0
                            ? ` · open ${issue.openForDays}d`
                            : ''}
                        </div>
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">
                        {issue.jobName}
                        <div className="text-ink-400 text-xs">
                          card #{issue.cardNumber} · {issue.customerName}
                        </div>
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs">{issue.stageLabel}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {issue.rejectedKg > 0 ? (
                          <span className="text-danger-700 font-medium">
                            {formatNumber(issue.rejectedKg, 1)} kg
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={SEVERITY_TONE[issue.severity]}>
                          {ISSUE_SEVERITY_LABELS[issue.severity]}
                        </Badge>
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs">
                        {issue.responsibleName || <span className="text-ink-300">nobody</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={issue.isOpen ? 'neutral' : 'success'}>
                          {ISSUE_STATUS_LABELS[issue.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* An issue nobody owns is one nobody closes — said once, under the
            list, where it reads as a nudge rather than an error. */}
        {issues.some((issue) => issue.isOpen && !issue.responsibleName) ? (
          <p className="text-ink-400 mt-3 flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5" />
            Some open issues have nobody answerable for them.
          </p>
        ) : issues.length > 0 && issues.every((issue) => !issue.isOpen) ? (
          <p className="text-ink-400 mt-3 flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" />
            Everything here is closed.
          </p>
        ) : null}
      </section>

      <IssueModal
        issue={editing}
        open={raising || Boolean(editing)}
        onClose={() => {
          setRaising(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
