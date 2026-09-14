import { describe, expect, it } from 'vitest';
import {
  adhesiveGsmFor,
  batchSolidsFor,
  costRate,
  inkGsmOf,
  machineHorsepower,
  parseAdhesiveRatio,
  parseStationSteps,
  marginsAt,
  salaryPerMinute,
  unpricedColours,
  type CostingInput,
} from './rate-costing.js';

/**
 * Checked against the works' own workbook — "3. Anupriya.xlsx", 5 kg atta
 * packaging, 23 March 2022 — cell by cell.
 *
 * Where a figure here differs from that sheet it is because the sheet is
 * wrong, and each case is asserted separately below so the difference is a
 * decision on the record rather than a surprise.
 */

/** Their machines, their wages, their overheads. */
const MASTER = {
  machines: [
    /* 30 HP press + three 12 HP stations, costed at the Rs 9 tariff. */
    {
      name: 'Rotogravure',
      kind: 'PRINTING' as const,
      horsepower: 66,
      powerRatePerHpHour: 9,
      speedMPerMin: 65,
      setupMinutes: 60,
    },
    {
      name: 'Laminator',
      kind: 'LAMINATION' as const,
      horsepower: 6,
      powerRatePerHpHour: 35,
      speedMPerMin: 70,
      setupMinutes: 30,
    },
    {
      name: 'Slitter',
      kind: 'SLITTING' as const,
      horsepower: 3,
      powerRatePerHpHour: 60,
      speedMPerMin: 80,
      setupMinutes: 30,
    },
  ],
  labour: [
    { role: 'Printing Operator', process: 'PRINTING' as const, monthlySalary: 25000 },
    { role: 'Printing Assistant', process: 'PRINTING' as const, monthlySalary: 13000 },
    { role: 'Printing Helper', process: 'PRINTING' as const, monthlySalary: 8000 },
    { role: 'Slitting Operator', process: 'SLITTING' as const, monthlySalary: 12000 },
    { role: 'Slitting Helper', process: 'SLITTING' as const, monthlySalary: 8000 },
  ],
  overheads: {
    workingDaysPerMonth: 26,
    hoursPerDay: 8,
    transportPerKg: 10,
    packingPerKg: 5,
    otherPerJob: 250,
    emiPerMonth: 4166.66,
    emiHoursPerMonth: 24,
    /*
     * The sheet charges 15 a kilogram for pouch making, flat, so the parity
     * block below reproduces it through the OVERRIDE — which is exactly what
     * the seven real quotations rebuilt from those sheets carry. By style this
     * job would pay 0.25 a pouch over 43.13 pouches, or 10.78 a kilogram.
     */
    pouchMaking: { makingPerPouch: 0.25, zipperRatePerMetre: 3.6, dPunchPerPouch: 0.35 },
    pouchMakingPerKgOverride: 15,
    stationSurcharges: [5.5, 7.5, 9],
    marginPercent: 9,
    /* The works' own choices — see the parity block at the foot of this file. */
    marginBasis: 'MATERIAL_ONLY' as const,
    emiBasis: 'RUN_TIME' as const,
    inkCostModel: 'PER_COLOUR' as const,
    adhesiveCostModel: 'BATCH' as const,
  },
};

const JOB = {
  orderQtyKg: 500,
  wastagePercent: 8,
  filmWidthMm: 700,
  filmHeightMm: 600,
  ups: 1,
  trimMm: 15,
  layers: [
    { name: 'Pet', micron: 12, density: 1.4, ratePerKg: 185 },
    /* The sheet keeps this row and leaves it empty. */
    { name: 'Met Pet', micron: 0, density: 1.4, ratePerKg: 180 },
    { name: 'W/O Poly', micron: 110, density: 0.94, ratePerKg: 163 },
  ],
  colours: [
    { name: 'Black', laydownGsm: 0.15, solidsPercent: 23, ratePerKg: 202 },
    { name: 'Cyan', laydownGsm: 0.14, solidsPercent: 19.5, ratePerKg: 217 },
    { name: 'Magenta', laydownGsm: 0.13, solidsPercent: 19.5, ratePerKg: 235 },
    { name: 'Yellow', laydownGsm: 0.13, solidsPercent: 19.5, ratePerKg: 202 },
  ],
  adhesive: {
    gsm: 3,
    ratio: '100:146:15',
    adhesiveRatePerKg: 165,
    ethylAcetateRatePerKg: 125,
    hardenerRatePerKg: 365,
  },
  solvent: {
    inkParts: 100,
    solventParts: 80,
    ethylAcetatePercent: 50,
    ethylAcetateRatePerKg: 125,
    tolueneRatePerKg: 95,
  },
  makesPouches: true,
};

const input = (over: Partial<CostingInput> = {}): CostingInput => ({
  job: JOB,
  ...MASTER,
  ...over,
});

/**
 * The sheet's own structure, where ink is held at a flat 1.8 GSM. Used to prove
 * the film arithmetic matches theirs exactly before the corrections are
 * applied on top.
 */
const sheetStructure = (): CostingInput => ({
  ...input(),
  job: { ...JOB, colours: [{ name: 'All', laydownGsm: 1.8, solidsPercent: 23, ratePerKg: 202 }] },
});

/**
 * **A press draws what the colours on it draw.**
 *
 * Their sheet does not charge the full connected load on every job: the 30 HP
 * main drive runs alone until the third colour, and a 12 HP station motor comes
 * on at the third, the fourth and the sixth. Charging 66 HP throughout
 * overstated electricity on every job short of a full press — by Rs 1.53 a
 * kilogram on the client's own two-colour Govt Sugar quotation, which was the
 * worst of seven old sheets it was checked against.
 *
 * The 3rd/4th/6th is what that sheet computes, and what the operator confirms.
 * Its layout implies the 3rd, 5th and 7th, and two of its four references are
 * off by one; the readings differ at four colours and at six. Simla Farsan is
 * the four-colour job in the client's own set and only reproduces at 54 HP, so
 * the data agreed before anyone asked. The steps stay a setting because a
 * rewired press is a fact about the works.
 */
describe('what a press draws', () => {
  const press = {
    name: 'Rotogravure',
    kind: 'PRINTING' as const,
    horsepower: 30,
    powerRatePerHpHour: 9,
    speedMPerMin: 65,
    setupMinutes: 60,
    stationHorsepower: 12,
    stationColourSteps: [3, 4, 6],
  };

  it.each([
    [1, 30],
    [2, 30],
    [3, 42],
    [4, 54],
    [5, 54],
    [6, 66],
    [7, 66],
    [8, 66],
  ])('draws %i colours at %i HP', (colours, hp) => {
    expect(machineHorsepower(press, colours)).toBe(hp);
  });

  it('keeps a fixed load where there are no station motors', () => {
    const laminator = { ...press, stationHorsepower: 0, stationColourSteps: [] };
    expect(machineHorsepower(laminator, 2)).toBe(30);
    expect(machineHorsepower(laminator, 8)).toBe(30);
  });

  it('reads the steps the Costing screen holds', () => {
    expect(parseStationSteps('3,4,6')).toEqual([3, 4, 6]);
    expect(parseStationSteps(' 3 , 5,7 ')).toEqual([3, 5, 7]);
    /* Blank, or nonsense, leaves the load fixed rather than guessing. */
    expect(parseStationSteps('')).toEqual([]);
    expect(parseStationSteps('abc')).toEqual([]);
  });

  it('disagrees with the sheet’s own layout at four colours and at six', () => {
    const asWritten = [3, 4, 6];
    const asImplied = [3, 5, 7];
    const written = (c: number) =>
      machineHorsepower({ ...press, stationColourSteps: asWritten }, c);
    const implied = (c: number) =>
      machineHorsepower({ ...press, stationColourSteps: asImplied }, c);

    for (const colours of [1, 2, 3, 5, 7, 8]) expect(written(colours)).toBe(implied(colours));

    expect(written(4)).toBe(54);
    expect(implied(4)).toBe(42);
    expect(written(6)).toBe(66);
    expect(implied(6)).toBe(54);
  });
});

describe('the film arithmetic matches the works’ sheet', () => {
  const result = costRate(sheetStructure())!;

  it('reaches the same total GSM', () => {
    // Estimation!G15
    expect(result.totalGsm).toBe(125);
  });

  it('consumes the same quantity after wastage', () => {
    // Estimation!I5 and I6
    expect(result.wastageKg).toBe(40);
    expect(result.consumedKg).toBe(540);
  });

  it('splits the plies the same way, in kilograms and in metres', () => {
    const pet = result.layers.find((layer) => layer.name === 'Pet')!;
    const poly = result.layers.find((layer) => layer.name === 'W/O Poly')!;

    expect(pet.quantityKg).toBeCloseTo(72.576, 3); // Estimation!C32
    expect(poly.quantityKg).toBeCloseTo(446.688, 3); // Estimation!C34
    // Both plies run the same web length. Estimation!D32 and D34.
    expect(pet.metres).toBeCloseTo(6041.96, 1);
    expect(poly.metres).toBeCloseTo(6041.96, 1);

    expect(pet.cost).toBeCloseTo(13426.56, 2); // Estimation!F32
    expect(poly.cost).toBeCloseTo(72810.14, 2); // Estimation!F34
  });

  it('runs the machines for the same number of minutes', () => {
    const printing = result.processes.find((p) => p.kind === 'PRINTING')!;
    const lamination = result.processes.find((p) => p.kind === 'LAMINATION')!;
    const slitting = result.processes.find((p) => p.kind === 'SLITTING')!;

    expect(printing.runMinutes).toBeCloseTo(92.95, 2); // Estimation!H32
    expect(lamination.runMinutes).toBeCloseTo(86.31, 2); // Estimation!H34
    expect(slitting.runMinutes).toBeCloseTo(75.52, 2); // Estimation!H35
  });

  it('turns a salary into the same rate per minute', () => {
    // Estimation!F42: 25000 / 26 / 8 / 60
    expect(salaryPerMinute(25000, 26, 8)).toBeCloseTo(2.0032, 4);
  });

  it('weighs a pouch the same', () => {
    // Estimation!J9 and J10
    expect(result.pieceWeightG).toBeCloseTo(52.5, 2);
    expect(result.piecesPerKg).toBeCloseTo(19.0476, 3);
  });

  it('charges the same transport, packing and sundries', () => {
    expect(result.transportCost).toBe(5400); // Estimation!G48
    expect(result.packingCost).toBe(2700); // Estimation!G49
    expect(result.otherCost).toBe(250); // Estimation!G47
  });
});

describe('ink is priced per colour, wet, with its solvent', () => {
  const result = costRate(input())!;

  it('buys the wet weight, not the dry', () => {
    /*
     * The rule, from Costing!J9: pigment that stays on the film, then grossed
     * up by the solids to what has to be bought. Black lays 0.15 GSM and the
     * tin is 23% solids, so 100/23 of the dry weight is purchased.
     *
     * Their sheet reads 0.648 kg dry against 4,320 m². It comes out slightly
     * higher here (0.6545 over 4,364 m²) and that is the ink-GSM correction
     * arriving: with ink at 0.55 rather than a flat 1.8 the laminate is
     * lighter, so a kilogram of it carries more PET, and more PET is more
     * printed area. The rule is identical; the structure it runs on is fixed.
     */
    const black = result.colours.find((colour) => colour.name === 'Black')!;
    expect(black.wetKg).toBeCloseTo((black.dryKg * 100) / 23, 4);
    expect(black.dryKg).toBeCloseTo(0.6545, 3);
    expect(black.wetKg).toBeCloseTo(2.8457, 3);
    expect(black.inkCost).toBeCloseTo(574.83, 1);
  });

  it('adds solvent at the press ratio, split between the two', () => {
    // Costing!J12, J14, J15: 80/180 of the wet ink, half EA and half toluene.
    const black = result.colours.find((colour) => colour.name === 'Black')!;
    expect(black.solventKg).toBeCloseTo((black.wetKg * 80) / 180, 4);
    const half = black.solventKg / 2;
    expect(black.solventCost).toBeCloseTo(half * 125 + half * 95, 1);
  });

  it('takes the ink GSM from the colours, not from a flat figure', () => {
    /*
     * The correction that matters most. Their Estimation sheet holds ink at
     * 1.8 GSM while Costing prices the four colours actually used, which come
     * to 0.55 — and the structure's figure is what decides a pouch's weight.
     * A four-colour job was being weighed as though it carried three times the
     * ink it does, which made every pouch heavier and every per-pouch price
     * wrong.
     */
    expect(inkGsmOf(JOB.colours)).toBeCloseTo(0.55, 4);
    expect(result.inkGsm).toBeCloseTo(0.55, 4);
    expect(result.totalGsm).toBeCloseTo(123.75, 4);
  });
});

describe('adhesive is a diluted batch', () => {
  const result = costRate(input())!;

  it('honours the ratio that was chosen', () => {
    /*
     * Their sheet could not. The lookup was SUMIFS over a single cell, so it
     * returned the first row of the table whatever the office picked: a job
     * set to 100:146:15 was costed at 100:189:15, buying 12.67 kg of adhesive
     * and 23.94 kg of ethyl acetate instead of 14.75 and 21.54.
     */
    expect(result.adhesiveDetail.batchSolidsPercent).toBe(35);
    const { adhesiveKg, ethylAcetateKg, hardenerKg, batchKg } = result.adhesiveDetail;
    expect(adhesiveKg / batchKg).toBeCloseTo(100 / 261, 5);
    expect(ethylAcetateKg / batchKg).toBeCloseTo(146 / 261, 5);
    expect(hardenerKg / batchKg).toBeCloseTo(15 / 261, 5);
  });

  it('spreads the adhesive over the substrate, not over itself', () => {
    // Costing!D23 — the divisor is the film, which is what it is spread on.
    expect(result.substrateGsm).toBeCloseTo(120.2, 4);
  });

  it('knows what each dilution leaves behind', () => {
    expect(batchSolidsFor('100:189:15')).toBe(30);
    expect(batchSolidsFor('100:68:15')).toBe(50);
    expect(batchSolidsFor('nonsense')).toBeNull();
    expect(parseAdhesiveRatio('100:146:15')).toEqual([100, 146, 15]);
    expect(parseAdhesiveRatio('100:146')).toBeNull();
  });
});

describe("the sheet's own rules", () => {
  it("charges power for running time only, as the works' sheet does", () => {
    /*
     * The sheet bills the operator for the hour spent setting the press and
     * bills nothing for the press. Arguably it is switched on — but the office
     * reconciles against that sheet, so this follows it, and the works can
     * charge some or all of the setup load on the Costing screen.
     */
    const result = costRate(input())!;
    const printing = result.processes.find((p) => p.kind === 'PRINTING')!;
    const perMinute = (66 * 9) / 60;
    expect(printing.electricityCost).toBeCloseTo(perMinute * printing.runMinutes, 1);
  });

  it('does not book a lamination pass for a ply that is not there', () => {
    /*
     * The sheet keeps an empty Met PET row. Counted as a ply it books a second
     * pass, and the job pays for a laminator that never ran.
     */
    const result = costRate(input())!;
    const lamination = result.processes.find((p) => p.kind === 'LAMINATION')!;
    const printing = result.processes.find((p) => p.kind === 'PRINTING')!;
    expect(lamination.metres).toBeCloseTo(printing.metres, 1);

    /* Add the ply for real and the laminator runs twice. */
    const threePly = costRate({
      ...input(),
      job: {
        ...JOB,
        layers: JOB.layers.map((l) => (l.name === 'Met Pet' ? { ...l, micron: 12 } : l)),
      },
    })!;
    const twice = threePly.processes.find((p) => p.kind === 'LAMINATION')!;
    const once = threePly.processes.find((p) => p.kind === 'PRINTING')!;
    expect(twice.metres).toBeCloseTo(once.metres * 2, 1);
  });

  it('divides by what was ordered, not by what was consumed', () => {
    /*
     * The two sheets disagreed by exactly this. Wastage is already inside the
     * cost; dividing by the consumed quantity charges for it and hands it back.
     */
    const result = costRate(input())!;
    expect(result.baseRatePerKg).toBeCloseTo(result.totalCost / 500, 4);
    expect(result.baseRatePerKg).not.toBeCloseTo(result.totalCost / 540, 2);
  });
});

describe('margin', () => {
  it("is taken on materials alone, as the works' sheet does", () => {
    const result = costRate(input())!;
    expect(result.marginAmount).toBeCloseTo(result.materialCost * 0.09, 1);
    /* Which recovers the labour and the power at cost, earning nothing on it. */
    expect(result.marginAmount).toBeLessThan(result.costBeforeMargin * 0.09);
  });

  it('can be taken on the whole cost, when the works decides to', () => {
    const result = costRate({
      ...input(),
      overheads: { ...MASTER.overheads, marginBasis: 'TOTAL_COST' },
    })!;
    expect(result.marginAmount).toBeCloseTo(result.costBeforeMargin * 0.09, 1);
  });

  it('reports the margin as a share of the rate, not as a mark-up on cost', () => {
    /*
     * 9% added to cost is 8.26% of the selling price. The office reads margin
     * off the quotation, where it is always the second figure.
     *
     * Only the margin itself counts. The pouch charge and the station
     * surcharge sit outside the cost build-up but they are still costs, and
     * counting the gap between the rate and the build-up as profit reported a
     * pouched job at 13.7% against a 9% mark-up — half again as profitable as
     * the identical film on a reel, purely because it was cut up.
     */
    const result = costRate(input())!;
    expect(result.netMarginPercent).toBeGreaterThan(0);
    expect(result.netMarginPercent).toBeLessThan(result.marginPercent);

    /* A roll and a pouch of the same film earn the same margin. */
    const roll = costRate({ ...input(), job: { ...JOB, makesPouches: false } })!;
    expect(roll.netMarginPercent).toBeGreaterThan(result.netMarginPercent);
    expect(result.marginAmount).toBeCloseTo(roll.marginAmount, 2);
  });
});

describe('what the rate is built from', () => {
  it('adds a surcharge only for stations past the fifth', () => {
    const four = costRate(input())!;
    expect(four.stationSurchargePerKg).toBe(0);

    const seven = costRate({
      ...input(),
      job: {
        ...JOB,
        colours: [
          ...JOB.colours,
          { name: 'White', laydownGsm: 1.8, solidsPercent: 40, ratePerKg: 200 },
          { name: 'Red', laydownGsm: 0.25, solidsPercent: 23, ratePerKg: 210 },
          { name: 'Violet', laydownGsm: 0.25, solidsPercent: 22.1, ratePerKg: 210 },
        ],
      },
    })!;
    // The sixth and the seventh: 5.5 + 7.5, as Estimation!G59 and G60.
    expect(seven.stationSurchargePerKg).toBeCloseTo(13, 4);
  });

  it('charges pouch making only when the line is pouches', () => {
    const roll = costRate({ ...input(), job: { ...JOB, makesPouches: false } })!;
    expect(roll.pouchMakingPerKg).toBe(0);
    expect(costRate(input())!.pouchMakingPerKg).toBe(15);
  });

  /**
   * **The charge is per pouch, and a kilogram of small pouches costs more to
   * make than a kilogram of big ones.**
   *
   * Which is the whole reason it moved. A flat rate per kilogram cannot say
   * that, and across the works' own nine costed pouches the same per-pouch
   * charge reads anywhere between Rs 11 and Rs 64 a kilogram.
   */
  it('spreads the per-pouch charge over however many pouches a kilogram makes', () => {
    const byStyle = {
      ...input(),
      job: { ...JOB, pouchType: 'STANDUP' as const, pouchWidthMm: 700 },
      overheads: { ...input().overheads, pouchMakingPerKgOverride: null },
    };

    const result = costRate(byStyle)!;
    expect(result.pouchExpense.perPouch).toBeCloseTo(0.25, 4);
    expect(result.pouchMakingPerKg).toBeCloseTo(0.25 * result.piecesPerKg, 3);

    /* Half the pouch, twice as many to the kilogram, twice the charge on it. */
    const smaller = costRate({
      ...byStyle,
      job: { ...byStyle.job, piecesPerKgOverride: result.piecesPerKg * 2 },
    })!;
    expect(smaller.pouchMakingPerKg).toBeCloseTo(result.pouchMakingPerKg * 2, 3);
  });

  it('adds the zipper across the mouth, by the metre', () => {
    const zipped = costRate({
      ...input(),
      job: { ...JOB, pouchType: 'STANDUP_ZIPPER' as const, pouchWidthMm: 130 },
      overheads: { ...input().overheads, pouchMakingPerKgOverride: null },
    })!;

    // 0.13 m at Rs 3.60, on top of the making charge every pouch pays.
    expect(zipped.pouchExpense.zipper).toBeCloseTo(0.468, 4);
    expect(zipped.pouchExpense.perPouch).toBeCloseTo(0.718, 4);
  });

  it('adds the punch on a D punch, and nothing on a roll', () => {
    const punched = costRate({
      ...input(),
      job: { ...JOB, pouchType: 'D_PUNCH' as const, pouchWidthMm: 190 },
      overheads: { ...input().overheads, pouchMakingPerKgOverride: null },
    })!;
    expect(punched.pouchExpense.perPouch).toBeCloseTo(0.6, 4);
    expect(punched.pouchExpense.zipper).toBe(0);

    const roll = costRate({
      ...input(),
      job: { ...JOB, makesPouches: false, pouchType: null },
      overheads: { ...input().overheads, pouchMakingPerKgOverride: null },
    })!;
    expect(roll.pouchExpense.perPouch).toBe(0);
    expect(roll.pouchMakingPerKg).toBe(0);
  });

  /*
   * The override replaces the whole charge, so the parts would no longer add up
   * to what is being charged. Reporting them anyway would put a breakdown on
   * screen that does not reconcile with the figure above it.
   */
  it('reports no breakdown when the office has overridden the charge', () => {
    const overridden = costRate(input())!;
    expect(overridden.pouchMakingPerKg).toBe(15);
    expect(overridden.pouchExpense.perPouch).toBe(0);
  });

  it('adds up to the rate it reports', () => {
    const r = costRate(input())!;
    expect(r.materialCost).toBeCloseTo(r.filmCost + r.inkCost + r.adhesiveCost, 2);
    expect(r.costBeforeMargin).toBeCloseTo(r.materialCost + r.overheadCost + r.electricityCost, 2);
    expect(r.totalCost).toBeCloseTo(r.costBeforeMargin + r.marginAmount, 2);
    expect(r.ratePerKg).toBeCloseTo(
      r.baseRatePerKg + r.stationSurchargePerKg + r.pouchMakingPerKg,
      2,
    );
    expect(r.ratePerPiece).toBeCloseTo(r.ratePerKg / r.piecesPerKg, 4);
  });

  it('refuses a job that cannot describe itself', () => {
    expect(costRate({ ...input(), job: { ...JOB, orderQtyKg: 0 } })).toBeNull();
    expect(costRate({ ...input(), job: { ...JOB, layers: [] } })).toBeNull();
  });
});

describe('the rate that is shown is the rate that is applied', () => {
  it('counts pieces the way the caller does, when the caller has counted', () => {
    /*
     * The quotation works out pieces per kilogram from its own geometry, which
     * allows for gussets and uses the settings' ink GSM rather than the colours
     * actually chosen. Left to disagree, the panel displayed Rs 1.10 a piece
     * and wrote Rs 1.15 into the line — the document quoting one figure while
     * the screen that produced it showed another.
     */
    const own = costRate(input())!;
    const told = costRate({
      ...input(),
      job: { ...JOB, piecesPerKgOverride: 296.3 },
    })!;

    expect(told.piecesPerKg).toBeCloseTo(296.3, 3);
    expect(told.ratePerPiece).toBeCloseTo(told.ratePerKg / 296.3, 4);
    /* The weight it reports follows the count it was given, not its own. */
    expect(told.pieceWeightG).toBeCloseTo(1000 / 296.3, 3);
    /* Per kilogram is untouched — only the piece arithmetic moves. */
    expect(told.ratePerKg).toBeCloseTo(own.ratePerKg, 4);
  });

  it('falls back to its own count when it is not told one', () => {
    const result = costRate({ ...input(), job: { ...JOB, piecesPerKgOverride: null } })!;
    expect(result.pieceWeightG).toBeCloseTo(
      (JOB.filmWidthMm * JOB.filmHeightMm * result.totalGsm) / 1_000_000,
      3,
    );
  });
});

describe('how much power a machine draws while it is being set', () => {
  const printing = (factor: number | undefined) =>
    costRate({
      ...input(),
      machines: MASTER.machines.map((machine) =>
        machine.kind === 'PRINTING' ? { ...machine, setupPowerFactor: factor } : machine,
      ),
    })!.processes.find((process) => process.kind === 'PRINTING')!;

  it('reproduces the sheet at 0, and the full load at 1', () => {
    /*
     * Their sheet charges nothing for setup power and this app charged
     * everything — which on their own job is the difference between Rs 920 and
     * Rs 1,514 for one press, two thirds more. A press being threaded and
     * having its cylinders cleaned is neither, and nothing in this code can
     * know which, so the works sets it.
     */
    const perMinute = (66 * 9) / 60;
    const none = printing(0);
    expect(none.electricityCost).toBeCloseTo(perMinute * none.runMinutes, 1);

    /*
     * And on the sheet's own structure it is the sheet's own figure. It has to
     * be measured there rather than here: with ink at 0.55 GSM the laminate is
     * lighter, a kilogram carries more PET, and the press runs a minute longer
     * — Rs 929.51 rather than Rs 920.24. Right, and not the sheet's number.
     */
    const asSheet = costRate({
      ...sheetStructure(),
      machines: MASTER.machines.map((machine) =>
        machine.kind === 'PRINTING' ? { ...machine, setupPowerFactor: 0 } : machine,
      ),
    })!.processes.find((process) => process.kind === 'PRINTING')!;
    expect(asSheet.electricityCost).toBeCloseTo(920.24, 0); // Estimation!K32

    const full = printing(1);
    expect(full.electricityCost).toBeCloseTo(perMinute * (full.runMinutes + full.setupMinutes), 1);
  });

  it('scales between the two', () => {
    const half = printing(0.5);
    expect(half.electricityCost).toBeCloseTo(
      (printing(0).electricityCost + printing(1).electricityCost) / 2,
      1,
    );
  });

  it('charges nothing for setup when nobody has said otherwise', () => {
    /* The default has to be what the works' sheet does, or nothing ties out. */
    expect(printing(undefined).electricityCost).toBeCloseTo(printing(0).electricityCost, 2);
  });

  it('still pays the operator for every setup minute', () => {
    // Somebody is standing there whatever the machine is drawing.
    expect(printing(0).labourCost).toBeCloseTo(printing(1).labourCost, 2);
  });
});

describe('a colour nobody has priced', () => {
  it('is named rather than costed at nothing', () => {
    /*
     * The failure this prevents is silent: white lays 1.8 g/m² against a
     * process colour's 0.13, so a job printing it at a rate of zero quotes at
     * roughly a twelfth of its real ink and looks entirely normal on the page.
     */
    expect(
      unpricedColours([
        { name: 'Black', laydownGsm: 0.15, solidsPercent: 23, ratePerKg: 202 },
        { name: 'White', laydownGsm: 1.8, solidsPercent: 40, ratePerKg: 0 },
      ]),
    ).toEqual(['White']);
  });

  it('passes a fully priced set', () => {
    expect(unpricedColours(JOB.colours)).toEqual([]);
  });
});

describe('gross and net', () => {
  const result = costRate(input())!;

  it('reads both off the sheet’s own cost buckets', () => {
    /*
     * The works' sheet has one margin concept — material cost times nine per
     * cent — and no gross/net split. Its labelled totals map onto both: B is
     * the materials, and A + C + D plus the per-kilogram extras are the rest.
     */
    expect(result.materialCostPerKg).toBeCloseTo(result.materialCost / 500, 3);
    expect(result.fullCostPerKg).toBeCloseTo(
      result.costBeforeMargin / 500 + result.stationSurchargePerKg + result.pouchMakingPerKg,
      3,
    );
    expect(result.fullCostPerKg).toBeGreaterThan(result.materialCostPerKg);
  });

  it('flatters a small order on gross and tells the truth on net', () => {
    /*
     * The trap this exists to close. Materials cost the same per kilogram at
     * any volume, so a short run at a higher rate shows a FATTER gross margin
     * than a long one — while actually earning less, because the same hour of
     * setup is spread over a fraction of the film.
     */
    const small = costRate({ ...input(), job: { ...JOB, orderQtyKg: 25 } })!;
    const large = costRate({ ...input(), job: { ...JOB, orderQtyKg: 2000 } })!;

    expect(small.ratePerKg).toBeGreaterThan(large.ratePerKg);
    /* Gross says the small order is the better one... */
    expect(small.grossMarginPercent).toBeGreaterThan(large.grossMarginPercent);
    /* ...and net, which counts the setup, says the opposite. */
    expect(small.netMarginPercent).toBeLessThan(large.netMarginPercent);
    /* Gross is always the flattering one. */
    expect(small.grossMarginPercent).toBeGreaterThan(small.netMarginPercent);
  });

  it('measures a rate somebody typed, not the one it suggested', () => {
    // Quoting the margin on a price nobody is offering is worse than no margin.
    const cheaper = marginsAt(result.ratePerKg * 0.9, result);
    expect(cheaper.netPercent).toBeLessThan(result.netMarginPercent);
    expect(cheaper.grossPercent).toBeLessThan(result.grossMarginPercent);

    const atSuggested = marginsAt(result.ratePerKg, result);
    expect(atSuggested.netPercent).toBeCloseTo(result.netMarginPercent, 2);
    expect(atSuggested.grossPercent).toBeCloseTo(result.grossMarginPercent, 2);
  });

  it('reports a loss as a negative margin rather than hiding it', () => {
    const below = marginsAt(result.fullCostPerKg * 0.8, result);
    expect(below.netPercent).toBeLessThan(0);
  });
});

/**
 * The whole point, in one block: **the works' own workbook, reproduced.**
 *
 * "3. Anupriya.xlsx", Estimation sheet, 5 kg atta packaging, 23 March 2022.
 * Every figure below is a cell in that sheet. The office costs against it and
 * the client checks quotations against it, so where the workbook and this code
 * disagreed the workbook won — including in the two places it argues with
 * itself, where its headline figure decides.
 *
 * If this block ever fails, a quotation stopped agreeing with the document the
 * client is holding.
 */
describe("the works' workbook, cell by cell", () => {
  const SHEET: CostingInput = {
    job: {
      orderQtyKg: 500, // B8
      wastagePercent: 8, // J5
      filmWidthMm: 700, // F6
      filmHeightMm: 600, // E6
      ups: 1, // B9
      trimMm: 15, // B10
      layers: [
        { name: 'Pet', micron: 12, density: 1.4, ratePerKg: 185 },
        /* The sheet keeps this row on every job and leaves it empty. */
        { name: 'Met Pet', micron: 0, density: 1.4, ratePerKg: 180 },
        { name: 'W/O Poly', micron: 110, density: 0.94, ratePerKg: 163 },
      ],
      colours: JOB.colours,
      flatInk: { ratePerKg: 800 }, // E37
      adhesive: {
        gsm: 3, // E13, picked by the sheet's own IF on ply thickness
        ratio: '100:146:15', // D20
        flatRatePerKg: 400, // E36
        adhesiveRatePerKg: 165,
        ethylAcetateRatePerKg: 125,
        hardenerRatePerKg: 365,
      },
      solvent: JOB.solvent,
      makesPouches: true,
      inkGsmOverride: 1.8, // G14 — the structure's figure, not the colours'
      adhesiveSplitRatio: '100:189:15', // what the sheet's lookup returns
      stationCount: 7, // J19 — stations, not priced colours
    },
    machines: MASTER.machines.map((machine) => ({ ...machine, setupPowerFactor: 0 })),
    labour: MASTER.labour,
    overheads: { ...MASTER.overheads, inkCostModel: 'FLAT_GSM', adhesiveCostModel: 'FLAT_GSM' },
  };

  const r = costRate(SHEET)!;

  it.each([
    ['F32  PET cost', 13426.56, () => r.layers[0]!.cost],
    ['F34  poly cost', 72810.14, () => r.layers[1]!.cost],
    ['F37  ink cost', 6220.8, () => r.inkCost],
    ['F36  adhesive cost', 5184, () => r.adhesiveCost],
    ['F38  B material total', 97641.5, () => r.materialCost],
    ['G51  A labour, transport, packing, EMI', 9820.12, () => r.overheadCost],
    ['K37  D electricity', 1448.91, () => r.electricityCost],
    ['G55  E profit margin', 8787.74, () => r.marginAmount],
    ['G56  A+B+C+D+E', 117698.27, () => r.totalCost],
    ['G57  1 kg cost', 235.4, () => r.baseRatePerKg],
    ['G59+G60  stations 6 and 7', 13, () => r.stationSurchargePerKg],
    ['G62  pouch making', 15, () => r.pouchMakingPerKg],
    ['G63  CALCULATED FINAL COST', 263.4, () => r.ratePerKg],
    ['G64  per pouch', 13.83, () => r.ratePerPiece],
  ])('%s', (_cell, expected, actual) => {
    /* Half a rupee, which is the sheet's own display rounding. */
    expect(actual()).toBeCloseTo(expected, 0);
  });

  /**
   * The blended rate and the purchase rate are not alternatives.
   *
   * Estimation costs the whole laydown at Rs 800/kg — a figure that already
   * carries the solvent, the dilution and the losses. Costing buys the same
   * black at Rs 202 and prices the solvent beside it. Both are right for their
   * own method, and the app pointed the flat model at the purchase rate: ink
   * came out a quarter light on every quotation, and nothing said so, because
   * Rs 202 is a perfectly plausible number for ink.
   */
  it('understates ink when the flat method is fed a purchase rate', () => {
    const purchase = costRate({
      ...SHEET,
      job: { ...SHEET.job, flatInk: { ratePerKg: 202 } },
    })!;

    expect(r.inkCost).toBeCloseTo(6220.8, 0);
    expect(purchase.inkCost).toBeCloseTo(1570.75, 0);
    /*
     * Rs 9.30 a kilogram of missing ink, and Rs 10.14 off the quoted rate —
     * the margin is taken on material cost, so understating the ink
     * understates the profit on it as well.
     */
    expect((r.inkCost - purchase.inkCost) / 500).toBeCloseTo(9.3, 1);
    expect(r.ratePerKg - purchase.ratePerKg).toBeCloseTo(10.14, 1);
  });

  it('overstates adhesive when the flat method is fed a drum rate', () => {
    const drum = costRate({
      ...SHEET,
      job: { ...SHEET.job, adhesive: { ...SHEET.job.adhesive, flatRatePerKg: 165 } },
    })!;

    expect(r.adhesiveCost).toBeCloseTo(5184, 0);
    expect(drum.adhesiveCost).toBeCloseTo(2138.4, 0);
  });

  it('reaches the same structure the sheet does', () => {
    expect(r.totalGsm).toBe(125); // G15
    expect(r.consumedKg).toBe(540); // I6
    expect(r.pieceWeightG).toBeCloseTo(52.5, 2); // J9
    expect(r.piecesPerKg).toBeCloseTo(19.0476, 3); // J10
  });

  it('still shows what the detailed ink method would have said', () => {
    /*
     * The workbook prices ink twice and the two disagree by 2x: Estimation
     * takes the laydown at one blended rate, Costing takes each colour wet
     * with its solids and solvent. The headline figure uses Estimation, so
     * that is the default — but the per-colour working is computed either way,
     * because it is the more accurate of the two and the office will want it
     * when they are ready.
     */
    expect(r.colours).toHaveLength(4);
    const detailed = r.colours.reduce((total, colour) => total + colour.cost, 0);
    expect(detailed).toBeCloseTo(3071.68, 0); // Costing!N20
    expect(r.inkCost).toBeCloseTo(6220.8, 0); // and Estimation!F37 is what is used
  });
});

describe('adhesive is worked out from the structure', () => {
  const opts = { thinGsm: 2, thickGsm: 3, thickPlyMicron: 40 };

  it('matches the sheet on the job the sheet costs', () => {
    /*
     * Estimation!E13/F13/G13: a heavier coat under a ply thicker than 40µ, one
     * coat per lamination. PET over a 110µ poly is 3 gsm across one join.
     */
    expect(adhesiveGsmFor([{ micron: 12 }, { micron: 110 }], opts)).toBe(3);
  });

  it('takes the thin coat under a thin ply', () => {
    // Quotation 132: PET 12µ over MET PET 12µ — one join, nothing thick.
    expect(adhesiveGsmFor([{ micron: 12 }, { micron: 12 }], opts)).toBe(2);
  });

  it('counts a coat for every lamination, not for every ply', () => {
    /*
     * The sheet writes this as "2 if there is a Met PET ply, else 1", which is
     * a shortcut for its own three-ply structure. Plies minus one agrees with
     * it everywhere the sheet is actually used and is right elsewhere too.
     */
    expect(adhesiveGsmFor([{ micron: 12 }, { micron: 12 }, { micron: 110 }], opts)).toBe(6);
  });

  it('is nothing at all on a single ply', () => {
    // An unlaminated film is not glued to anything.
    expect(adhesiveGsmFor([{ micron: 12 }], opts)).toBe(0);
    expect(adhesiveGsmFor([], opts)).toBe(0);
  });
});

describe('why the margin is the same at every quantity', () => {
  /**
   * Asked twice, so it is written down: it is not a bug, it is the sheet's own
   * formula. `G55 = G52 × E2` — nine per cent of the MATERIAL cost. Material
   * scales exactly with the quantity, so material per kilogram is identical at
   * any volume and so is the margin it produces. Only the setup and the
   * sundries shrink, and on most jobs they are a rounding error beside the
   * film.
   */
  const at = (qty: number) => costRate({ ...input(), job: { ...JOB, orderQtyKg: qty } })!;

  it('holds the margin per kilogram exactly constant', () => {
    const small = at(500);
    const large = at(5000);
    /* To four decimals; the residue is the margin being rounded to paise. */
    expect(small.marginAmount / 500).toBeCloseTo(large.marginAmount / 5000, 4);
    expect(small.materialCostPerKg).toBeCloseTo(large.materialCostPerKg, 4);
  });

  it('lets the rate fall only by what the fixed costs shed', () => {
    /* Which on a film-heavy job is very little — and that is the real answer. */
    const small = at(500);
    const large = at(5000);
    expect(large.ratePerKg).toBeLessThan(small.ratePerKg);
    expect(small.ratePerKg - large.ratePerKg).toBeLessThan(small.ratePerKg * 0.1);
  });

  it('moves the moment the margin is taken on the whole cost instead', () => {
    /*
     * The other basis makes the margin follow the cost, which does fall with
     * volume — so if the office wants the tiers to differ, that is the switch.
     */
    const whole = (qty: number) =>
      costRate({
        ...input(),
        job: { ...JOB, orderQtyKg: qty },
        overheads: { ...MASTER.overheads, marginBasis: 'TOTAL_COST' },
      })!;
    expect(whole(500).marginAmount / 500).toBeGreaterThan(whole(5000).marginAmount / 5000);
  });
});
