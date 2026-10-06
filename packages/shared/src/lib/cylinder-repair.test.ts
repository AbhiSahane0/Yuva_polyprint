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

/**
 * **A line with no cylinders on it costs nothing for cylinders.**
 *
 * Obvious, and it was not true: the count multiplied out to nought but the
 * transport was added anyway, so an unprinted job quoted a delivery charge for
 * delivering nothing. It is not a corner case — a line that names no colours
 * asks for no cylinders at all, and the works saw a figure on the cylinder
 * line of every one of them.
 */
describe('a line that asks for no cylinders', () => {
  const NONE = { ...LINE, cylinderCount: 0 } as const;

  it('charges nothing, transport included', () => {
    const line = computeItemGeometry({ ...NONE, transportCost: 1500 } as never, RATE);
    expect(line.totalCylinderCost).toBe(0);
  });

  it('still works out what one would have cost, for the screen to decide about', () => {
    /* The figure follows the SIZE, so it exists whether or not any are cut.
       The form shows a dash instead of printing it under a nought total. */
    const line = computeItemGeometry(NONE as never, RATE);
    expect(line.costPerCylinder).toBe(6750);
  });

  it('still charges a repair, which is not a cylinder being cut', () => {
    // A cylinder being put right is one that already exists, so it was never
    // going to be in the count.
    const line = computeItemGeometry(
      {
        ...NONE,
        chargeCylinders: false,
        repairs: [{ cost: 1200 }, { cost: 800 }],
      } as never,
      RATE,
    );
    expect(line.totalCylinderCost).toBe(2000);
  });
});
