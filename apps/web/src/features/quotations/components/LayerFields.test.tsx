import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CreateQuotationFormValues } from '@yuva/shared';
import { LayerFields } from './LayerFields';

/**
 * The gauge is typed, and a gauge off the price list has to be priced.
 *
 * The rates master prices a film at the gauge it is stocked in — `PET 12µm` and
 * `PET 19µm` are two materials at two prices. Quote a 20µ PET and neither rate
 * applies, so the row has to ask rather than cost the ply at whichever price
 * happens to be on file. Costing it silently is the failure this guards: it
 * produces a confident, wrong margin that nothing on screen contradicts.
 */

const FILMS = [
  { id: 'pet12', name: 'PET 12µm', density: 1.4, currentRate: 210 },
  { id: 'pet19', name: 'PET 19µm', density: 1.4, currentRate: 218 },
  { id: 'pe50', name: 'PE 50µm', density: 0.92, currentRate: 185 },
  // Specified by GSM, so its name states no gauge and its rate applies at any
  // thickness the office types.
  { id: 'ppw', name: 'PP Woven', density: null, currentRate: 150 },
];

function Host({ layers }: { layers?: unknown[] }) {
  const { control, register, setValue } = useForm<CreateQuotationFormValues>({
    defaultValues: {
      items: [
        {
          layers: layers ?? [
            { materialId: null, micron: 12, rateOverride: '' },
            { materialId: null, micron: 50, rateOverride: '' },
          ],
        },
      ],
    } as CreateQuotationFormValues,
  });
  return (
    <LayerFields
      control={control}
      register={register}
      setValue={setValue}
      itemIndex={0}
      films={FILMS}
    />
  );
}

const micronBox = (n = 0) =>
  document.getElementById(`items.0.layers.${n}.micron`) as HTMLInputElement;
const rateBox = (n = 0) =>
  document.getElementById(`items.0.layers.${n}.rateOverride`) as HTMLInputElement | null;
const filmSelect = (n = 0) =>
  document.getElementById(`items.0.layers.${n}.materialId`) as HTMLSelectElement;

describe('LayerFields', () => {
  it('asks for the micron on every ply, chosen film or not', () => {
    render(<Host />);
    // It used to appear only for a film whose name stated no gauge, which made
    // an unstocked gauge impossible to quote without a developer.
    expect(micronBox(0)).toBeTruthy();
    expect(micronBox(1)).toBeTruthy();
  });

  it('fills the micron in from the film that was picked', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet19' } });
    expect(micronBox(0).value).toBe('19');
  });

  it('does not ask for a rate at the gauge the film is stocked at', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet12' } });
    expect(rateBox(0)).toBeNull();
    expect(screen.getByText(/210\.00/)).toBeTruthy();
  });

  it('asks for a rate once a gauge off the price list is typed', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet12' } });
    fireEvent.change(micronBox(0), { target: { value: '20' } });

    expect(rateBox(0)).toBeTruthy();
    // And says which gauge the film IS priced at, so it is obvious that a 20
    // was typed where the list holds a 12 — rather than reading as an unpriced
    // film.
    expect(screen.getByText(/PET 12µm is priced at 12µ/)).toBeTruthy();
  });

  it('stops asking when the gauge is put back', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet12' } });
    fireEvent.change(micronBox(0), { target: { value: '20' } });
    expect(rateBox(0)).toBeTruthy();

    fireEvent.change(micronBox(0), { target: { value: '12' } });
    expect(rateBox(0)).toBeNull();
  });

  it('does not ask while the box is empty mid-edit', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet12' } });
    fireEvent.change(micronBox(0), { target: { value: '' } });
    // Asking for a rate the moment a digit is deleted makes the row flicker.
    expect(rateBox(0)).toBeNull();
  });

  it('never asks for a film whose name states no gauge', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'ppw' } });
    fireEvent.change(micronBox(0), { target: { value: '90' } });
    // PP Woven is priced by GSM, so its rate applies at any thickness.
    expect(rateBox(0)).toBeNull();
  });

  it('clears a typed rate when the film is swapped', () => {
    render(<Host />);
    fireEvent.change(filmSelect(0), { target: { value: 'pet12' } });
    fireEvent.change(micronBox(0), { target: { value: '20' } });
    fireEvent.change(rateBox(0)!, { target: { value: '245' } });

    fireEvent.change(filmSelect(0), { target: { value: 'pe50' } });
    fireEvent.change(micronBox(0), { target: { value: '20' } });

    // 245 was the price of a 20µ PET. Carrying it onto a polythene ply would
    // cost that ply at a rate nobody entered for it.
    expect(rateBox(0)?.value).toBe('');
  });
});
