import type { MachineKind } from './rate-costing.js';

/**
 * **Who to offer for a stage, and in what order.**
 *
 * The works has one press, two laminators, a slitter and about forty people,
 * and the person filling in a job card is stood at a machine. A flat list of
 * forty names sorted alphabetically makes them hunt; a list of only the
 * printing operators makes them unable to record the truth on the day the
 * slitting man covers the press, which is exactly the day worth recording.
 *
 * So: the people whose role belongs to this process first, everybody else
 * after, and nobody hidden.
 */
export interface OperatorChoice {
  id: string;
  name: string;
  roleName: string;
  process: MachineKind | null;
  isActive: boolean;
}

export interface OperatorChoices<T extends OperatorChoice> {
  /** Roles that belong to this process. The ordinary answer. */
  suggested: T[];
  /** Everyone else who is still here. Covering happens. */
  others: T[];
}

const byName = <T extends OperatorChoice>(a: T, b: T): number =>
  a.name.localeCompare(b.name, 'en-IN');

/**
 * Splits the works into the people this stage expects and the rest.
 *
 * `keepId` is the person already named on the stage. They stay in the list even
 * once they have left the works, because **a record of who ran a job in March
 * must not quietly empty itself when they leave in June** — and a dropdown that
 * cannot show its own value shows a blank instead, which reads as nobody.
 */
export function operatorChoices<T extends OperatorChoice>(
  people: T[],
  stage: MachineKind | null,
  keepId?: string | null,
): OperatorChoices<T> {
  const available = people.filter((person) => person.isActive || person.id === keepId);

  /* A stage with no kind — nothing should have one, but a card put together by
     hand might — offers everybody rather than nobody. */
  if (!stage) return { suggested: [], others: available.sort(byName) };

  return {
    suggested: available.filter((person) => person.process === stage).sort(byName),
    others: available.filter((person) => person.process !== stage).sort(byName),
  };
}
