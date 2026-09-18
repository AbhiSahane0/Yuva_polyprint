import { describe, expect, it } from 'vitest';
import { costRate, type CostingInput } from './rate-costing.js';

/**
 * **Why a bigger order has to come out cheaper, and why it did not.**
 *
 * The works asked for one thing: quote 1,000 kg and 2,000 kg of the same job
 * and see about ten rupees a kilogram between them. The app moved twenty paise.
 *
 * The reason is that every figure in the Estimation-sheet model scales with the
 * kilograms — material, power, the bank EMI, and labour, which is billed by the
 * minute of the machine an operator stands at. The only genuinely fixed cost on
 * a job is `otherPerJob`, Rs 250. Half of Rs 250 is not ten rupees a kilogram.
 *
 * The works' own job card knows better. It charges the whole crew and the bank
 * by the DAY, and a job does not occupy the works in proportion to its size,
 * because the make-ready is the same whatever the order. Their fourteen
 * September 2026 sheets fit `days = 0.75 + kg / 1,945` — and the job card
 * records that make-ready in a box and then charges nothing for it, which is
 * why even their actuals understate it.
 *
 * Both models are here on purpose. Settings are read as at a quotation's own
 * date, so the seven 2022 quotations that reproduce their old sheets to the
 * paisa keep doing so, and only work quoted after the switch uses the day.
 */

const JOB: CostingInput = {
  job: {
    orderQtyKg: 1000,
    wastagePercent: 8,
    filmWidthMm: 700,
    filmHeightMm: 600,
    ups: 1,
    trimMm: 15,
    layers: [
      { name: 'Pet', micron: 12, density: 1.4, ratePerKg: 185 },
      { name: 'W/O Poly', micron: 110, density: 0.94, ratePerKg: 163 },
    ],
    colours: [{ name: 'Black', laydownGsm: 0.15, solidsPercent: 23, ratePerKg: 202 }],
    flatInk: { ratePerKg: 800 },
    adhesive: {
      gsm: 3,
      ratio: '100:146:15',
      flatRatePerKg: 400,
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
    makesPouches: false,
    inkGsmOverride: 1.8,
    adhesiveSplitRatio: '100:189:15',
    stationCount: 4,
  },
  machines: [
    {
      name: 'Press',
      kind: 'PRINTING',
      horsepower: 66,
      powerRatePerHpHour: 9,
      speedMPerMin: 65,
      setupMinutes: 60,
      setupPowerFactor: 0,
    },
    {
      name: 'Laminator 1',
      kind: 'LAMINATION',
      horsepower: 6,
      powerRatePerHpHour: 35,
      speedMPerMin: 70,
      setupMinutes: 30,
      setupPowerFactor: 0,
    },
    {
      name: 'Slitter',
      kind: 'SLITTING',
      horsepower: 3,
      powerRatePerHpHour: 60,
      speedMPerMin: 80,
      setupMinutes: 30,
      setupPowerFactor: 0,
    },
  ],
  labour: [{ role: 'Printing Operator', process: 'PRINTING', monthlySalary: 25000 }],
  overheads: {
    workingDaysPerMonth: 26,
    hoursPerDay: 8,
    transportPerKg: 10,
    packingPerKg: 5,
    otherPerJob: 250,
    emiPerMonth: 4166.66,
    emiHoursPerMonth: 24,
    emiBasis: 'RUN_TIME',
    stationSurcharges: [5.5, 7.5, 9],
    marginPercent: 9,
    marginBasis: 'MATERIAL_ONLY',
    inkCostModel: 'FLAT_GSM',
    adhesiveCostModel: 'FLAT_GSM',
  },
};

const DAY = {
  rateModel: 'PER_DAY' as const,
  worksDayCost: 20000,
  makeReadyDays: 0.75,
  kgPerDay: 1945,
};

const at = (kg: number, day = false) =>
  costRate({
    ...JOB,
    job: { ...JOB.job, orderQtyKg: kg },
    overheads: { ...JOB.overheads, ...(day ? DAY : {}) },
  })!;

describe('the works’ complaint', () => {
  /* The measurement that started this. Kept so it cannot come back. */
  it('is real: by the minute, doubling the order moves the rate by pennies', () => {
    const gap = at(1000).ratePerKg - at(2000).ratePerKg;
    expect(gap).toBeLessThan(1);
  });

  it('is answered by the day: doubling the order is worth about ten rupees', () => {
    const gap = at(1000, true).ratePerKg - at(2000, true).ratePerKg;
    expect(gap).toBeGreaterThan(6);
    expect(gap).toBeLessThan(12);
  });

  /* The curve only ever falls, and never turns back up. */
  it('falls the whole way, and by less each time', () => {
    const rates = [250, 500, 1000, 2000, 5000, 10000].map((kg) => at(kg, true).ratePerKg);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]!).toBeLessThan(rates[i - 1]!);

    const early = rates[0]! - rates[1]!;
    const late = rates[rates.length - 2]! - rates[rates.length - 1]!;
    expect(early).toBeGreaterThan(late);
  });
});

describe('the days a job occupies the works', () => {
  it('are make-ready plus running', () => {
    expect(at(1945, true).occupiedDays).toBeCloseTo(1.75, 3);
    expect(at(3890, true).occupiedDays).toBeCloseTo(2.75, 3);
  });

  /**
   * The make-ready is the entire effect.
   *
   * Take it away and the days scale with the kilograms exactly, and what is
   * left of the curve is precisely the old `otherPerJob` — Rs 250 over 1,000 kg
   * against Rs 250 over 2,000, which is 12.5 paise. That residual is a compact
   * statement of what was wrong with the per-minute model: Rs 250 was the only
   * thing in it that a second kilogram did not bring more of.
   */
  it('flatten to nothing but the old Rs 250 when the make-ready is zero', () => {
    const flat = (kg: number) =>
      costRate({
        ...JOB,
        job: { ...JOB.job, orderQtyKg: kg },
        overheads: { ...JOB.overheads, ...DAY, makeReadyDays: 0 },
      })!.ratePerKg;

    const residual = flat(1000) - flat(2000);
    const fromOtherPerJob = JOB.overheads.otherPerJob / 1000 - JOB.overheads.otherPerJob / 2000;
    expect(residual).toBeCloseTo(fromOtherPerJob, 2);
    expect(residual).toBeLessThan(0.15);
  });

  it('are not counted at all under the per-minute model', () => {
    expect(at(1000).occupiedDays).toBe(0);
    expect(at(1000).worksDayCost).toBe(0);
  });
});

describe('the day charge replaces the per-minute one', () => {
  /*
   * It does not sit on top of it. Billing the crew by the day AND by the minute
   * would charge the same people twice, which is the obvious way to get this
   * wrong and would pass a test that only checked the curve.
   */
  it('bills no per-minute labour or EMI once the day is charged', () => {
    const day = at(1000, true);
    expect(day.labourCost).toBe(0);
    expect(day.emiCost).toBe(0);
    expect(day.worksDayCost).toBeGreaterThan(0);
  });

  it('bills the crew by the minute when the day is not charged', () => {
    const minute = at(1000);
    expect(minute.labourCost).toBeGreaterThan(0);
    expect(minute.emiCost).toBeGreaterThan(0);
  });

  /* Electricity is per machine under both, which is what keeps two laminators
     of different cost distinguishable. */
  it('leaves machine electricity alone', () => {
    expect(at(1000, true).electricityCost).toBe(at(1000).electricityCost);
  });
});

/**
 * **A dearer laminator makes a dearer job, under either model.**
 *
 * The works runs two and they do not cost the same. `powerRatePerHpHour` is
 * already a loaded rate rather than a tariff — their own figures are printing
 * 9, lamination 35, slitting 60 — so the second machine is described by raising
 * it, and a slower one by dropping the speed.
 */
describe('choosing the other laminator', () => {
  const on = (rate: number, speed: number, day: boolean) =>
    costRate({
      ...JOB,
      machines: JOB.machines.map((m) =>
        m.kind === 'LAMINATION'
          ? { ...m, name: 'Laminator 2', powerRatePerHpHour: rate, speedMPerMin: speed }
          : m,
      ),
      overheads: { ...JOB.overheads, ...(day ? DAY : {}) },
    })!.ratePerKg;

  it('costs more when it is dearer to run', () => {
    expect(on(70, 70, true)).toBeGreaterThan(on(35, 70, true));
    expect(on(70, 70, false)).toBeGreaterThan(on(35, 70, false));
  });

  it('costs more when it is slower', () => {
    expect(on(35, 40, true)).toBeGreaterThan(on(35, 70, true));
  });
});

describe('the settings the works turns', () => {
  it('moves every rate when a day of the works costs more', () => {
    const dear = costRate({
      ...JOB,
      overheads: { ...JOB.overheads, ...DAY, worksDayCost: 30000 },
    })!.ratePerKg;
    expect(dear).toBeGreaterThan(at(1000, true).ratePerKg);
  });

  it('steepens the curve when the make-ready is longer', () => {
    const steep = (kg: number) =>
      costRate({
        ...JOB,
        job: { ...JOB.job, orderQtyKg: kg },
        overheads: { ...JOB.overheads, ...DAY, makeReadyDays: 1.5 },
      })!.ratePerKg;
    expect(steep(1000) - steep(2000)).toBeGreaterThan(
      at(1000, true).ratePerKg - at(2000, true).ratePerKg,
    );
  });

  it('cheapens a job when the works runs more kilograms a day', () => {
    const faster = costRate({
      ...JOB,
      overheads: { ...JOB.overheads, ...DAY, kgPerDay: 4000 },
    })!.ratePerKg;
    expect(faster).toBeLessThan(at(1000, true).ratePerKg);
  });

  /* Nothing may divide by zero on a half-filled Costing screen. */
  it('survives a works that runs no kilograms a day', () => {
    const broken = costRate({
      ...JOB,
      overheads: { ...JOB.overheads, ...DAY, kgPerDay: 0 },
    })!;
    expect(Number.isFinite(broken.ratePerKg)).toBe(true);
    expect(broken.occupiedDays).toBeCloseTo(0.75, 3);
  });
});

/**
 * **Two laminators, and the job runs on one of them.**
 *
 * The works has a second and the costing charges a machine for the metres its
 * KIND must run — so simply adding it to the list would bill every job for two
 * lamination passes it never made. Quietly: nothing in the total says which
 * machine it came from, and both entries look perfectly reasonable on the
 * Costing screen.
 */
describe('a works with two laminators', () => {
  const second = {
    name: 'Laminator 2',
    kind: 'LAMINATION' as const,
    horsepower: 6,
    powerRatePerHpHour: 35,
    speedMPerMin: 70,
    setupMinutes: 30,
    setupPowerFactor: 0,
  };
  const both = { ...JOB, machines: [...JOB.machines, second] };

  it('does not charge the job twice for lamination', () => {
    expect(costRate(both)!.ratePerKg).toBe(costRate(JOB)!.ratePerKg);
  });

  it('runs on one of each kind, whatever is on the list', () => {
    const kinds = costRate(both)!.processes.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  /* Unnamed, the job takes the first of its kind — the works' own order. */
  it('takes the first laminator when the job names none', () => {
    const used = costRate(both)!.processes.find((p) => p.kind === 'LAMINATION');
    expect(used!.machine).toBe('Laminator 1');
  });

  it('takes the one the job names, wherever it sits on the list', () => {
    const chosen = costRate({
      ...both,
      job: { ...both.job, machineChoice: { LAMINATION: 'Laminator 2' } },
    })!;
    expect(chosen.processes.find((p) => p.kind === 'LAMINATION')!.machine).toBe('Laminator 2');
  });

  /* The whole point of naming one: when they differ, the rate differs. */
  it('prices the dearer machine dearer once it actually differs', () => {
    const dearer = { ...second, powerRatePerHpHour: 90 };
    const list = { ...JOB, machines: [...JOB.machines, dearer] };
    const onFirst = costRate(list)!.ratePerKg;
    const onSecond = costRate({
      ...list,
      job: { ...list.job, machineChoice: { LAMINATION: 'Laminator 2' } },
    })!.ratePerKg;
    expect(onSecond).toBeGreaterThan(onFirst);
  });

  /* A name nobody recognises is a typo, not an instruction to charge nothing. */
  it('falls back to the first when the named machine is not there', () => {
    const used = costRate({
      ...both,
      job: { ...both.job, machineChoice: { LAMINATION: 'Laminator 9' } },
    })!.processes.find((p) => p.kind === 'LAMINATION');
    expect(used!.machine).toBe('Laminator 1');
  });
});
