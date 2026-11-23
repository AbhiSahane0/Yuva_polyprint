/**
 * **Did the reopening bug overwrite this line's colours?**
 *
 * Opening a saved quotation to edit did not copy the stored colours into the
 * form, so the line opened with none chosen. The one effect that still ran
 * then added a white base coat, because the structure asks for one. Saving
 * anything at all — a date, a note, a quantity — wrote that single white
 * colour back over the inks the document was sold with.
 *
 * The rule lives here rather than in the script that prints it for one
 * reason: a script that reports "nothing found" is worth nothing unless the
 * finding can be tested, and it cannot be tested against the works' live
 * database without putting damage there to find. So the judgement is a pure
 * function over one line, and the script does the reading and the printing.
 *
 * **What is deliberately not evidence: colours and cylinders disagreeing.**
 * The first version of this check flagged that, and it was wrong on every
 * line in the database — five out of five. A line may carry four process
 * colours against six cylinders perfectly legitimately, because the office
 * types a cylinder count for stations it has not named an ink for yet, and
 * the form allows that on purpose. A check that cries wolf on healthy data is
 * worse than no check: the one real hit is then read past.
 */

/** The day the colour strip shipped. Nothing before it ever stored a colour. */
export const COLOURS_SHIPPED = new Date('2026-09-15T00:00:00.000Z');

/** A save is a reopening if it landed more than a minute after the create. */
export const EDITED_AFTER_MS = 60_000;

const WHITE = 'white';

export type ColourVerdict =
  /** The bug's exact fingerprint: one White special where more was priced. */
  | 'CERTAIN'
  /** Its other shape: the colours cleared outright, nothing added back. */
  | 'CLEARED'
  /** One of those shapes on a document never edited. Keyed, not corrupted. */
  | 'NOT_THE_BUG'
  /** Written before colours existed. Carries none, and never did. */
  | 'PRE_COLOURS'
  /** Carrying the inks it was sold on. */
  | 'HEALTHY';

export interface LineUnderTest {
  colours: { name: string; kind: string }[];
  cylinderCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function wasEdited(line: Pick<LineUnderTest, 'createdAt' | 'updatedAt'>): boolean {
  return line.updatedAt.getTime() - line.createdAt.getTime() > EDITED_AFTER_MS;
}

export function classifyColourDamage(line: LineUnderTest): ColourVerdict {
  const edited = wasEdited(line);

  if (line.colours.length === 0) {
    /* No colours and no colour strip when it was written. Not damage. */
    if (line.createdAt < COLOURS_SHIPPED) return 'PRE_COLOURS';
    return edited ? 'CLEARED' : 'NOT_THE_BUG';
  }

  const only = line.colours[0];
  const lonelyWhite =
    line.colours.length === 1 &&
    only !== undefined &&
    only.kind === 'SPECIAL' &&
    only.name.trim().toLowerCase() === WHITE;

  /*
   * The cylinder count is the witness. It is a plain number on the item and
   * the form copied it faithfully throughout, so it still says how many
   * stations the job was priced for while the colours no longer do.
   */
  if (lonelyWhite && line.cylinderCount > 1) {
    return edited ? 'CERTAIN' : 'NOT_THE_BUG';
  }

  return 'HEALTHY';
}
