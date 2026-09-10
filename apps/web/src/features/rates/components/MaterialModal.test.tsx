import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Material } from '@yuva/shared';
import { MaterialModal } from './MaterialModal';

/**
 * **The figures a price is multiplied by have to be reachable.**
 *
 * The price list held only prices. A film's density — which is what turns a
 * micron into a weight, and so decides how many pouches come out of a kilogram
 * — was seeded once and then editable nowhere. W/O Poly, on every page of the
 * client's own workbook, could not be added at all without a database client.
 *
 * The other half is that a category is only shown the fields it can answer.
 * Density on an ink is a box nobody can fill in.
 */

const show = (material: Material | null) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MaterialModal open material={material} onClose={() => {}} />
    </QueryClientProvider>,
  );

const MATERIAL = (over: Partial<Material>): Material =>
  ({
    id: 'm1',
    name: 'PET 12µm',
    category: 'FILM',
    unit: 'KG',
    density: 1.4,
    solidsPercent: null,
    laydownGsm: null,
    inkKind: null,
    isActive: true,
    sortOrder: 10,
    currentRate: 185,
    previousRate: null,
    changePercent: null,
    ...over,
  }) as Material;

describe('MaterialModal', () => {
  it('offers density on a film, and fills it from the material', () => {
    show(MATERIAL({}));

    const density = screen.getByLabelText(/density/i) as HTMLInputElement;
    expect(density.value).toBe('1.4');
    /* The two an ink is costed on mean nothing for a film. */
    expect(screen.queryByLabelText(/solids/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/laydown/i)).not.toBeInTheDocument();
  });

  it('offers solids and laydown on an ink, and no density', () => {
    show(
      MATERIAL({
        name: 'Ink — Cyan',
        category: 'INK',
        density: null,
        solidsPercent: 19.5,
        laydownGsm: 0.14,
      }),
    );

    expect((screen.getByLabelText(/solids/i) as HTMLInputElement).value).toBe('19.5');
    expect((screen.getByLabelText(/laydown/i) as HTMLInputElement).value).toBe('0.14');
    expect(screen.queryByLabelText(/density/i)).not.toBeInTheDocument();
  });

  it('follows the kind while a new material is being described', () => {
    show(null);

    /* Starts on film, so density is the question. */
    expect(screen.getByLabelText(/density/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'INK' } });

    expect(screen.queryByLabelText(/density/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/laydown/i)).toBeInTheDocument();
  });

  /*
   * Moving a priced film into Ink would strip the density it is costed on, and
   * every quotation that used it would silently start weighing its pouches off
   * a stand-in instead.
   */
  it('settles the kind when the material is created, not after', () => {
    show(MATERIAL({}));
    expect(screen.getByLabelText(/kind/i)).toBeDisabled();
  });

  it('lets a new material choose its kind', () => {
    show(null);
    expect(screen.getByLabelText(/kind/i)).not.toBeDisabled();
  });
});
