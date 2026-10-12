import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  costJobSheet,
  JOB_SHEET_LINES,
  type JobSheet,
  type JobSheetLine,
  type JobSheetStage,
} from '@yuva/shared';
import { FinalCosting } from './FinalCosting';

/**
 * **The costing screen, against the works' own October sheet.**
 *
 * `Radhey Murmura 16.09.2026`, Sr. No. 851, is a real job: a 650mm three-ply
 * roll job that ran 1.2 days and came off at 1,026 kg. Their workbook puts its
 * cost at **Rs. 261.82 a kilogram**, and that figure is the whole point of the
 * module — it is what the job is invoiced against.
 *
 * So the figures below are theirs, not invented, and the assertions are what
 * their spreadsheet prints. `check:october` already proves `costJobSheet`
 * reproduces the arithmetic; this proves the **screen** puts their answers
 * where their sheet puts them, under their own names. The two together are what
 * "it has to be correct" means for a costing: right number, right box.
 *
 * Line consumption is given as issued-with-nothing-returned so that each row
 * consumes exactly the figure their costing block carries. The mixed-drum
 * arithmetic that produces those figures is the stage entry's business and is
 * tested where it lives.
 */

/** Quantity in Kg. and Rate in Rs., off A87:G108 of their sheet. */
const OCTOBER: Readonly<Record<string, { kg: number; rate: number }>> = {
  pet: { kg: 297.55, rate: 165 },
  ethyl_print: { kg: 69.62, rate: 145 },
  toluene: { kg: 24.46, rate: 165 },
  mibk: { kg: 0, rate: 180 },
  ink_cyan: { kg: 0, rate: 252 },
  ink_magenta: { kg: 0, rate: 252 },
  ink_yellow: { kg: 0, rate: 240 },
  ink_black: { kg: 2.2, rate: 230 },
  ink_white: { kg: 37.04, rate: 240 },
  ink_red: { kg: 8, rate: 270 },
  ink_medium: { kg: 0, rate: 200 },
  ink_orange: { kg: 0, rate: 270 },
  /* Green came back heavier than it went out: the drum was topped up from a
     previous job. Their sheet carries it negative and so does this. */
  ink_dark_green: { kg: -3.2, rate: 250 },
  ink_gold: { kg: 0, rate: 510 },
  ink_pink: { kg: 0, rate: 250 },
  ink_violet: { kg: 1.08, rate: 270 },
  metpet: { kg: 0, rate: 135 },
  ldpe: { kg: 733.9, rate: 170 },
  adhesive: { kg: 20.04, rate: 260 },
  hardener: { kg: 12.07, rate: 260 },
  ethyl_lam: { kg: 4, rate: 145 },
};

const LINES: JobSheetLine[] = JOB_SHEET_LINES.map((template, index) => {
  const figures = OCTOBER[template.key] ?? { kg: 0, rate: 0 };
  return {
    id: `line-${index + 1}`,
    position: index + 1,
    section: template.section,
    kind: template.kind,
    materialId: `material-${index + 1}`,
    name: template.name,
    issuedKg: figures.kg,
    returnedKg: 0,
    issueReels: [],
    returnReels: [],
    mixIssuedKg: 0,
    mixReturnedKg: 0,
    mixSharePercent: template.mixSharePercent,
    computedKg: figures.kg,
    consumedOverrideKg: null,
    consumedKg: figures.kg,
    ratePerKg: figures.rate,
    amount: figures.kg * figures.rate,
  };
});

/** E113:J122 — three office and five works wages, over 1.2 days. */
const CREW: [string, number, number][] = [
  ['office 1', 3, 576],
  ['Office 2', 1, 550],
  ['Operator 1', 1, 1200],
  ['Lamination operattor 2', 2, 1200],
  ['Slitting operator 3', 1, 596],
  ['Pouch operator', 0, 800],
  ['helper g', 6, 540],
  ['helper l', 1, 270],
];

/** O87:Q91 — printing, one lamination pass and slitting ran; nothing else. */
const STAGES: [JobSheetStage, number, number, number][] = [
  ['PRINTING', 60, 1.2, 1],
  ['LAMINATION_1', 20, 1.2, 1],
  ['LAMINATION_2', 20, 0, 1],
  ['SLITTING', 10, 1.2, 1],
  ['POUCHING', 10, 0, 2],
];

type Draft = Omit<JobSheet, 'lines' | 'labour' | 'stages'> & {
  lines: JobSheetLine[];
  labour: JobSheet['labour'];
  stages: JobSheet['stages'];
};

function october(patch: Partial<Draft> = {}): Draft {
  return {
    id: 'sheet-851',
    number: 851,
    date: '2026-09-13',
    status: 'OPEN',
    jobId: 'job-1',
    jobName: 'Radhey Murmura 500gm',
    customerId: 'customer-1',
    customerName: 'Radhey Foods',
    productionOrderId: null,
    productionOrderNumber: null,
    operatorName: 'Anil Patel',
    filmType: 'Polyster',
    webWidthMm: 650,
    micron: 12,
    circumferenceMm: 420,
    cylinderCount: 4,

    printMixIssuedKg: 0,
    printMixReturnedKg: 0,
    lamMixIssuedKg: 0,
    lamMixReturnedKg: 0,

    makeReadyDays: 1,
    productionDays: 1.2,

    printedGrossKg: 0,
    printedCoreKg: 0,
    /* L61 less L62: 1,063 kg of laminate on 4 kg of cores. */
    producedGrossKg: 1063,
    producedCoreKg: 4,
    producedKg: 1059,
    finalOutputKg: 1026,
    pouchingWeightKg: 0,

    electricityPerDay: 6000,
    transportPerKg: 6.8,
    pouchingPerKg: 0,
    packagingCost: 1200,
    emiPerDay: 10000,
    profitPercent: 10,
    expectedWastagePercent: 5,

    electricityOverride: null,
    salaryOverride: null,
    transportOverride: null,
    pouchingOverride: null,
    emiOverride: null,
    profitOverride: null,

    materialKg: 0,
    materialCost: 0,
    basicValuePerKg: 0,
    electricityCost: 0,
    salaryCost: 0,
    transportCost: 0,
    pouchingCost: 0,
    emiCost: 0,
    profit: 0,
    overheadCost: 0,
    effectivePrice: 0,
    costPerKg: 0,
    expectedWastageKg: 0,
    actualWastageKg: 0,
    wastagePercent: 0,
    excessCost: 0,

    stockPostedAt: null,
    notes: '',
    enteredBy: 'Anil Patel',

    lines: LINES,
    outputReels: [],
    labour: CREW.map(([role, headcount, ratePerDay], index) => ({
      id: `labour-${index + 1}`,
      position: index + 1,
      role,
      headcount,
      ratePerDay,
      days: 1.2,
      amount: 0,
    })),
    stages: STAGES.map(([stage, sharePercent, days, shifts], index) => ({
      id: `stage-${index + 1}`,
      stage,
      sharePercent,
      days,
      shifts,
      amount: 0,
      wastageKg: 0,
      noPowerMinutes: 0,
      jobTakenTime: '',
      registrationTime: '',
    })),

    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...patch,
  };
}

/** The same costing the page runs, which is the same one the server runs. */
function costed(draft: Draft) {
  return costJobSheet({
    lines: draft.lines,
    electricityPerDay: draft.electricityPerDay,
    stages: draft.stages,
    labour: draft.labour,
    transportPerKg: draft.transportPerKg,
    pouchingPerKg: draft.pouchingPerKg,
    pouchingWeightKg: draft.pouchingWeightKg,
    packagingCost: draft.packagingCost,
    emiPerDay: draft.emiPerDay,
    emiDays: draft.productionDays,
    profitPercent: draft.profitPercent,
    overrides: {
      electricity: draft.electricityOverride,
      salary: draft.salaryOverride,
      transport: draft.transportOverride,
      pouching: draft.pouchingOverride,
      emi: draft.emiOverride,
      profit: draft.profitOverride,
    },
    producedKg: draft.producedGrossKg - draft.producedCoreKg,
    finalOutputKg: draft.finalOutputKg,
    expectedWastagePercent: draft.expectedWastagePercent,
  });
}

function show(patch: Partial<Draft> = {}, handlers: Record<string, unknown> = {}) {
  const draft = october(patch);
  const live = costed(draft);
  const noop = () => undefined;
  render(
    <FinalCosting
      draft={draft}
      live={live}
      locked={false}
      films={[{ id: 'film-1', name: 'LDPE Natural 50µm' }]}
      indexOf={(position) => draft.lines.findIndex((line) => line.position === position)}
      onField={noop}
      onLine={noop}
      onLabour={noop}
      onStage={noop}
      ratio={{ ink: 15.16, chemical: 31.62, totalOutput: 1027.23 }}
      {...handlers}
    />,
  );
  return { draft, live };
}

/** The row for an item, found by the name their costing block prints. */
function row(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const tr = cell.closest('tr');
  if (!tr) throw new Error(`no row for ${name}`);
  return tr;
}

describe('the Final Costing screen, on sheet 851', () => {
  it('puts their cost per kilogram in the green cell', () => {
    show();
    const cell = screen.getByText('Cost / Kg.').parentElement as HTMLElement;
    expect(within(cell).getByText('Rs. 261.82')).toBeInTheDocument();
    /* Their green, sampled off the fill their workbook uses. */
    expect(cell.className).toContain('#E8F5E9');
  });

  it('agrees with their sheet on every total', () => {
    const { live } = show();

    expect(live.materialKg).toBeCloseTo(1206.76, 2);
    expect(live.materialCost).toBeCloseTo(207965.35, 2);
    expect(live.electricityCost).toBeCloseTo(6480, 2);
    expect(live.salaryCost).toBeCloseTo(11980.8, 2);
    expect(live.effectivePrice).toBeCloseTo(268628.65, 2);
    expect(live.costPerKg).toBeCloseTo(261.82, 2);
    expect(live.wastagePercent).toBeCloseTo(3.22, 2);

    /* And on the screen, not only in the figures handed to it. */
    expect(screen.getAllByText('Rs. 2,68,629').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rs. 11,981').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rs. 6,480').length).toBeGreaterThan(0);
  });

  it('names the rows the way their costing block names them', () => {
    show();
    for (const name of [
      '12 PET Polysyter',
      'Tolluene',
      'METPET',
      'LDPE Mily/Natural',
      'Hardner',
      'Basic Value',
      'Effective Price',
      'Exp. Wastage Kg.',
      'Act. Wastage Kg.',
      'Final Output Kg.',
      'Pouching Weight Kg.',
      'WORKERS SALARY',
      'Salary Expense',
      'Electricity/day cost',
      'Material Type',
      'Ratio',
    ]) {
      expect(screen.getAllByText(name), `${name} is not on the screen`).not.toHaveLength(0);
    }
  });

  it('reads Roll Form until something is pouched', () => {
    show();
    expect(screen.getAllByText('Roll Form').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pouch Form')).not.toBeInTheDocument();
  });

  it('reads Pouch Form once something is', () => {
    show({ pouchingWeightKg: 900 });
    expect(screen.getAllByText('Pouch Form').length).toBeGreaterThan(0);
    expect(screen.queryByText('Roll Form')).not.toBeInTheDocument();
  });

  /*
   * The one rule the whole form runs on. Quantity is a formula on every row of
   * their sheet and only the rate is yellow — so a quantity that arrived as an
   * empty box would invite somebody to type the figure the sheet already knows.
   */
  it('does not offer the quantity as a box until it is corrected', () => {
    show();
    const pet = row('12 PET Polysyter');
    expect(within(pet).queryByLabelText('12 PET Polysyter, quantity')).not.toBeInTheDocument();
    expect(within(pet).getByLabelText('12 PET Polysyter, rate')).toBeInTheDocument();
    expect(within(pet).getByText('297.550')).toBeInTheDocument();
  });

  it('offers a correction, and keeps the worked-out figure beside it', () => {
    const onLine = vi.fn();
    show({}, { onLine });

    fireEvent.click(screen.getByLabelText('Correct the quantity for 12 PET Polysyter'));
    expect(onLine).toHaveBeenCalledWith(1, { consumedOverrideKg: 297.55 });

    show({
      lines: LINES.map((line) =>
        line.position === 1 ? { ...line, consumedOverrideKg: 300 } : line,
      ),
    });
    expect(screen.getAllByText(/was 297.550/).length).toBeGreaterThan(0);
  });

  /*
   * These six have been on the record since the first migration and no screen
   * could set one, so an office that disagreed with the worked-out electricity
   * had nowhere to say so and reached for a spreadsheet instead.
   */
  it('lets the office settle an expense by hand, and work it out again', () => {
    const onField = vi.fn();
    show({}, { onField });

    fireEvent.click(screen.getByLabelText('Settle Electricity Expense by hand'));
    expect(onField).toHaveBeenCalledWith('electricityOverride', 6480);

    const settled = show({ electricityOverride: 7000 }, { onField });
    expect(settled.live.electricityCost).toBe(7000);
    expect(screen.getByText('By hand — was Rs. 6,480')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Work Electricity Expense out again'));
    expect(onField).toHaveBeenCalledWith('electricityOverride', null);
  });

  it('shows what each expense was worked out from', () => {
    show();
    expect(screen.getByText('1,206.76 kg × Rs. 6.80')).toBeInTheDocument();
    expect(screen.getByText('10.00% of Basic Cost')).toBeInTheDocument();
    expect(screen.getByText('1.20 days × Rs. 10,000')).toBeInTheDocument();
    expect(screen.getByText('Nothing pouched on this job')).toBeInTheDocument();
  });

  it('hides the rows that stayed at zero when asked', () => {
    show();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide the rows at zero'));
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
    /* The rows that ran stay, negative ones included. */
    expect(screen.getByText('Dark Green')).toBeInTheDocument();
  });

  it('is read-only once the sheet has been taken off stock', () => {
    const draft = october();
    const live = costed(draft);
    render(
      <FinalCosting
        draft={draft}
        live={live}
        locked
        films={[]}
        indexOf={(position) => draft.lines.findIndex((line) => line.position === position)}
        onField={() => undefined}
        onLine={() => undefined}
        onLabour={() => undefined}
        onStage={() => undefined}
        ratio={{ ink: 15.16, chemical: 31.62, totalOutput: 1027.23 }}
      />,
    );

    expect(screen.getByLabelText('12 PET Polysyter, rate')).toBeDisabled();
    expect(screen.queryByLabelText(/^Correct the quantity/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Settle /)).not.toBeInTheDocument();
  });
});
