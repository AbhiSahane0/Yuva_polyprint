import { describe, expect, it } from 'vitest';
import {
  batchSolidsFor,
  costRate,
  inkGsmOf,
  parseAdhesiveRatio,
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
    pouchMakingPerKg: 15,
    stationSurcharges: [5.5, 7.5, 9],
    marginPercent: 9,
    marginBasis: 'TOTAL_COST' as const,
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

describe('the corrections their sheets need', () => {
  it('pays for the power a machine draws while it is being set up', () => {
    /*
     * Their sheet billed the operator for the hour spent setting the press and
     * billed nothing for the press. It is switched on.
     */
    const result = costRate(input())!;
    const printing = result.processes.find((p) => p.kind === 'PRINTING')!;
    const perMinute = (66 * 9) / 60;
    expect(printing.electricityCost).toBeCloseTo(
      perMinute * (printing.runMinutes + printing.setupMinutes),
      1,
    );
    /* Which is more than the run-time-only figure the sheet reports. */
    expect(printing.electricityCost).toBeGreaterThan(perMinute * printing.runMinutes);
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
  it('is taken on the whole cost by default', () => {
    const result = costRate(input())!;
    expect(result.marginAmount).toBeCloseTo(result.costBeforeMargin * 0.09, 1);
  });

  it('can be taken on materials alone, to reconcile with the old sheet', () => {
    const result = costRate({
      ...input(),
      overheads: { ...MASTER.overheads, marginBasis: 'MATERIAL_ONLY' },
    })!;
    expect(result.marginAmount).toBeCloseTo(result.materialCost * 0.09, 1);
    /* Which recovers the labour and the power at cost, earning nothing. */
    expect(result.marginAmount).toBeLessThan(result.costBeforeMargin * 0.09);
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
    expect(result.marginOnRatePercent).toBeGreaterThan(0);
    expect(result.marginOnRatePercent).toBeLessThan(result.marginPercent);

    /* A roll and a pouch of the same film earn the same margin. */
    const roll = costRate({ ...input(), job: { ...JOB, makesPouches: false } })!;
    expect(roll.marginOnRatePercent).toBeGreaterThan(result.marginOnRatePercent);
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

  it('charges the full load when nobody has said otherwise', () => {
    /* The default has to be what the app did before the field existed. */
    expect(printing(undefined).electricityCost).toBeCloseTo(printing(1).electricityCost, 2);
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
