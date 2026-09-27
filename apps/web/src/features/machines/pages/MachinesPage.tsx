import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, History, Wrench } from 'lucide-react';
import {
  formatNumber,
  formatStanding,
  MACHINE_STATE_LABELS,
  MAINTENANCE_KIND_LABELS,
  type MachineCard,
  type MachineState,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { cn } from '@/lib/utils';
import { MaintenanceModal } from '../components/MaintenanceModal';
import { useMachineBoard } from '../api/machine-api';

const TONE: Record<MachineState, 'danger' | 'success' | 'neutral'> = {
  DOWN: 'danger',
  RUNNING: 'success',
  IDLE: 'neutral',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One figure on a machine card. Dashes where there is nothing to say. */
function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <div className="text-ink-400 text-[11px] font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          'text-ink-900 mt-0.5 text-base font-semibold tabular-nums',
          tone === 'warn' && 'text-warning-700',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * **Machines — where each one is, and why one is standing.**
 *
 * Almost nothing on this screen is stored. What is on a machine is the stage
 * running on it; who is on it is that stage's operator; today's output and
 * waste are the stages that finished on it today; and the time it has stood is
 * the pauses and problems the machine screen has been recording all along.
 * None of it is a figure anybody maintains, so none of it can go stale.
 *
 * The one stored fact is maintenance, and even that has no flag: a record with
 * no end **is** the machine being down. A status somebody has to remember to
 * clear is a status that is wrong, and the press would read "under
 * maintenance" for a fortnight after it came back.
 *
 * **Down sorts first**, because it is the only card asking for something.
 */
export default function MachinesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'jobs');

  const [editing, setEditing] = useState<MachineCard | null>(null);
  const { data, isLoading } = useMachineBoard({ days: 14 });

  const machines = data?.machines ?? [];
  const totals = data?.totals;
  const closed = (data?.history ?? []).filter((record) => record.endedAt);

  if (isLoading) return <LoadingState label="Looking across the floor…" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Machines</h1>
        <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
          Where each machine is and what is on it. Everything here is worked out from the floor's
          own records — what a machine costs to run lives on the Costing screen.
        </p>
      </header>

      {totals ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Running', value: String(totals.running), alarm: false },
            { label: 'Idle', value: String(totals.idle), alarm: false },
            { label: 'Down', value: String(totals.down), alarm: totals.down > 0 },
            {
              label: 'Made today',
              value: `${formatNumber(totals.outputKg, 0)} kg`,
              alarm: false,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={cn(
                'rounded-[var(--radius-lg)] border bg-white px-4 py-3',
                stat.alarm ? 'border-danger-200' : 'border-ink-200',
              )}
            >
              <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">
                {stat.label}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-xl font-bold tabular-nums',
                  stat.alarm ? 'text-danger-600' : 'text-ink-900',
                )}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {machines.map((machine) => (
          <article
            key={machine.id}
            className={cn(
              'rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5',
              machine.state === 'DOWN' ? 'border-danger-200 bg-danger-50/20' : 'border-ink-200',
            )}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-ink-900 text-base font-semibold">{machine.name}</h2>
                  <Badge tone={TONE[machine.state]}>{MACHINE_STATE_LABELS[machine.state]}</Badge>
                  {!machine.isActive ? <Badge tone="warning">Retired</Badge> : null}
                </div>

                {machine.down ? (
                  <p className="text-danger-700 mt-1 text-sm">
                    {MAINTENANCE_KIND_LABELS[machine.down.kind]} · {machine.down.reason}
                    <span className="text-ink-500">
                      {' '}
                      — {formatStanding(machine.down.minutes)}, since {when(machine.down.startedAt)}
                    </span>
                  </p>
                ) : machine.job ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/production/${machine.job!.cardId}`)}
                    className="text-ink-600 mt-1 block text-left text-sm hover:underline"
                  >
                    Order #{machine.job.orderNumber} · {machine.job.jobName}
                    <span className="text-ink-400"> · {machine.job.customerName}</span>
                  </button>
                ) : (
                  <p className="text-ink-400 mt-1 text-sm">
                    Nothing on it
                    {machine.booked > 0
                      ? ` · ${machine.booked} booked in Planning`
                      : ' · nothing booked'}
                  </p>
                )}
              </div>

              {canEdit ? (
                <Button
                  variant={machine.state === 'DOWN' ? 'primary' : 'ghost'}
                  onClick={() => setEditing(machine)}
                >
                  <Wrench className="size-4" />
                  {machine.state === 'DOWN' ? 'Back up' : 'Put down'}
                </Button>
              ) : null}
            </div>

            <div className="border-ink-100 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
              <Figure
                label="On it"
                value={machine.job?.operator || (machine.state === 'DOWN' ? '—' : 'nobody')}
              />
              <Figure
                label="Made today"
                value={machine.runs > 0 ? `${formatNumber(machine.outputKg, 0)} kg` : '—'}
              />
              <Figure
                label="Waste"
                value={machine.runs > 0 ? `${machine.wastePercent}%` : '—'}
                tone={machine.wastePercent >= 5 ? 'warn' : undefined}
              />
              <Figure
                label="Stood today"
                value={formatStanding(machine.standingMinutes)}
                tone={machine.standingMinutes > 0 ? 'warn' : undefined}
              />
            </div>
          </article>
        ))}
      </div>

      {/*
        The service history. Only closed spells — what is open is on the card
        above, where somebody can act on it.
      */}
      {closed.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-ink-900 mb-3 flex items-center gap-2 text-base font-semibold">
            <History className="text-ink-400 size-4" />
            Recently back
          </h2>
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Machine</th>
                    <th className="px-4 py-2.5 font-medium">Why</th>
                    <th className="px-4 py-2.5 font-medium">What was done</th>
                    <th className="px-4 py-2.5 text-right font-medium">Down for</th>
                    <th className="px-4 py-2.5 font-medium">Back</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {closed.map((record) => (
                    <tr key={record.id}>
                      <td className="text-ink-900 px-4 py-2.5 font-medium">
                        {record.machineName}
                        <div className="text-ink-400 text-xs font-normal">
                          {MAINTENANCE_KIND_LABELS[record.kind]} · {record.number}
                        </div>
                      </td>
                      <td className="text-ink-700 px-4 py-2.5">{record.reason}</td>
                      <td className="text-ink-600 px-4 py-2.5">
                        {record.workDone || <span className="text-ink-300">not written down</span>}
                      </td>
                      <td className="text-ink-900 px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatStanding(record.minutes)}
                      </td>
                      <td className="text-ink-500 px-4 py-2.5 text-xs whitespace-nowrap">
                        {record.endedAt ? when(record.endedAt) : ''}
                        {record.closedBy ? (
                          <div className="text-ink-400">{record.closedBy}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-ink-400 mt-6 flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5" />
          Nothing has been down in the last fortnight.
        </p>
      )}

      <MaintenanceModal machine={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
