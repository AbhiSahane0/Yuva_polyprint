import { round } from './quotation-math.js';

/**
 * **The machines, and why one is standing.**
 *
 * Almost everything on a machine card is worked out rather than stored. What
 * is running on it is the stage that is running on it; who is on it is that
 * stage's operator; today's output and waste are the stages that finished
 * today. None of it is a figure anybody maintains, and none of it can go
 * stale.
 *
 * The one stored fact is **maintenance** — and even that has no status field.
 * A record with no end **is** the machine being down; a status somebody has to
 * remember to clear is a status that is wrong, and the press would read "under
 * maintenance" for a fortnight after it came back.
 */

export const MAINTENANCE_KINDS = ['SERVICE', 'BREAKDOWN'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  SERVICE: 'Service',
  BREAKDOWN: 'Breakdown',
};

/** Where a machine is, right now. Derived from three facts, never stored. */
export const MACHINE_STATES = ['DOWN', 'RUNNING', 'IDLE'] as const;
export type MachineState = (typeof MACHINE_STATES)[number];

export const MACHINE_STATE_LABELS: Record<MachineState, string> = {
  DOWN: 'Down',
  RUNNING: 'Running',
  IDLE: 'Idle',
};

/**
 * **Down beats running.**
 *
 * A machine with its rollers off can still have a job sitting on it in the
 * system — the operator stopped, the fitter arrived, and nobody finished the
 * stage. Reading that as "running" is how a screen tells the office a press is
 * working while it is in pieces.
 */
export function machineState(input: { isDown: boolean; hasRunningJob: boolean }): MachineState {
  if (input.isDown) return 'DOWN';
  return input.hasRunningJob ? 'RUNNING' : 'IDLE';
}

/** A moment a machine stopped or started, for working out how long it stood. */
export interface StandEvent {
  at: string;
  kind: 'STOP' | 'START';
}

/**
 * **How long a machine has stood, in minutes.**
 *
 * Pairs each stop with the next start. Deliberately tolerant, because the
 * events come from a tablet on a factory floor and will not always be tidy:
 *
 * - A stop with **no start after it** is still standing, and is counted up to
 *   `now`. That is the case that matters most — a machine down since eleven is
 *   the one somebody needs to see at two.
 * - A **second stop** while already stopped changes nothing. The machine was
 *   already standing; it cannot stand twice.
 * - A **start with nothing stopped** is ignored rather than counted as
 *   negative time.
 *
 * A pause and a problem both count. The machine does not care which button was
 * pressed — it is standing either way, and a downtime figure that left out
 * every defect would flatter the works exactly where it should not.
 */
export function standingMinutes(events: StandEvent[], now: string): number {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let total = 0;
  let stoppedAt: string | null = null;

  for (const event of sorted) {
    if (event.kind === 'STOP') {
      stoppedAt ??= event.at;
      continue;
    }
    if (!stoppedAt) continue;
    total += Date.parse(event.at) - Date.parse(stoppedAt);
    stoppedAt = null;
  }

  /* Still standing. Counted to now, which is the figure anybody is looking
     for when they open this screen. */
  if (stoppedAt) total += Date.parse(now) - Date.parse(stoppedAt);

  return Math.max(0, Math.round(total / 60_000));
}

/** "4h 10m", the way the works says it. */
export function formatStanding(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  return `${hours}h ${String(safe % 60).padStart(2, '0')}m`;
}

/**
 * How long a machine has been down for this spell, in minutes.
 *
 * Open records are counted to now; closed ones to when they ended.
 */
export function downFor(
  record: { startedAt: string; endedAt: string | null },
  now: string,
): number {
  const end = Date.parse(record.endedAt ?? now);
  return Math.max(0, Math.round((end - Date.parse(record.startedAt)) / 60_000));
}

export interface DayTotals {
  outputKg: number;
  inputKg: number;
  wasteKg: number;
  wastePercent: number;
  runs: number;
}

/**
 * What a machine got through today.
 *
 * Only finished stages, for the same reason waste is only read off finished
 * ones: a stage still on the machine has an output of nought, and counting it
 * reads as having lost the whole reel.
 */
export function dayTotals(stages: { inputKg: number; outputKg: number }[]): DayTotals {
  let inputKg = 0;
  let outputKg = 0;
  for (const stage of stages) {
    if (!stage.outputKg) continue;
    inputKg += stage.inputKg;
    outputKg += stage.outputKg;
  }
  const wasteKg = inputKg - outputKg;
  return {
    outputKg: round(outputKg, 3),
    inputKg: round(inputKg, 3),
    wasteKg: round(wasteKg, 3),
    wastePercent: inputKg > 0 ? round((wasteKg / inputKg) * 100, 2) : 0,
    runs: stages.filter((stage) => stage.outputKg > 0).length,
  };
}

/**
 * The order the machine cards read in.
 *
 * What is down first — it is the only card that is asking for something. Then
 * what is running, then what is idle, and within each the works' own order of
 * the floor, which the caller supplies.
 */
export function machineOrder(
  a: { state: MachineState; position: number },
  b: { state: MachineState; position: number },
): number {
  const rank = (state: MachineState) => MACHINE_STATES.indexOf(state);
  if (rank(a.state) !== rank(b.state)) return rank(a.state) - rank(b.state);
  return a.position - b.position;
}
