import type { InkKind } from '../constants/job.js';

/**
 * Which inks a job prints, and what they cost.
 *
 * A line starts with the four process colours because most printed work is
 * CMYK, and the office takes away what the job does not use — plenty of packs
 * are one or two colours, and paying for four cylinders and four stations on a
 * single-colour job is money and press time that were never spent.
 *
 * **A special colour is deliberately anonymous.** The brand's own red, a
 * metallic, a white base coat: which one it is gets decided at artwork, weeks
 * after the price was given. So the office adds one row per special station
 * rather than naming anything, and every special is priced the same way.
 */
export interface JobColour {
  /** 'Cyan', or 'Special colour'. */
  name: string;
  kind: InkKind;
  /** The ink it was priced from, where one was named. Null on a special. */
  materialId: string | null;
  laydownGsm: number;
  solidsPercent: number;
  ratePerKg: number;
}

/** An ink on the rates list, as much of it as pricing a colour needs. */
export interface InkOption {
  id: string;
  name: string;
  inkKind: InkKind | null;
  laydownGsm: number | null;
  solidsPercent: number | null;
  currentRate: number | null;
}

/** What a special colour is called on screen and on the quotation. */
export const SPECIAL_COLOUR_NAME = 'Special colour';

/**
 * The four every press carries, in the order the trade names them.
 *
 * Matched by name against the rates list rather than held as figures here: the
 * laydown and solids are the works' own measurements and belong on the material,
 * where they can be corrected without a release.
 */
export const PROCESS_COLOUR_NAMES = ['Cyan', 'Magenta', 'Yellow', 'Black'] as const;

/** The inks that can be priced — a rate and a laydown, or it prices nothing. */
export function costableInks(inks: InkOption[]): InkOption[] {
  return inks.filter(
    (ink) =>
      (ink.laydownGsm ?? 0) > 0 && (ink.currentRate ?? 0) > 0 && (ink.solidsPercent ?? 0) > 0,
  );
}

/**
 * What a special colour costs, given what the works stocks.
 *
 * **The dearest ink on the rates list, of any kind**, which is the only honest
 * assumption available while the colour is unknown: quote the cheapest and the
 * works loses the difference on every job where it guessed low, and a quotation
 * that has already gone out cannot be revised for it.
 *
 * Every costable ink is in the running — the process four and any spot colour
 * the works has priced alike. Preferring the spot colours would have been the
 * more sophisticated rule and the wrong one: if Cyan is the dearest thing the
 * works buys, then an unknown colour costing "at worst what we pay" costs what
 * Cyan costs, whatever kind it turns out to be.
 *
 * The laydown and solids come from that same ink, so the assumption is one whole
 * ink rather than the worst figure from each.
 *
 * Null when nothing on the list can be priced, which is a line the office must
 * be told about rather than one quietly costed at zero.
 */
export function specialColourFrom(inks: InkOption[]): JobColour | null {
  const costable = costableInks(inks);
  if (costable.length === 0) return null;

  const dearest = costable.reduce((worst, ink) =>
    (ink.currentRate ?? 0) > (worst.currentRate ?? 0) ? ink : worst,
  );

  return {
    name: SPECIAL_COLOUR_NAME,
    kind: 'SPECIAL',
    /* No material: the quotation is not claiming to print THIS ink, only to
       have priced an unknown one at what this one costs. */
    materialId: null,
    laydownGsm: dearest.laydownGsm ?? 0,
    solidsPercent: dearest.solidsPercent ?? 0,
    ratePerKg: dearest.currentRate ?? 0,
  };
}

/** One process colour from the rates list, by name. */
export function processColourFrom(inks: InkOption[], name: string): JobColour | null {
  const match = costableInks(inks).find((ink) =>
    ink.name.toLowerCase().includes(name.toLowerCase()),
  );
  if (!match) return null;

  return {
    name,
    kind: 'PROCESS',
    materialId: match.id,
    laydownGsm: match.laydownGsm ?? 0,
    solidsPercent: match.solidsPercent ?? 0,
    ratePerKg: match.currentRate ?? 0,
  };
}

/**
 * What a new line starts with: the four process colours the works can price.
 *
 * Any it cannot price is left out rather than added at zero — a colour costing
 * nothing is worse than a colour missing, because the rate still looks
 * plausible. The office sees four chips or it sees three and asks why.
 */
export function defaultJobColours(inks: InkOption[]): JobColour[] {
  return PROCESS_COLOUR_NAMES.map((name) => processColourFrom(inks, name)).filter(
    (colour): colour is JobColour => colour !== null,
  );
}

/**
 * The colour list resized to a station count the office typed.
 *
 * The Cylinders box and the colour strip are the same fact told twice, so they
 * move together in both directions. Typing 7 against a CMYK job means three
 * more stations carrying something — which is three specials, because an
 * unnamed colour is exactly what a station with no ink chosen yet is.
 *
 * Coming down, the last thing added is the first thing removed: specials before
 * process colours, and process colours from the end of the palette. Anything
 * else would make the office hunt for which chip vanished.
 *
 * Never below one. A job printing nothing is not a job, and a count of zero
 * would take the line off per-colour pricing altogether — a large, silent move
 * to make out of a typo.
 */
export function resizeColours(
  colours: JobColour[],
  count: number,
  special: JobColour | null,
  processPalette: JobColour[] = [],
): JobColour[] {
  const wanted = Math.max(1, Math.floor(count));
  if (!Number.isFinite(wanted) || wanted === colours.length) return colours;

  if (wanted > colours.length) {
    /*
     * **Process colours first, then specials.**
     *
     * Typing 7 means seven stations, and the works fills a press in one order:
     * the four it always carries, then whatever the artwork turns out to need.
     * So 7 is CMYK and three specials.
     *
     * It used to append specials to whatever was already there, which is right
     * from a CMYK line and wrong from any other. On a line with no process
     * colours — one where the office had taken them off, or one where the
     * count was typed before the rates list had arrived to price them from —
     * typing 7 gave SEVEN specials, every one of them charged at the dearest
     * ink on the list. A seven-colour job priced as seven unknowns.
     *
     * The cost of doing it this way: a deliberately deleted process colour
     * comes back if the count is then raised. That is the right trade — typing
     * a number is a coarse instruction about stations, and removing one colour
     * is a precise one about ink, so the precise action stays available on the
     * chip while the coarse one restores the works' normal order.
     */
    const named = new Set(
      colours.filter((colour) => colour.kind === 'PROCESS').map((colour) => colour.name),
    );
    const missing = processPalette.filter(
      (colour) => colour.kind === 'PROCESS' && !named.has(colour.name),
    );

    const process = [
      ...colours.filter((colour) => colour.kind === 'PROCESS'),
      ...missing.map((colour) => ({ ...colour })),
    ].slice(0, wanted);

    const specials = colours.filter((colour) => colour.kind === 'SPECIAL');
    const next = [...process, ...specials].slice(0, wanted);

    if (!special) return next.length > colours.length ? next : colours;
    while (next.length < wanted) next.push({ ...special });
    return next;
  }

  /* Specials go first, newest first, then process colours off the end. */
  const specials = colours.filter((colour) => colour.kind === 'SPECIAL');
  const process = colours.filter((colour) => colour.kind === 'PROCESS');
  const keepSpecials = Math.max(0, wanted - process.length);
  const keepProcess = Math.min(process.length, wanted);

  return [...process.slice(0, keepProcess), ...specials.slice(0, keepSpecials)];
}
