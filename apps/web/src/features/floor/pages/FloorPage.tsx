import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleAlert, Pause, Play, Settings2 } from 'lucide-react';
import { formatNumber, greeting, type FloorJob } from '@yuva/shared';
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
 * so a job started here is indistinguishable on the job card from one typed in
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
        input: { operatorId, kind: stopping, note: reason },
      });
      toast.success(stopping === 'ISSUE' ? 'Problem recorded — job stopped' : 'Job paused');
      setStopping(null);
      setReason('');
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not stop it');
    }
  }

  /* ---------------------------------------------------------- the machine */

  if (!machineId || !board?.machine) {
    return (
      <Shell>
        <h1 className="mb-1 text-3xl font-bold text-white">Which machine is this?</h1>
        <p className="mb-6 text-white/50">
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

  /* --------------------------------------------------------- who is on it */

  if (!operatorId || pickingOperator) {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => choose('')}
          className="mb-6 text-sm text-white/40 hover:text-white"
        >
          ← {board.machine.name}
        </button>
        <h1 className="mb-1 text-3xl font-bold text-white">Who is on the machine?</h1>
        <p className="mb-6 text-white/50">
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

  return (
    <Shell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-white sm:text-3xl">
            {greeting(new Date().getHours())}
            {operator ? `, ${operator.name.split(' ')[0]}` : ''}
          </div>
          <button
            type="button"
            onClick={() => setPickingOperator(true)}
            className="mt-1 text-sm text-white/40 underline-offset-4 hover:text-white hover:underline"
          >
            Not you?
          </button>
        </div>
        <button
          type="button"
          onClick={() => choose('')}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-white ring-1 ring-white/10 hover:bg-white/10"
        >
          <Settings2 className="size-4 text-white/40" />
          <span className="font-semibold">{board.machine.name}</span>
        </button>
      </header>

      {isLoading ? (
        <p className="text-white/50">Looking for work at this machine…</p>
      ) : !job ? (
        <div className="rounded-3xl bg-white/5 p-10 text-center ring-1 ring-white/10">
          <div className="text-2xl font-bold text-white">Nothing waiting</div>
          <p className="mt-2 text-white/50">
            No job has reached {board.machine.name} yet. The screen will pick one up on its own.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium tracking-widest text-white/40 uppercase">
                  Current job
                </div>
                <div className="mt-1 text-3xl font-bold text-white">Order #{job.orderNumber}</div>
                <div className="mt-0.5 text-lg text-white/70">{job.jobName}</div>
                <div className="text-sm text-white/40">{job.customerName}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-white">{job.stageLabel}</div>
                <div className="text-sm text-white/40">
                  step {job.position} of {job.stageCount}
                </div>
                {job.dueDate ? (
                  <div
                    className={cn('mt-1 text-sm', job.isOverdue ? 'text-red-300' : 'text-white/40')}
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
          {held && lastStop ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-500/15 p-4 ring-1 ring-amber-400/30">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div>
                <div className="font-semibold text-amber-200">
                  Stopped — {lastStop.kind === 'ISSUE' ? 'problem' : 'paused'}
                </div>
                <p className="mt-0.5 text-white/80">{lastStop.note}</p>
                <p className="mt-1 text-sm text-white/40">
                  {lastStop.operator} · {new Date(lastStop.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          ) : null}

          {blocked ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-red-500/15 p-4 ring-1 ring-red-400/30">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
              <div>
                <div className="font-semibold text-red-200">The film is not in</div>
                <p className="mt-0.5 text-white/80">
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
              <h2 className="mb-2 text-xs font-medium tracking-widest text-white/40 uppercase">
                Next at this machine
              </h2>
              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                {board.waiting.slice(0, 4).map((next) => (
                  <li
                    key={next.stageId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-white">#{next.orderNumber}</span>{' '}
                      <span className="text-white/60">{next.jobName}</span>
                    </span>
                    <span className="shrink-0 text-sm text-white/40">
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
        <div className="bg-ink-950/80 fixed inset-0 z-50 flex items-end justify-center p-4 backdrop-blur sm:items-center">
          <div className="bg-ink-900 w-full max-w-lg rounded-3xl p-6 ring-1 ring-white/10">
            <h2 className="text-2xl font-bold text-white">
              {stopping === 'ISSUE' ? 'What is wrong?' : 'Why are you pausing?'}
            </h2>
            <p className="mt-1 text-white/50">
              The job stops either way. This is what the office will see.
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
              className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-lg text-white ring-1 ring-white/15 placeholder:text-white/30 focus:ring-4 focus:ring-white/40 focus:outline-none"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <FloorButton
                tone="pause"
                onClick={() => {
                  setStopping(null);
                  setReason('');
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
    <div className="bg-ink-950 min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
