import { describe, expect, it } from 'vitest';
import {
  availabilityFor,
  filmRequirements,
  flagsShort,
  shortages,
  type MaterialRequirement,
} from './material-availability.js';
import type { Reel } from './reel-allocation.js';

/**
 * **Nothing is deducted twice, by construction.**
 *
 * A reservation is not a movement. It never touches a batch and never reaches
 * the ledger — it only moves stock from *free* to *held*. The job sheet stays
 * the one thing that issues material, because it is the one thing that knows
 * what was actually weighed. Production knows what a job SHOULD take, which is
 * an earlier and different question.
 */
describe('what a run needs off the shelf', () => {
  /* The works' ordinary two-ply: 12µ PET at 16.8 GSM over 50µ PE at 47, with
     1.8 of ink and 3 of adhesive on top — a structure of 68.6. */
  const layers = [
    { materialId: 'pet', name: 'PET 12µm', gsm: 16.8 },
    { materialId: 'pe', name: 'PE 60µm', gsm: 47 },
  ];

  it('shares the consumed weight out by each ply’s GSM', () => {
    const need = filmRequirements({
      layers,
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
      needsWidthMm: 0,
    });
    expect(need.map((n) => n.materialId)).toEqual(['pet', 'pe']);
    expect(need[0]!.quantity).toBeCloseTo((16.8 / 68.6) * 1000, 2);
    expect(need[1]!.quantity).toBeCloseTo((47 / 68.6) * 1000, 2);
  });

  it('divides by the STRUCTURE, not by the plies alone', () => {
    /*
     * A kilogram of finished laminate is not a kilogram of film — it carries
     * the ink and the adhesive too. Dividing by the plies would over-reserve
     * every job by a few per cent, quietly, and in the direction that makes
     * the works look short of film it actually has.
     */
    const need = filmRequirements({
      layers,
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
      needsWidthMm: 0,
    });
    const total = need.reduce((sum, n) => sum + n.quantity, 0);
    expect(total).toBeLessThan(1000);
    expect(total).toBeCloseTo(((16.8 + 47) / 68.6) * 1000, 1);
  });

  it('includes the wastage, because that film has to be there first', () => {
    const plain = filmRequirements({
      layers,
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
      needsWidthMm: 0,
    });
    const withWaste = filmRequirements({
      layers,
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 8,
    });
    expect(withWaste[0]!.quantity).toBeCloseTo(plain[0]!.quantity * 1.08, 2);
  });

  it('adds a film used twice into one line', () => {
    /*
     * Two rows for one material would each be checked against the whole of
     * free stock, and a job needing 600 kg twice would pass on 700 kg.
     */
    const need = filmRequirements({
      layers: [
        { materialId: 'pet', name: 'PET 12µm', gsm: 16.8 },
        { materialId: 'pet', name: 'PET 12µm', gsm: 16.8 },
      ],
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
      needsWidthMm: 0,
    });
    expect(need).toHaveLength(1);
    expect(need[0]!.quantity).toBeCloseTo((33.6 / 68.6) * 1000, 2);
  });

  it('asks for nothing when there is nothing to work from', () => {
    // A card on an order typed over the phone has no structure behind it. It
    // must reserve nothing rather than reserve a guess.
    expect(
      filmRequirements({ layers, quantityKg: 1000, structureGsm: 0, wastagePercent: 8 }),
    ).toEqual([]);
    expect(
      filmRequirements({
        layers,
        quantityKg: 0,
        structureGsm: 68.6,
        wastagePercent: 8,
        needsWidthMm: 0,
      }),
    ).toEqual([]);
    expect(
      filmRequirements({
        layers: [],
        quantityKg: 1000,
        structureGsm: 68.6,
        wastagePercent: 0,
        needsWidthMm: 0,
      }),
    ).toEqual([]);
  });

  it('skips a ply with no material behind it rather than guessing one', () => {
    const need = filmRequirements({
      layers: [{ materialId: null, name: 'Not chosen', gsm: 16.8 }, ...layers],
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
      needsWidthMm: 0,
    });
    expect(need.map((n) => n.materialId)).toEqual(['pet', 'pe']);
  });
});

describe('whether the works has it free, and in the right size', () => {
  const need: MaterialRequirement[] = [
    { materialId: 'pet', name: 'PET 12µm', quantity: 250, needsWidthMm: 650 },
    { materialId: 'pe', name: 'PE 60µm', quantity: 700, needsWidthMm: 650 },
  ];

  /** Rolls, as the stock side hands them over: what is on each and what is left. */
  const rolls = (...rows: [string, number | null, number, number?][]): Reel[] =>
    rows.map(([batchId, widthMm, onHand, free]) => ({
      batchId,
      batchCode: batchId,
      widthMm,
      receivedOn: '2026-09-01',
      onHand,
      free: free ?? onHand,
    }));

  it('measures against what is left on the rolls, not what is on them', () => {
    /*
     * 1,000 kg on a roll with 800 of it claimed by another card is 200 to this
     * one — and a job needing 250 is short, however full the shelf looks.
     */
    const out = availabilityFor(need, {
      reels: new Map([
        ['pet', rolls(['p1', 700, 1000, 200])],
        ['pe', rolls(['e1', 700, 1000])],
      ]),
    });
    expect(out[0]).toMatchObject({ onHand: 1000, held: 800, free: 200, usable: 200, shortBy: 50 });
    expect(out[1]).toMatchObject({ onHand: 1000, held: 0, free: 1000, usable: 1000, shortBy: 0 });
  });

  it('will not run a job on rolls too narrow for it', () => {
    /*
     * **The whole point of a width.** Film can be slit down and never widened,
     * so 900 kg on 340 mm rolls is no use at all to a job that runs at 650 —
     * and a works told it has 900 kg free sends the job to the machine.
     */
    const out = availabilityFor([need[0]!], { reels: new Map([['pet', rolls(['n1', 340, 900])]]) });
    expect(out[0]).toMatchObject({
      onHand: 900,
      free: 900,
      usable: 0,
      tooNarrowKg: 900,
      shortBy: 250,
    });
    expect(out[0]!.reels).toEqual([]);
  });

  it('names the rolls the job takes', () => {
    /*
     * The thing a quantity could never do: tell the floor which rolls to fetch,
     * and stop two cards being promised one roll.
     */
    const out = availabilityFor([need[0]!], {
      reels: new Map([['pet', rolls(['wide', 900, 400], ['fits', 700, 150])]]),
    });
    expect(out[0]!.reels).toEqual([
      { batchId: 'fits', batchCode: 'fits', widthMm: 700, quantity: 150 },
      { batchId: 'wide', batchCode: 'wide', widthMm: 900, quantity: 100 },
    ]);
    expect(out[0]!.shortBy).toBe(0);
  });

  it('separates the film that is the wrong size from the film that is missing', () => {
    /*
     * Two different problems with two different answers: one is solved by
     * buying more, the other by buying differently.
     */
    const out = availabilityFor([need[0]!], {
      reels: new Map([['pet', rolls(['narrow', 340, 2100], ['wide', 700, 800])]]),
    });
    expect(out[0]).toMatchObject({
      onHand: 2900,
      free: 2900,
      usable: 800,
      tooNarrowKg: 2100,
      shortBy: 0,
    });
  });

  it('counts a roll whose width nobody recorded', () => {
    /*
     * Not a claim that it fits — an admission that nothing here can say it does
     * not. A works that has never recorded a width is left exactly where it was
     * before widths existed.
     */
    const out = availabilityFor([need[0]!], { reels: new Map([['pet', rolls(['u', null, 900])]]) });
    expect(out[0]).toMatchObject({ usable: 900, tooNarrowKg: 0, shortBy: 0 });
  });

  it('turns the width test off when the job’s geometry is unknown', () => {
    // A card on an order typed over the phone. Better no test than a wrong one.
    const out = availabilityFor([{ ...need[0]!, needsWidthMm: 0 }], {
      reels: new Map([['pet', rolls(['n', 340, 900])]]),
    });
    expect(out[0]).toMatchObject({ usable: 900, tooNarrowKg: 0, shortBy: 0 });
  });

  it('treats a material with no stock at all as short by the whole amount', () => {
    const out = availabilityFor(need, { reels: new Map() });
    expect(out[0]!.shortBy).toBe(250);
    expect(shortages(out)).toHaveLength(2);
  });

  it('never reports a negative shortage', () => {
    const out = availabilityFor([need[0]!], { reels: new Map([['pet', rolls(['p', 700, 5000])]]) });
    expect(out[0]!.shortBy).toBe(0);
  });
});

describe('when the works is told about a shortage', () => {
  const short = [
    {
      materialId: 'pet',
      name: 'PET 12µm',
      quantity: 250,
      onHand: 10,
      held: 0,
      free: 10,
      shortBy: 240,
    },
  ];

  it('flags a card that has still to run', () => {
    for (const status of ['PLANNED', 'RUNNING', 'ON_HOLD']) {
      expect(flagsShort({ status, materials: short })).toHaveLength(1);
    }
  });

  it('says nothing about a card that has finished', () => {
    /*
     * The job had its film weeks ago. What is free TODAY says nothing about a
     * run that is over, and a red flag on it sends somebody to solve a problem
     * that was already solved. The figures stay; the alarm goes.
     */
    expect(flagsShort({ status: 'COMPLETED', materials: short })).toEqual([]);
  });
});
