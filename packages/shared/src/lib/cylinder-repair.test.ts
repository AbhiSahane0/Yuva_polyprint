import { describe, expect, it } from 'vitest';
import { computeItemGeometry } from './quotation-math.js';

/**
 * **A repeat order charges nothing for the set it already has, and may still
 * be quoted for putting one of them right.**
 *
 * The two are separate questions and the arithmetic has to keep them separate:
 * `chargeCylinders` decides whether a new set is cut and billed, the repairs
 * decide what re-engraving an existing one costs. Before this, a repair was
 * quoted in the notes and added to the figure by hand.
 *
 * It lands in the CYLINDER bucket rather than the material rate, because that
 * is how the customer reads it and how the quotation bills it — 100% in
 * advance with the rest of the cylinders.
 */
const LINE = {
  layerCount: 3,
  micron: 91,
  gsm: 101.2,
  widthMm: 420,
  heightMm: 270,
  makesPouches: true,
  repeatWidth: 1,
  repeatHeight: 2,
  cylinderCount: 6,
  mountingMm: 80,
} as const;

/** ₹2.50 a square centimetre, as the works' settings have it. */
const RATE = 2.5;

describe('what the customer pays for cylinders', () => {
  it('charges the set and nothing else on a new design', () => {
    const line = computeItemGeometry({ ...LINE, chargeCylinders: true } as never, RATE);
    expect(line.costPerCylinder).toBe(6750);
    expect(line.totalCylinderCost).toBe(40500);
  });

  it('charges nothing at all on a repeat with no repair', () => {
    const line = computeItemGeometry({ ...LINE, chargeCylinders: false } as never, RATE);
    /* The per-cylinder figure is still reported, so the office can see what a
       new set WOULD have cost — it is simply not billed. */
    expect(line.costPerCylinder).toBe(6750);
    expect(line.totalCylinderCost).toBe(0);
  });

  it('charges the repairs on a repeat, and only the repairs', () => {
    const line = computeItemGeometry(
      {
        ...LINE,
        chargeCylinders: false,
        repairs: [{ cost: 2500 }, { cost: 3200 }],
      } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(5700);
  });

  it('adds a repair to a new set, where a line somehow has both', () => {
    /* Not something the form offers, but the API accepts both and the
       arithmetic must not quietly drop one of them. */
    const line = computeItemGeometry(
      { ...LINE, chargeCylinders: true, repairs: [{ cost: 1000 }] } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(41500);
  });

  it('carries the transport on a new set, as it always did', () => {
    const line = computeItemGeometry(
      { ...LINE, chargeCylinders: true, transportCost: 1200, repairs: [{ cost: 800 }] } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(40500 + 1200 + 800);
  });

  it('is unbothered by a line with no repairs at all', () => {
    const line = computeItemGeometry(
      { ...LINE, chargeCylinders: false, repairs: [] } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(0);
  });
});
