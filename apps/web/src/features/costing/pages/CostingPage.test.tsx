import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@yuva/shared';

/**
 * **A toggle must not be gated on the data it reveals.**
 *
 * "Show retired" appears when something retired exists. The page asked the
 * server for `includeRetired = showRetired`, so with the toggle off the answer
 * held active rows only — nothing retired was ever in it to prove anything
 * retired existed, and the button that would have shown them could never
 * render. Retiring a machine or a wage put it beyond reach: the row was still
 * there, and no screen could offer to bring it back.
 *
 * The same shape as the artwork panel's "Show replaced", which was derived from
 * the very list it would reveal. Worth a test each time, because it reads as
 * correct right up until someone retires something.
 *
 * The page therefore always asks for retired rows and filters for display. The
 * rate costing asks separately and for active rows only — a retired machine
 * must not be costed just because this screen can see it.
 */

/** What the page asked the server for, which is the thing that broke. */
const askedFor: (boolean | undefined)[] = [];

const RETIRED_WAGE = {
  id: 'l1',
  role: 'Printing Operator',
  process: 'PRINTING',
  monthlySalary: 25000,
  isActive: false,
  sortOrder: 1,
};
const LIVE_MACHINE = {
  id: 'm1',
  name: 'Rotogravure press',
  kind: 'PRINTING',
  horsepower: 30,
  powerRatePerHpHour: 9,
  speedMPerMin: 65,
  setupMinutes: 60,
  setupPowerFactor: 0,
  stationHorsepower: 12,
  stationColourSteps: '3,4,6',
  isActive: true,
  sortOrder: 1,
};

vi.mock('../api/costing-api', () => ({
  useCostingMasterData: (includeRetired?: boolean) => {
    askedFor.push(includeRetired);
    /* The server honours the flag, so a test that lies about it proves nothing. */
    return {
      data: {
        machines: [LIVE_MACHINE],
        labour: includeRetired ? [RETIRED_WAGE] : [],
        overheads: [],
      },
      isPending: false,
    };
  },
  useSaveMachine: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveLabour: () => ({ mutate: vi.fn(), isPending: false }),
  useRetireMachine: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDefaultMachine: () => ({ mutate: vi.fn(), isPending: false }),
  useRetireLabour: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateOverhead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateOverhead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndOverhead: () => ({ mutate: vi.fn(), isPending: false }),
  costingKeys: { master: (r: boolean) => ['costing', r] },
  downloadCostingWorkbook: vi.fn(),
}));

vi.mock('@/features/quotations/api/quotation-api', () => ({
  useSettings: () => ({ data: DEFAULT_SETTINGS }),
}));

vi.mock('@/features/rates/api/rate-api', () => ({
  useMaterials: () => ({ data: [] }),
}));

vi.mock('@/features/auth/auth-store', () => ({
  canAccess: () => true,
  useAuthStore: () => ({ id: 'u1', isAdmin: true }),
}));

const { default: CostingPage } = await import('./CostingPage');

describe('CostingPage', () => {
  it('asks for retired rows even when the toggle is off', () => {
    askedFor.length = 0;
    render(<CostingPage />);

    /* False here is the bug: the answer would then never contain a retired row. */
    expect(askedFor).not.toContain(false);
    expect(askedFor).toContain(true);
  });

  it('offers Show retired when something is retired', () => {
    render(<CostingPage />);
    expect(screen.getByRole('button', { name: /show retired/i })).toBeInTheDocument();
  });

  it('keeps a retired row out of the tables until the toggle is on', () => {
    render(<CostingPage />);
    // Fetched, so the button can exist — but not listed, because it is retired.
    expect(screen.queryByText('Printing Operator')).not.toBeInTheDocument();
    expect(screen.getByText('Rotogravure press')).toBeInTheDocument();
  });
});

/**
 * **The works' per-style making rates have to be keyable.**
 *
 * They arrived as dated rows written by a script, which is right — it is what
 * keeps an October quotation on the figures it was sold at. But a rate only a
 * script can reach is a rate that goes stale against the quotations being
 * written on it, and the works raises making the same way it raises a film.
 *
 * The same argument that put the Rs 20/25/30 bands on this screen. These four
 * follow them, and the switch that decides which of the two is charged follows
 * the five method switches already there.
 */
describe('the per-style pouch making rates', () => {
  const BOXES = [
    'Zipper pouch — making, Rs/metre',
    'Standup zipper — making, Rs/metre',
    'Standup — making, Rs/metre',
    'Spout — making, Rs/pouch',
  ];

  it('offers a box for each of the four', () => {
    render(<CostingPage />);
    for (const label of BOXES) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  /*
   * Zero on the shipped defaults, because the real figures live in the dated
   * history. A box showing 3.5 here would mean the default had been changed,
   * which would reprice every pouch document in the system.
   */
  it('shows the shipped zero rather than the works’ live figure', () => {
    render(<CostingPage />);
    for (const label of BOXES) {
      expect(screen.getByLabelText(label)).toHaveValue('0');
    }
  });

  it('says in the hint what the rate is in paise a centimetre', () => {
    render(<CostingPage />);
    /* The works says "30 paise a cm"; the box takes Rs a metre. The hint is
       the only thing standing between those two and a 100x error. */
    expect(screen.getByText(/Rs 30 is 30 paise a cm/)).toBeInTheDocument();
    expect(screen.getByText(/a spout costs the same whatever the mouth/)).toBeInTheDocument();
  });

  it('offers the switch, and ships it on the bands', () => {
    render(<CostingPage />);
    const choice = screen.getByLabelText('Pouch making is charged');
    expect(choice).toBeInTheDocument();
    /* BANDS is the shipped default: nothing already quoted moves until the
       dated row says otherwise. */
    expect(choice).toHaveValue('BANDS');
    expect(screen.getByRole('option', { name: /By the style’s own rate/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /By the Rs 20\/25\/30 bands/ })).toBeInTheDocument();
  });

  it('says the style’s rate replaces the band rather than adding to it', () => {
    render(<CostingPage />);
    expect(screen.getByText(/replaces the band; it is not added to it/)).toBeInTheDocument();
  });
});
