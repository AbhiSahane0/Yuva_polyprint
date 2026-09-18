import { describe, expect, it } from 'vitest';
import {
  costableInks,
  defaultJobColours,
  processColourFrom,
  resizeColours,
  specialColourFrom,
  SPECIAL_COLOUR_NAME,
  type InkOption,
  type JobColour,
} from './job-colours.js';

/**
 * **Which inks a job prints, and what an unknown one costs.**
 *
 * A line starts with the four process colours and the office takes away what
 * the job does not print. That is not cosmetic: the count is the cylinder count
 * and the station count, so a single-colour job quoted as four pays for three
 * cylinders at around Rs 9,000 each and three stations it never occupied.
 *
 * The interesting half is the special. Which colour it actually is — the
 * brand's red, a metallic, a white base coat — is settled at artwork, weeks
 * after the price is given, so it is priced at the **dearest ink on the rates
 * list**. Quote the cheapest and the works loses the difference on every job
 * where it guessed low, on a document that has already gone out.
 *
 * The works' catalogue on 2026-09-15: Cyan 217, Magenta 235, Yellow 202,
 * Black 202, all PROCESS, and no specials at all.
 */
const CATALOGUE: InkOption[] = [
  {
    id: 'c',
    name: 'Ink — Cyan',
    inkKind: 'PROCESS',
    laydownGsm: 0.14,
    solidsPercent: 19.5,
    currentRate: 217,
  },
  {
    id: 'm',
    name: 'Ink — Magenta',
    inkKind: 'PROCESS',
    laydownGsm: 0.13,
    solidsPercent: 19.5,
    currentRate: 235,
  },
  {
    id: 'y',
    name: 'Ink — Yellow',
    inkKind: 'PROCESS',
    laydownGsm: 0.13,
    solidsPercent: 19.5,
    currentRate: 202,
  },
  {
    id: 'k',
    name: 'Ink — Black',
    inkKind: 'PROCESS',
    laydownGsm: 0.15,
    solidsPercent: 23,
    currentRate: 202,
  },
  /* The blends are a rate, not a colour: no laydown, so nothing to lay down. */
  {
    id: 'b',
    name: 'Ink — Blended (Estimation)',
    inkKind: null,
    laydownGsm: null,
    solidsPercent: null,
    currentRate: 800,
  },
];

describe('the inks a colour can be priced from', () => {
  /*
   * The blend is the case that matters. It is the dearest thing on the list at
   * Rs 800 and it would win every "dearest ink" contest — but it is a rate for
   * a whole laydown, not a colour with one, so pricing a station at it would
   * overstate the ink several times over.
   */
  it('leaves out an ink with no laydown, however dear', () => {
    const costable = costableInks(CATALOGUE);
    expect(costable.map((ink) => ink.id)).toEqual(['c', 'm', 'y', 'k']);
    expect(costable.some((ink) => ink.name.includes('Blended'))).toBe(false);
  });

  it('leaves out an ink nobody has priced', () => {
    const unpriced = [{ ...CATALOGUE[0]!, id: 'x', currentRate: null }];
    expect(costableInks(unpriced)).toEqual([]);
  });
});

describe('a new line', () => {
  it('starts with the four process colours, in trade order', () => {
    expect(defaultJobColours(CATALOGUE).map((c) => c.name)).toEqual([
      'Cyan',
      'Magenta',
      'Yellow',
      'Black',
    ]);
  });

  it('takes each one’s own laydown, solids and rate', () => {
    const [cyan] = defaultJobColours(CATALOGUE);
    expect(cyan).toMatchObject({
      kind: 'PROCESS',
      materialId: 'c',
      laydownGsm: 0.14,
      ratePerKg: 217,
    });
  });

  /*
   * A colour costing nothing is worse than a colour missing: the rate still
   * looks plausible. Four chips or three and a question — not four chips, one
   * of which prices at zero.
   */
  it('leaves out a process colour the works cannot price', () => {
    const noYellow = CATALOGUE.filter((ink) => ink.id !== 'y');
    expect(defaultJobColours(noYellow).map((c) => c.name)).toEqual(['Cyan', 'Magenta', 'Black']);
  });

  it('matches on the name the works uses, not an exact one', () => {
    // The catalogue calls it "Ink — Cyan"; the trade calls it Cyan.
    expect(processColourFrom(CATALOGUE, 'Cyan')?.materialId).toBe('c');
    expect(processColourFrom(CATALOGUE, 'Silver')).toBeNull();
  });
});

describe('a special colour', () => {
  it('is priced at the dearest costable ink', () => {
    const special = specialColourFrom(CATALOGUE)!;
    expect(special.ratePerKg).toBe(235);
    expect(special.name).toBe(SPECIAL_COLOUR_NAME);
    expect(special.kind).toBe('SPECIAL');
  });

  /*
   * One whole ink, not the worst figure from each. Taking Magenta's rate with
   * Black's heavier laydown would price a colour the works does not stock.
   */
  it('takes the laydown and solids of the same ink it takes the rate from', () => {
    const special = specialColourFrom(CATALOGUE)!;
    expect(special.laydownGsm).toBe(0.13);
    expect(special.solidsPercent).toBe(19.5);
  });

  /*
   * It names no material on purpose. The quotation is not claiming to print
   * magenta — only to have priced an unknown colour at what magenta costs.
   */
  it('names no ink', () => {
    expect(specialColourFrom(CATALOGUE)!.materialId).toBeNull();
  });

  /**
   * **Every ink is in the running, of either kind.**
   *
   * Preferring the spot colours would be the more sophisticated rule and the
   * wrong one: if Cyan is the dearest thing the works buys, then an unknown
   * colour costing "at worst what we pay" costs what Cyan costs, whatever kind
   * it turns out to be.
   */
  it('takes a process ink when it is dearer than every spot colour', () => {
    const withCheapSpecial: InkOption[] = [
      ...CATALOGUE,
      {
        id: 'w',
        name: 'Ink — White',
        inkKind: 'SPECIAL',
        laydownGsm: 1.8,
        solidsPercent: 40,
        currentRate: 190,
      },
    ];
    // White at 190 is a special; Magenta at 235 still costs more.
    expect(specialColourFrom(withCheapSpecial)!.ratePerKg).toBe(235);
  });

  it('takes the spot colour once it is the dearest thing on the list', () => {
    const withGold: InkOption[] = [
      ...CATALOGUE,
      {
        id: 'g',
        name: 'Gold',
        inkKind: 'SPECIAL',
        laydownGsm: 0.9,
        solidsPercent: 35,
        currentRate: 640,
      },
    ];
    const special = specialColourFrom(withGold)!;
    expect(special.ratePerKg).toBe(640);
    expect(special.laydownGsm).toBe(0.9);
  });

  /*
   * Null, not a zero-rate colour. A line the office must be told about rather
   * than one quietly costed at nothing.
   */
  it('is null when nothing on the list can be priced', () => {
    expect(specialColourFrom([])).toBeNull();
    expect(specialColourFrom([CATALOGUE[4]!])).toBeNull();
  });
});

/**
 * **The Cylinders box and the colour strip are one fact told twice.**
 *
 * Which is why they move together in both directions. Typing 7 against a CMYK
 * job means three more stations carrying something, and a station with no ink
 * chosen yet is exactly what a special is — so it becomes CMYK + three
 * specials, and the office can name them later or leave them.
 */
describe('resizing the colours to a typed cylinder count', () => {
  const CMYK = defaultJobColours(CATALOGUE);
  const SPECIAL = specialColourFrom(CATALOGUE)!;

  it('turns 7 on a CMYK job into CMYK and three specials', () => {
    const next = resizeColours(CMYK, 7, SPECIAL);
    expect(next).toHaveLength(7);
    expect(next.slice(0, 4).map((c) => c.name)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Black']);
    expect(next.slice(4).every((c) => c.kind === 'SPECIAL')).toBe(true);
    expect(next[4]!.ratePerKg).toBe(235);
  });

  /* Newest first: the specials were added last, so they go first. */
  it('takes the specials off before touching a process colour', () => {
    const six = resizeColours(CMYK, 6, SPECIAL);
    const back = resizeColours(six, 4, SPECIAL);
    expect(back.map((c) => c.name)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Black']);
  });

  it('takes process colours off the end once the specials are gone', () => {
    expect(resizeColours(CMYK, 2, SPECIAL).map((c) => c.name)).toEqual(['Cyan', 'Magenta']);
  });

  /*
   * A job printing nothing is not a job — and a count of zero would take the
   * line off per-colour pricing altogether, which is a large silent move to
   * make out of a typo.
   */
  it('never empties the list', () => {
    expect(resizeColours(CMYK, 0, SPECIAL)).toHaveLength(1);
    expect(resizeColours(CMYK, -3, SPECIAL)).toHaveLength(1);
  });

  it('leaves the list alone when the count already matches', () => {
    expect(resizeColours(CMYK, 4, SPECIAL)).toBe(CMYK);
  });

  /* Nothing to add with, so nothing is added — rather than padding with a
     colour that costs zero and quietly understates the job. */
  it('cannot grow when no ink can be priced', () => {
    const only: JobColour[] = [CMYK[0]!];
    expect(resizeColours(only, 5, null)).toHaveLength(1);
  });
});

/**
 * **Typing 7 means CMYK and three specials — never seven specials.**
 *
 * The works fills a press in one order: the four colours it always carries,
 * then whatever the artwork turns out to need. So a count typed into the
 * Cylinders box fills the process colours first.
 *
 * It used to append specials to whatever was already on the line, which is
 * right from a CMYK job and wrong from every other. On a line with no process
 * colours — one where the office had taken them off, or one where the count was
 * typed before the rates list arrived to price them from — typing 7 produced
 * SEVEN specials, every one charged at the dearest ink on the list. The strip
 * read "7 colours, so 7 cylinders and 7 stations" and the price was a
 * seven-colour job costed as seven unknowns.
 */
describe('typing a cylinder count', () => {
  const CMYK = defaultJobColours(CATALOGUE);
  const SPECIAL = specialColourFrom(CATALOGUE)!;
  const names = (cs: JobColour[]) => cs.map((c) => c.name);

  it('fills the process colours first from an empty line', () => {
    const next = resizeColours([], 7, SPECIAL, CMYK);
    expect(next).toHaveLength(7);
    expect(names(next).slice(0, 4)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Black']);
    expect(next.slice(4).every((c) => c.kind === 'SPECIAL')).toBe(true);
  });

  /* The bug, stated as the thing it must never do again. */
  it('never makes every station a special when process colours exist to use', () => {
    const next = resizeColours([], 7, SPECIAL, CMYK);
    expect(next.filter((c) => c.kind === 'SPECIAL')).toHaveLength(3);
  });

  it('still adds only specials once the four are already there', () => {
    const next = resizeColours(CMYK, 7, SPECIAL, CMYK);
    expect(names(next).slice(0, 4)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Black']);
    expect(next.filter((c) => c.kind === 'SPECIAL')).toHaveLength(3);
  });

  it('tops up a part-filled line before reaching for a special', () => {
    const cyanOnly = [CMYK[0]!];
    expect(names(resizeColours(cyanOnly, 4, SPECIAL, CMYK))).toEqual([
      'Cyan',
      'Magenta',
      'Yellow',
      'Black',
    ]);
  });

  /* Below four, it takes what the press carries in the works' own order. */
  it('gives two cylinders the first two process colours', () => {
    expect(names(resizeColours([], 2, SPECIAL, CMYK))).toEqual(['Cyan', 'Magenta']);
  });

  /* Specials already on the line are kept; the process colours join in front. */
  it('keeps the specials it already had and puts the process colours first', () => {
    const three = [{ ...SPECIAL }, { ...SPECIAL }, { ...SPECIAL }];
    const next = resizeColours(three, 7, SPECIAL, CMYK);
    expect(names(next).slice(0, 4)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Black']);
    expect(next.filter((c) => c.kind === 'SPECIAL')).toHaveLength(3);
  });

  /*
   * With no palette to draw on there is nothing to fill with but specials,
   * which is the old behaviour and the right fallback — a works whose rates
   * list prices no ink at all still has stations.
   */
  it('falls back to specials when the palette is empty', () => {
    const next = resizeColours([], 3, SPECIAL, []);
    expect(next).toHaveLength(3);
    expect(next.every((c) => c.kind === 'SPECIAL')).toBe(true);
  });

  /* Shrinking is unchanged: specials go first, newest first. */
  it('still drops specials before process colours on the way down', () => {
    const seven = resizeColours([], 7, SPECIAL, CMYK);
    expect(names(resizeColours(seven, 4, SPECIAL, CMYK))).toEqual([
      'Cyan',
      'Magenta',
      'Yellow',
      'Black',
    ]);
  });
});
