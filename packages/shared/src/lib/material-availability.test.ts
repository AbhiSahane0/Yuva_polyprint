import { describe, expect, it } from 'vitest';
import {
  availabilityFor,
  filmRequirements,
  flagsShort,
  shortages,
  type MaterialRequirement,
} from './material-availability.js';

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
      filmRequirements({ layers, quantityKg: 0, structureGsm: 68.6, wastagePercent: 8 }),
    ).toEqual([]);
    expect(
      filmRequirements({ layers: [], quantityKg: 1000, structureGsm: 68.6, wastagePercent: 0 }),
    ).toEqual([]);
  });

  it('skips a ply with no material behind it rather than guessing one', () => {
    const need = filmRequirements({
      layers: [{ materialId: null, name: 'Not chosen', gsm: 16.8 }, ...layers],
      quantityKg: 1000,
      structureGsm: 68.6,
      wastagePercent: 0,
    });
    expect(need.map((n) => n.materialId)).toEqual(['pet', 'pe']);
  });
});

describe('whether the works has it free', () => {
  const need: MaterialRequirement[] = [
    { materialId: 'pet', name: 'PET 12µm', quantity: 250 },
    { materialId: 'pe', name: 'PE 60µm', quantity: 700 },
  ];

  it('measures against FREE stock, not against what is on the shelf', () => {
    /*
     * The whole point. 1,000 kg on hand with 800 committed to another card is
     * 200 free — and a job needing 250 is short, however full the shelf looks.
     */
    const out = availabilityFor(need, {
      onHand: new Map([
        ['pet', 1000],
        ['pe', 1000],
      ]),
      held: new Map([['pet', 800]]),
    });
    expect(out[0]).toMatchObject({ onHand: 1000, held: 800, free: 200, shortBy: 50 });
    expect(out[1]).toMatchObject({ onHand: 1000, held: 0, free: 1000, shortBy: 0 });
  });

  it('reports nothing short when there is enough', () => {
    const out = availabilityFor(need, {
      onHand: new Map([
        ['pet', 500],
        ['pe', 900],
      ]),
      held: new Map(),
    });
    expect(shortages(out)).toEqual([]);
  });

  it('treats a material with no stock at all as short by the whole amount', () => {
    const out = availabilityFor(need, { onHand: new Map(), held: new Map() });
    expect(out[0]!.shortBy).toBe(250);
    expect(shortages(out)).toHaveLength(2);
  });

  it('never reports a negative shortage', () => {
    // Plenty free is not "short by minus 250", which would sort oddly and read
    // as a shortage to anything checking truthiness.
    const out = availabilityFor(need, { onHand: new Map([['pet', 5000]]), held: new Map() });
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
