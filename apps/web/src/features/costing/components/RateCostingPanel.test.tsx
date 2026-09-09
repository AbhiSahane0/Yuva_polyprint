import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, type AppSettings, type Material } from '@yuva/shared';
import { RateCostingPanel } from './RateCostingPanel';
import type { RateCosting, RateCostingLine } from '../api/use-rate-costing';

/**
 * **The panel must not offer a control that changes nothing.**
 *
 * Ink is costed two ways and the works runs the flat one: the structure's
 * stated GSM times one blended rate. Which colours are ticked does not enter
 * that arithmetic anywhere — measured, not assumed: the same job came to
 * Rs 233.76/kg on CMYK, on CMYK + Gold and on CMYK + White alike.
 *
 * The panel showed a picker beside it regardless, captioned "what they are
 * changes the price". It did not. Worse, ticking a metallic nobody had priced
 * yet refused the whole quotation — a refusal with no arithmetic behind it,
 * since the rate would have been identical either way.
 */

const INK = (over: Partial<Material>): Material =>
  ({
    id: over.name,
    name: 'Ink — Cyan',
    category: 'INK',
    inkKind: 'PROCESS',
    laydownGsm: 0.14,
    solidsPercent: 19.5,
    currentRate: 217,
    ...over,
  }) as Material;

const CYAN = INK({ name: 'Ink — Cyan' });
const GOLD = INK({ name: 'Ink — Gold', inkKind: 'SPECIAL', laydownGsm: 0.25, currentRate: 0 });

const LINE: RateCostingLine = {
  layers: [{ name: 'PET 12µm', micron: 12, density: 1.4, ratePerKg: 185 }],
  filmWidthMm: 700,
  filmHeightMm: 600,
  ups: 1,
  colourCount: 4,
  makesPouches: true,
  quantitiesKg: [500],
  piecesPerKg: 20,
};

const costing = (settings: AppSettings): RateCosting =>
  ({
    settings,
    master: { machines: [], labour: [] },
    input: { job: { flatInk: { ratePerKg: 210 } } },
    perColourInk: settings.inkCostModel === 'PER_COLOUR',
    process: [CYAN],
    special: [GOLD],
    colourNames: [CYAN.name],
    toggle: () => {},
    setChosen: () => {},
    results: [],
    unusable: null,
  }) as unknown as RateCosting;

/*
 * The per-colour branch mounts the "add a special colour" modal, which asks
 * for a query client. The flat branch mounts nothing that does — which the
 * first three cases below prove by rendering with no provider at all.
 */
const show = (settings: AppSettings) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RateCostingPanel costing={costing(settings)} line={LINE} />
    </QueryClientProvider>,
  );

const flat = { ...DEFAULT_SETTINGS, inkCostModel: 'FLAT_GSM' as const };
const perColour = { ...DEFAULT_SETTINGS, inkCostModel: 'PER_COLOUR' as const };

describe('RateCostingPanel', () => {
  it('offers no colour picker when the colours are not costed', () => {
    render(<RateCostingPanel costing={costing(flat)} line={LINE} />);

    expect(screen.queryByText(/colours it prints/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a special colour/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says what it costed the ink at instead', () => {
    render(<RateCostingPanel costing={costing(flat)} line={LINE} />);

    /* The two figures that actually decide the ink, and the material they came from. */
    expect(screen.getByText(/1\.80 gsm at Rs\s*210\.00\/kg/)).toBeInTheDocument();
    expect(screen.getByText(/Ink — Black/)).toBeInTheDocument();
    expect(screen.getByText(/whatever colours print/)).toBeInTheDocument();
  });

  it('counts cylinders, which is what the flat method does charge for', () => {
    render(<RateCostingPanel costing={costing(flat)} line={LINE} />);

    /* Stations past the fifth carry a surcharge; the colours ticked never did. */
    expect(screen.getByText(/4 cylinders/)).toBeInTheDocument();
  });

  it('offers the picker when each colour is priced on its own', () => {
    show(perColour);

    expect(screen.getByText(/colours it prints/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a special colour/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /cyan/i })).toBeChecked();
  });

  it('keeps the works’ figures on show either way', () => {
    for (const settings of [flat, perColour]) {
      const { unmount } = show(settings);
      expect(screen.getByText(/8% wastage/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /change on costing/i })).toBeInTheDocument();
      unmount();
    }
  });
});
