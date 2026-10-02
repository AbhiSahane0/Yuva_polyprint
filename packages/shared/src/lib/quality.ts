import type { MachineKind } from './rate-costing.js';
import { wasteKg } from './floor.js';
import { round } from './quotation-math.js';

/**
 * **Quality & waste — what went wrong, and where material is being lost.**
 *
 * Two halves that are deliberately not the same number.
 *
 * **Waste** is material lost *at the machine*: what went on less what came
 * off, which every stage already records. Nothing new is captured for it —
 * this only reads and groups what the floor has been entering all along.
 *
 * **A rejection** is finished film that was made, weighed, and then failed.
 * It is not waste and must never be added to it: the material left the shelf
 * once and was lost once, and counting it in both places would make a works
 * that scrapped 40 kg look as though it had lost 80. A rejection's one
 * consequence is that the godown cannot send it, which is Dispatch's business
 * and is where the figure is used.
 */

export const ISSUE_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const ISSUE_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Being looked at',
  RESOLVED: 'Resolved',
};

/**
 * Still somebody's problem.
 *
 * "Being looked at" is open. It is a different thing from nobody having
 * picked it up, which is why it is its own status — but an issues list that
 * counted it as closed would be a list the works stops believing.
 */
export function isOpenIssue(status: IssueStatus): boolean {
  return status !== 'RESOLVED';
}

/**
 * Where an issue may go from where it is.
 *
 * A resolved issue can be reopened, and that is deliberate: the works finds
 * out a fortnight later that the fix did not hold, and a system that makes
 * them raise a second issue about the same defect loses the history of the
 * first.
 */
export const ISSUE_STATUS_FLOW: Record<IssueStatus, readonly IssueStatus[]> = {
  OPEN: ['INVESTIGATING', 'RESOLVED'],
  INVESTIGATING: ['OPEN', 'RESOLVED'],
  RESOLVED: ['OPEN', 'INVESTIGATING'],
};

export function canMoveIssueTo(from: IssueStatus, to: IssueStatus): boolean {
  return from === to || ISSUE_STATUS_FLOW[from].includes(to);
}

/**
 * The order an issues list reads in.
 *
 * Worst first, then oldest — an issue that has been open a week outranks one
 * raised this morning at the same severity, because it is the one that has
 * been ignored. Resolved issues sink regardless.
 */
export function issueOrder(
  a: { severity: IssueSeverity; status: IssueStatus; createdAt: string },
  b: { severity: IssueSeverity; status: IssueStatus; createdAt: string },
): number {
  const openFirst = Number(!isOpenIssue(a.status)) - Number(!isOpenIssue(b.status));
  if (openFirst !== 0) return openFirst;
  const rank = (s: IssueSeverity) => ISSUE_SEVERITIES.indexOf(s);
  if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export interface StageWaste {
  stage: MachineKind;
  inputKg: number;
  outputKg: number;
  finishedAt: string | null;
}

export interface WasteByStage {
  stage: MachineKind;
  wasteKg: number;
  inputKg: number;
  /** Of what went on at that stage. The figure worth comparing between them. */
  percent: number;
  runs: number;
}

/**
 * Where the material is going, by process.
 *
 * Grouped by stage rather than by job, because that is the question this
 * answers: a works losing 6% at lamination and 1% everywhere else has a
 * laminator problem, and no amount of looking at individual jobs says so.
 *
 * Only finished stages count. One still running has an output of nought, and
 * counting it would read as having lost the entire reel.
 */
export function wasteByStage(stages: StageWaste[]): WasteByStage[] {
  const totals = new Map<MachineKind, { waste: number; input: number; runs: number }>();

  for (const stage of stages) {
    if (!stage.finishedAt || !stage.outputKg) continue;
    const at = totals.get(stage.stage) ?? { waste: 0, input: 0, runs: 0 };
    at.waste += wasteKg(stage);
    at.input += stage.inputKg;
    at.runs += 1;
    totals.set(stage.stage, at);
  }

  return [...totals.entries()]
    .map(([stage, total]) => ({
      stage,
      wasteKg: round(total.waste, 3),
      inputKg: round(total.input, 3),
      percent: total.input > 0 ? round((total.waste / total.input) * 100, 2) : 0,
      runs: total.runs,
    }))
    .sort((a, b) => b.wasteKg - a.wasteKg);
}

export interface WasteDay {
  date: string;
  wasteKg: number;
  inputKg: number;
  percent: number;
  /** Stages finished that day. Zero is what makes a quiet day read as quiet. */
  runs: number;
}

/**
 * The last `days` days, oldest first, **including the days nothing ran**.
 *
 * A trend with the quiet days left out is not a trend — it is a list of busy
 * days drawn as though they were consecutive, and it makes a fortnight of
 * decline look like a straight line.
 */
export function wasteTrend(stages: StageWaste[], days: number, endingOn: string): WasteDay[] {
  const totals = new Map<string, { waste: number; input: number; runs: number }>();

  for (const stage of stages) {
    if (!stage.finishedAt || !stage.outputKg) continue;
    const date = stage.finishedAt.slice(0, 10);
    const at = totals.get(date) ?? { waste: 0, input: 0, runs: 0 };
    at.waste += wasteKg(stage);
    at.input += stage.inputKg;
    at.runs += 1;
    totals.set(date, at);
  }

  const out: WasteDay[] = [];
  const end = new Date(`${endingOn}T00:00:00.000Z`);
  for (let back = days - 1; back >= 0; back -= 1) {
    const at = new Date(end);
    at.setUTCDate(at.getUTCDate() - back);
    const date = at.toISOString().slice(0, 10);
    const total = totals.get(date) ?? { waste: 0, input: 0, runs: 0 };
    out.push({
      date,
      wasteKg: round(total.waste, 3),
      inputKg: round(total.input, 3),
      percent: total.input > 0 ? round((total.waste / total.input) * 100, 2) : 0,
      runs: total.runs,
    });
  }
  return out;
}

/**
 * What a card cannot send, because it failed after it was made.
 *
 * Every issue's rejection counts, open or resolved. A rejection is a fact
 * about the film, not about the paperwork chasing it — and an issue closed as
 * "checked again, it is fine" is closed by putting its rejected weight back to
 * nought, which is the honest way to say so.
 */
export function rejectedKgOf(issues: { rejectedKg: number }[]): number {
  return round(
    issues.reduce(
      (sum, issue) => sum + (Number.isFinite(issue.rejectedKg) ? issue.rejectedKg : 0),
      0,
    ),
    3,
  );
}
