/**
 * **Which reels a job takes, not just how many kilograms.**
 *
 * A claim on "781 kg of LDPE" is a claim on nothing in particular. It cannot
 * tell the floor which rolls to fetch, it cannot stop two cards being promised
 * the same roll, and it forced a guess — that claims came off the widest reels
 * first — because nothing recorded which reel any claim was against.
 *
 * Naming the reels removes the guess. What is free on a roll is what is on it
 * less what other cards have claimed OF THAT ROLL, and that is a fact rather
 * than an apportionment.
 */

/** One roll on the shelf, and what is left of it after everyone else's claims. */
export interface Reel {
  batchId: string;
  batchCode: string;
  /** Null where nobody recorded it. */
  widthMm: number | null;
  /** ISO date, for rotating stock within a width. */
  receivedOn: string;
  /** What is physically on the roll. */
  onHand: number;
  /** On the roll, less what other job cards hold OF THIS ROLL. */
  free: number;
}

/** A roll earmarked for a job, and how much of it. */
export interface ReelAllocation {
  batchId: string;
  batchCode: string;
  widthMm: number | null;
  quantity: number;
}

const round3 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;

/**
 * **Narrowest suitable roll first, then oldest.**
 *
 * Two rules, in that order, and the order is the argument.
 *
 * Narrowest first because a 1040 mm roll spent on a 360 mm job is a wide roll
 * the works no longer has for a wide job, and wide rolls are the scarce ones —
 * film is slit down and never widened, so every job can eat the big rolls and
 * only the big jobs are stuck without them.
 *
 * Oldest first within a width because film ages, and a roll nobody ever reaches
 * for is a roll that goes off on the shelf.
 *
 * A roll whose width nobody recorded sorts last: it may or may not fit, and
 * something that might fit should be reached for after everything that is known
 * to.
 */
function pickingOrder(a: Reel, b: Reel): number {
  const aw = a.widthMm ?? Number.POSITIVE_INFINITY;
  const bw = b.widthMm ?? Number.POSITIVE_INFINITY;
  if (aw !== bw) return aw - bw;
  if (a.receivedOn !== b.receivedOn) return a.receivedOn < b.receivedOn ? -1 : 1;
  /* Same width, same day: a stable tie-break so two runs of this agree. */
  return a.batchId < b.batchId ? -1 : 1;
}

export interface ReelPick {
  /** The rolls this job takes, in the order it should take them. */
  taken: ReelAllocation[];
  /** What could be found on rolls wide enough. */
  usable: number;
  /** Free film of the right sort on rolls too narrow to run this job. */
  tooNarrowKg: number;
  /** What is missing once every suitable roll has been counted. */
  shortBy: number;
}

export function allocateReels(input: {
  needKg: number;
  /** Zero turns the width test off — see `material-availability.ts`. */
  needsWidthMm: number;
  reels: Reel[];
}): ReelPick {
  const wideEnough: Reel[] = [];
  let tooNarrowKg = 0;

  for (const reel of input.reels) {
    if (reel.free <= 0) continue;
    /* Unknown width counts as suitable: nothing here can say it is not. */
    const fits = reel.widthMm === null || reel.widthMm >= input.needsWidthMm;
    if (fits) wideEnough.push(reel);
    else tooNarrowKg += reel.free;
  }

  const usable = round3(wideEnough.reduce((sum, reel) => sum + reel.free, 0));

  const taken: ReelAllocation[] = [];
  let left = round3(Math.max(0, input.needKg));

  for (const reel of [...wideEnough].sort(pickingOrder)) {
    if (left <= 0) break;
    const take = round3(Math.min(reel.free, left));
    if (take <= 0) continue;
    taken.push({
      batchId: reel.batchId,
      batchCode: reel.batchCode,
      widthMm: reel.widthMm,
      quantity: take,
    });
    left = round3(left - take);
  }

  return { taken, usable, tooNarrowKg: round3(tooNarrowKg), shortBy: round3(Math.max(0, left)) };
}
