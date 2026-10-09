import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleAlert, Pause, Play, Settings2, Wrench } from 'lucide-react';
import {
  formatNumber,
  greeting,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  type FloorJob,
  type IssueSeverity,
} from '@yuva/shared';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { FloorButton, FloorChoice, FloorStat, FloorWeight } from '../components/FloorBits';
import {
  useFinishJob,
  useFloorBoard,
  useFloorMachines,
  useHoldJob,
  useResumeJob,
  useStartJob,
} from '../api/floor-api';

/*
 * What the tablet remembers.
 *
 * A screen bolted to a press is set up once and then never touched again, so
 * the machine has to survive a reload, a flat battery and somebody closing the
 * tab. The operator is remembered too, for the length of a shift — it saves
 * every action asking who you are, and "Not you?" is one tap away.
 *
 * Wrapped because a tablet in kiosk mode can have storage disabled, and a
 * screen that throws on load is a screen nobody can use at all.
 */
const MACHINE_KEY = 'yuva.floor.machine';
const OPERATOR_KEY = 'yuva.floor.operator';

function remembered(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function remember(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* Storage off. The screen still works, it just asks again next time. */
  }
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * **The machine screen.**
 *
 * One tablet, one machine, one job, four buttons. It is deliberately not the
 * office: no sidebar, no navigation, nothing to scroll past and nothing that
 * can be pressed by mistake on the way to the thing you meant. Dark, because
 * it lives under factory lighting beside a press.
 *
 * Everything it records goes through the same service the office screen uses,
 * so a job started here is indistinguishable on the production run from one typed in
 * by a supervisor — except that the operator's name on it is now the person
 * who actually ran the machine, rather than whoever the office remembered on
 * Friday afternoon.
 */
export default function FloorPage() {
  const [machineId, setMachineId] = useState(() => remembered(MACHINE_KEY));
  const [operatorId, setOperatorId] = useState(() => remembered(OPERATOR_KEY));
  const [pickingOperator, setPickingOperator] = useState(false);

  const [weight, setWeight] = useState('');
  const [stopping, setStopping] = useState<'PAUSED' | 'ISSUE' | null>(null);
  const [reason, setReason] = useState('');
  /* Asked at the machine, because the operator is the one who can see whether
     the press is making scrap. Ignored on a pause — a break is not a defect. */
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');

  const { data: machines } = useFloorMachines();
  const { data: board, isLoading } = useFloorBoard(machineId || null);
  const start = useStartJob();
  const finish = useFinishJob();
  const hold = useHoldJob();
  const resume = useResumeJob();

  const job: FloorJob | null = board?.current ?? null;
  const operator = board?.operators.find((person) => person.id === operatorId) ?? null;
  const busy = start.isPending || finish.isPending || hold.isPending || resume.isPending;

  /* The weight box starts from what the job already knows: the reel the last
     machine handed over, which is almost always the right answer. */
  useEffect(() => {
    if (!job) return;
    setWeight(job.action === 'FINISH' ? '' : job.inputKg ? String(job.inputKg) : '');
  }, [job?.stageId, job?.action]);

  /* A remembered name that is no longer on the books is not a name. */
  useEffect(() => {
    if (operatorId && board && !operator) setOperatorId('');
  }, [board, operator, operatorId]);

  function choose(id: string) {
    setMachineId(id);
    remember(MACHINE_KEY, id);
  }

  function chooseOperator(id: string) {
    setOperatorId(id);
    remember(OPERATOR_KEY, id);
    setPickingOperator(false);
  }

  async function run(what: 'start' | 'finish' | 'resume') {
    if (!job || !operatorId) return;
    const common = { stageId: job.stageId, machineId };
    try {
      if (what === 'start') {
        await start.mutateAsync({
          ...common,
          input: { operatorId, inputKg: Number(weight) || 0 },
        });
        toast.success('Started');
      } else if (what === 'finish') {
        if (!Number(weight)) {
          toast.error('Enter what came off the machine');
          return;
        }
        await finish.mutateAsync({
          ...common,
          input: { operatorId, outputKg: Number(weight) },
        });
        toast.success('Finished — the next machine has it');
      } else {
        await resume.mutateAsync({ ...common, input: { operatorId, note: '' } });
        toast.success('Running again');
      }
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not do that');
    }
  }

  async function stop() {
    if (!job || !operatorId || !stopping) return;
    try {
      await hold.mutateAsync({
        stageId: job.stageId,
        machineId,
        input: { operatorId, kind: stopping, note: reason, severity },
      });
      toast.success(stopping === 'ISSUE' ? 'Problem recorded — job stopped' : 'Job paused');
      setStopping(null);
      setReason('');
      setSeverity('MEDIUM');
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not stop it');
    }
  }

  /* ---------------------------------------------------------- the machine */

  if (!machineId || !board?.machine) {
    return (
      <Shell>
        <h1 className="mb-1 text-ink-900 text-3xl font-bold">Which machine is this?</h1>
        <p className="text-ink-500 mb-6">
          Asked once. This tablet will remember, and show only the work at that machine.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(machines ?? []).map((machine) => (
            <FloorChoice
              key={machine.id}
              label={machine.name}
              hint={`${machine.waiting} job${machine.waiting === 1 ? '' : 's'} waiting`}
              onClick={() => choose(machine.id)}
            />
          ))}
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------- down for repair */

  /*
   * Before the operator picker, and that ordering is the whole point.
   *
   * A machine that is down offers no work and therefore no operators, so
   * asking "who is on the machine?" first left a tablet showing an empty list
   * with nothing to tap — the operator could not get past it to find out why.
   */
  if (board.machine.downFor) {
    return (
      <Shell>
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="text-ink-900 text-2xl font-bold sm:text-3xl">{board.machine.name}</div>
          <button
            type="button"
            onClick={() => choose('')}
            className="flex items-center gap-2 rounded-xl border-ink-200 text-ink-800 hover:bg-ink-100 border bg-white px-4 py-2.5"
          >
            <Settings2 className="size-4 text-ink-400" />
            Another machine
          </button>
        </header>
        <div className="border-warning-200 bg-warning-50 rounded-3xl border p-10 text-center">
          <Wrench className="mx-auto size-8 text-warning-600" />
          <div className="mt-3 text-ink-900 text-2xl font-bold">This machine is down</div>
          <p className="text-ink-700 mt-2">{board.machine.downFor}</p>
          <p className="text-ink-500 mt-2 text-sm">
            Nothing can be started on it until the office puts it back up.
          </p>
        </div>
      </Shell>
    );
  }

  /* --------------------------------------------------------- who is on it */

  if (!operatorId || pickingOperator) {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => choose('')}
          className="text-ink-500 hover:text-ink-900 mb-6 text-sm"
        >
          ← {board.machine.name}
        </button>
        <h1 className="mb-1 text-ink-900 text-3xl font-bold">Who is on the machine?</h1>
        <p className="text-ink-500 mb-6">
          Your name goes on every reel you run, so the office is not guessing on Friday.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(board.operators ?? []).map((person) => (
            <FloorChoice
              key={person.id}
              label={person.name}
              hint={person.suggested ? `Usually on ${board.machine?.name}` : undefined}
              selected={person.id === operatorId}
              onClick={() => chooseOperator(person.id)}
            />
          ))}
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------- the job */

  const held = job?.cardStatus === 'ON_HOLD';
  const blocked = Boolean(job && job.shortOf.length > 0 && !job.canStartShort);
  const lastStop = job?.events.find((event) => event.kind !== 'RESUMED') ?? null;
  /*
   * A defect outranks a break. The press starting again in ten minutes does
   * not close the issue, so it is what the next shift needs to see first.
   */
  const openIssue = job?.issues[0] ?? null;

  return (
    <Shell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-ink-900 text-2xl font-bold sm:text-3xl">
            {greeting(new Date().getHours())}
            {operator ? `, ${operator.name.split(' ')[0]}` : ''}
          </div>
          <button
            type="button"
            onClick={() => setPickingOperator(true)}
            className="text-ink-500 hover:text-ink-900 mt-1 text-sm underline-offset-4 hover:underline"
          >
            Not you?
          </button>
        </div>
        <button
          type="button"
          onClick={() => choose('')}
          className="flex items-center gap-2 rounded-xl border-ink-200 text-ink-800 hover:bg-ink-100 border bg-white px-4 py-2.5"
        >
          <Settings2 className="size-4 text-ink-400" />
          <span className="font-semibold">{board.machine.name}</span>
        </button>
      </header>

      {isLoading ? (
        <p className="text-ink-500">Looking for work at this machine…</p>
      ) : !job ? (
        <div className="border-ink-200 rounded-3xl border bg-white p-10 text-center">
          <div className="text-ink-900 text-2xl font-bold">Nothing waiting</div>
          <p className="mt-2 text-ink-500">
            No job has reached {board.machine.name} yet. The screen will pick one up on its own.
          </p>
        </div>
      ) : (
        <>
          <div className="border-ink-200 rounded-3xl border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium tracking-widest text-ink-400 uppercase">
                  Current job
                </div>
                <div className="mt-1 text-ink-900 text-3xl font-bold">Order #{job.orderNumber}</div>
                <div className="mt-0.5 text-lg text-ink-700">{job.jobName}</div>
                <div className="text-sm text-ink-400">{job.customerName}</div>
              </div>
              <div className="text-right">
                <div className="text-lg text-ink-900 font-semibold">{job.stageLabel}</div>
                <div className="text-sm text-ink-400">
                  step {job.position} of {job.stageCount}
                </div>
                {job.dueDate ? (
                  <div
                    className={cn(
                      'mt-1 text-sm',
                      job.isOverdue ? 'text-danger-600' : 'text-ink-400',
                    )}
                  >
                    due {formatDate(job.dueDate)}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FloorStat label="Ordered" value={formatNumber(job.orderQuantityKg, 0)} unit="kg" />
              <FloorStat label="On the machine" value={formatNumber(job.inputKg, 1)} unit="kg" />
              <FloorStat
                label="Came off"
                value={job.outputKg ? formatNumber(job.outputKg, 1) : '—'}
                unit={job.outputKg ? 'kg' : undefined}
              />
              <FloorStat
                label="Waste"
                value={job.outputKg ? formatNumber(job.wasteKg, 1) : '—'}
                unit={job.outputKg ? `kg · ${job.wastePercent}%` : undefined}
                tone={job.wasteKg > 0 ? 'warn' : 'plain'}
              />
            </div>
          </div>

          {/* Why it is stopped, in the operator's own words, at the top where
              the next person on shift will actually see it. */}
          {openIssue ? (
            <div className="mt-4 flex items-start gap-3 border-warning-200 bg-warning-50 rounded-2xl border p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-600" />
              <div>
                <div className="font-semibold text-warning-800">
                  Problem {openIssue.number} · {ISSUE_SEVERITY_LABELS[openIssue.severity]}
                </div>
                <p className="mt-0.5 text-ink-700">{openIssue.title}</p>
                <p className="mt-1 text-sm text-ink-400">
                  {openIssue.raisedBy} · {new Date(openIssue.createdAt).toLocaleString('en-IN')} ·
                  still open
                </p>
              </div>
            </div>
          ) : held && lastStop ? (
            <div className="mt-4 flex items-start gap-3 border-ink-200 rounded-2xl border bg-white p-4">
              <Pause className="mt-0.5 size-5 shrink-0 text-ink-400" />
              <div>
                <div className="text-ink-900 font-semibold">Paused</div>
                <p className="mt-0.5 text-ink-700">{lastStop.note}</p>
                <p className="mt-1 text-sm text-ink-400">
                  {lastStop.operator} · {new Date(lastStop.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          ) : null}

          {blocked ? (
            <div className="mt-4 flex items-start gap-3 border-danger-200 bg-danger-50 rounded-2xl border p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-600" />
              <div>
                <div className="font-semibold text-danger-800">The film is not in</div>
                <p className="mt-0.5 text-ink-700">
                  Short of {job.shortOf.join(', ')}. Ask the office before running this.
                </p>
              </div>
            </div>
          ) : null}

          {/* The weight, asked for at the moment it is known and not before. */}
          {!held && (job.action === 'START' || job.action === 'FINISH') ? (
            <div className="mt-4">
              <FloorWeight
                label={job.action === 'START' ? 'Weight going on' : 'Weight coming off'}
                value={weight}
                onChange={setWeight}
              />
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {held ? (
              <FloorButton tone="start" full disabled={busy} onClick={() => void run('resume')}>
                <Play className="size-6" />
                Start again
              </FloorButton>
            ) : job.action === 'START' ? (
              <FloorButton
                tone="start"
                full
                disabled={busy || blocked}
                onClick={() => void run('start')}
              >
                <Play className="size-6" />
                Start job
              </FloorButton>
            ) : job.action === 'FINISH' ? (
              <FloorButton tone="finish" full disabled={busy} onClick={() => void run('finish')}>
                <Check className="size-6" />
                Complete job
              </FloorButton>
            ) : null}

            {!held && job.isRunning ? (
              <div className="grid grid-cols-2 gap-3">
                <FloorButton tone="pause" disabled={busy} onClick={() => setStopping('PAUSED')}>
                  <Pause className="size-5" />
                  Pause
                </FloorButton>
                <FloorButton tone="issue" disabled={busy} onClick={() => setStopping('ISSUE')}>
                  <CircleAlert className="size-5" />
                  Problem
                </FloorButton>
              </div>
            ) : null}
          </div>

          {board.waiting.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-2 text-xs font-medium tracking-widest text-ink-400 uppercase">
                Next at this machine
              </h2>
              <ul className="divide-y divide-ink-100 border-ink-200 overflow-hidden rounded-2xl border bg-white">
                {board.waiting.slice(0, 4).map((next) => (
                  <li
                    key={next.stageId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink-900 font-semibold">#{next.orderNumber}</span>{' '}
                      <span className="text-ink-600">{next.jobName}</span>
                    </span>
                    <span className="shrink-0 text-sm text-ink-400">
                      {next.stageLabel}
                      {next.dueDate ? ` · ${formatDate(next.dueDate)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {/* Stopping, and saying why. A full-screen sheet rather than a dialog:
          there is one thing to do and it should fill the screen. */}
      {stopping ? (
        <div className="bg-ink-900/50 fixed inset-0 z-50 flex items-end justify-center p-4 backdrop-blur sm:items-center">
          <div className="border-ink-200 w-full max-w-lg rounded-3xl border bg-white p-6 shadow-[var(--shadow-elevated)]">
            <h2 className="text-ink-900 text-2xl font-bold">
              {stopping === 'ISSUE' ? 'What is wrong?' : 'Why are you pausing?'}
            </h2>
            <p className="text-ink-500 mt-1">
              {stopping === 'ISSUE'
                ? 'The job stops, and this stays on the quality list until somebody closes it.'
                : 'The job stops. This is what the office will see.'}
            </p>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                stopping === 'ISSUE'
                  ? 'Registration drifting on the third colour'
                  : 'Break — back in twenty minutes'
              }
              className="border-ink-300 text-ink-900 placeholder:text-ink-400 focus:ring-brand-300 mt-4 w-full rounded-2xl border bg-white px-4 py-3 text-lg focus:ring-4 focus:outline-none"
            />
            {stopping === 'ISSUE' ? (
              <div className="mt-4">
                <div className="text-xs font-medium tracking-widest text-ink-400 uppercase">
                  How bad
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {ISSUE_SEVERITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSeverity(value)}
                      className={cn(
                        'min-h-[56px] rounded-2xl text-base font-bold uppercase',
                        'focus-visible:ring-brand-300 focus-visible:ring-4 focus-visible:outline-none',
                        severity === value
                          ? value === 'HIGH'
                            ? 'bg-danger-600 text-white'
                            : value === 'MEDIUM'
                              ? 'bg-warning-500 text-white'
                              : 'bg-ink-600 text-white'
                          : 'border-ink-300 text-ink-600 border bg-white',
                      )}
                    >
                      {ISSUE_SEVERITY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <FloorButton
                tone="pause"
                onClick={() => {
                  setStopping(null);
                  setReason('');
                  setSeverity('MEDIUM');
                }}
              >
                Back
              </FloorButton>
              <FloorButton
                tone="issue"
                disabled={reason.trim().length < 3 || busy}
                onClick={() => void stop()}
              >
                Stop the job
              </FloorButton>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

/** Dark, full-bleed, and no navigation. This screen is not the office. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-50 min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
