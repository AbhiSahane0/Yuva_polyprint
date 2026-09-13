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
      },
      isPending: false,
    };
  },
  useSaveMachine: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveLabour: () => ({ mutate: vi.fn(), isPending: false }),
  useRetireMachine: () => ({ mutate: vi.fn(), isPending: false }),
  useRetireLabour: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
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
