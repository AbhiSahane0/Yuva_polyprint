import { describe, expect, it } from 'vitest';
import {
  asHoursMinutes,
  computeJobCard,
  dispatchDateFrom,
  type JobCardDesign,
  type JobCardEntry,
  type JobCardRates,
} from './job-card.js';

/**
 * **The works' own job card, reproduced to the figure.**
 *
 * Every number below is read off the Job Sheet tab of their workbook for
 * "Amruta Family Elaichi Tea 500g. Standy Pouch (Scheme Offer)" — a 200 kg run
 * on a 12 PET / 12 Met Pet / 100 poly standy. This is the job-card equivalent
 * of `seed:old-quotations`: if it stops matching, the card on the screen has
 * stopped matching the paper on the floor, and the operator will believe the
 * paper.
 */
const AMRUTA: JobCardDesign = {
  petMicron: 12,
  metPetMicron: 12,
  polyMicron: 100,
  petGsm: 16.8,
  metPetGsm: 16.8,
  polyGsm: 92,
  /* 130.4, not 125.6 — the composite carries the ink and the adhesive. */
  compositeGsm: 130.4,
  rubberSizeMm: 625,
  pouchesPerKg: 65.0994198,
  totalCylinders: 8,
};

/** 15, 10, 110% and +15 days, as the sheet has them. */
const RATES: JobCardRates = {
  cylinderChangeoverMinutes: 15,
  rubberChangeMinutes: 10,
  plyAllowancePercent: 10,
  dispatchLeadDays: 15,
};

const ENTRY: JobCardEntry = {
  quantityKg: 200,
  printSpeedMPerMin: 80,
  pouchingSpeedPerMin: 0,
  otherSettingMinutes: 40,
};

const card = computeJobCard(AMRUTA, RATES, ENTRY);

describe('the Amruta job card', () => {
  it('cuts every ply ten millimetres wider than the rubber', () => {
    // C12 and E19 on the sheet: 625 + 10.
    expect(card.materialSizeMm).toBe(635);
    expect(card.pet.sizeMm).toBe(635);
    expect(card.poly.sizeMm).toBe(635);
  });

  it('states the structure at 127 micron', () => {
    // F8: 12 + 100 + 12 + 3. The three is the sheet's flat coat allowance.
    expect(card.totalMicron).toBe(127);
  });

  it('draws each ply at its share of the laminate, plus the allowance', () => {
    // F14, B20 and E20. Shares taken against the composite, so the three
    // plies come to a little under the order before the 10% is added.
    expect(card.pet.kg).toBeCloseTo(28.34355828, 5);
    expect(card.metPet.kg).toBeCloseTo(28.34355828, 5);
    expect(card.poly.kg).toBeCloseTo(155.2147239, 5);
  });

  it('works the metreage off the PET ply alone', () => {
    // F15: (28.3436 × 1,000,000) ÷ (12 × 635 × 1.395).
    expect(card.printMeters).toBeCloseTo(2666.399334, 3);
  });

  it('reads the press at 33 minutes', () => {
    // G16: 2,666.4 ÷ 80, printed as h:mm.
    expect(asHoursMinutes(card.printMinutes)).toBe('0:33');
  });

  it('allows fifteen minutes a cylinder to change over, and ten for its rubber', () => {
    // G31 and E32: eight cylinders.
    expect(asHoursMinutes(card.cylinderChangeoverMinutes)).toBe('2:00');
    expect(asHoursMinutes(card.rubberChangeMinutes)).toBe('1:20');
  });

  it('stands on the floor for four hours thirty-three', () => {
    // G32: changeover + rubber + setting + press.
    expect(asHoursMinutes(card.totalMinutes)).toBe('4:33');
  });

  it('counts the pouches the run will make', () => {
    // C30: pouches a kilogram × the order.
    expect(card.totalPouches).toBeCloseTo(13019.88, 2);
  });

  it('says the pouching time is not known rather than dividing by nothing', () => {
    /*
     * The works' sheet prints #DIV/0! here until somebody types the speed,
     * which is honest and unreadable. A card handed to an operator says the
     * figure is not known yet.
     */
    expect(card.pouchingMinutes).toBeNull();
    expect(asHoursMinutes(card.pouchingMinutes)).toBe('—');

    const known = computeJobCard(AMRUTA, RATES, { ...ENTRY, pouchingSpeedPerMin: 60 });
    expect(asHoursMinutes(known.pouchingMinutes)).toBe('3:37');
  });

  it('promises despatch fifteen days after the order', () => {
    // C7: the PO date plus the works' lead.
    expect(dispatchDateFrom('2026-08-12', 15)).toBe('2026-08-27');
  });
});

/**
 * The structures that are not three plies, which the sheet handles by leaving
 * rows blank rather than by printing a nought.
 */
describe('a structure without every ply', () => {
  const twoPly = computeJobCard(
    { ...AMRUTA, metPetMicron: 0, metPetGsm: 0, polyGsm: 108.8, compositeGsm: 130.4 },
    RATES,
    ENTRY,
  );

  it('cuts nothing for a ply the structure does not have', () => {
    // B18 on the sheet is blank when the Met Pet micron is zero.
    expect(twoPly.metPet.sizeMm).toBe(0);
    expect(twoPly.metPet.kg).toBe(0);
  });

  it('leaves it out of the micron as well', () => {
    expect(twoPly.totalMicron).toBe(115);
  });
});

describe('a card with nothing typed on it yet', () => {
  const blank = computeJobCard(AMRUTA, RATES, {
    quantityKg: 0,
    printSpeedMPerMin: 0,
    pouchingSpeedPerMin: 0,
    otherSettingMinutes: 0,
  });

  it('works out no draw, no metreage and no press time', () => {
    /* Nought, never an infinity or a NaN — this prints on paper an operator
       is expected to act on. */
    expect(blank.pet.kg).toBe(0);
    expect(blank.printMeters).toBe(0);
    expect(blank.printMinutes).toBe(0);
    expect(blank.totalPouches).toBe(0);
  });

  it('still allows the cylinder time, which the order size does not change', () => {
    // Eight cylinders take the same two hours to change whatever is run on them.
    expect(asHoursMinutes(blank.totalMinutes)).toBe('3:20');
  });
});
