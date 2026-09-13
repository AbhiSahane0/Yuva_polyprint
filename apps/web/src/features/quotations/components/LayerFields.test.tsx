import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CreateQuotationFormValues } from '@yuva/shared';
import { LayerFields } from './LayerFields';

/**
 * The film and the gauge are two questions, asked once each.
 *
 * The dropdown offers families — PET, PE — and the gauge is typed beside it.
 * The rates master holds `PET 12µm` and `PET 19µm` separately because they are
 * bought at separate prices, but they are one film at the machine, and listing
 * both asked the same question twice.
 *
 * Family plus gauge names a stocked film and uses its rate. Only a gauge the
 * master does not stock has no price to find, and that is the one case the row
 * asks about — costing it silently at the neighbouring gauge's price is the
 * failure guarded here, because it produces a confident wrong margin that
 * nothing on screen contradicts.
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
/** Picking a family, which is what the dropdown now holds. */
const pick = (family: string, n = 0) =>
  fireEvent.change(filmSelect(n), { target: { value: family } });
const type = (micron: string, n = 0) =>
  fireEvent.change(micronBox(n), { target: { value: micron } });

describe('LayerFields', () => {
  it('asks for the micron on every ply, chosen film or not', () => {
    render(<Host />);
    // It used to appear only for a film whose name stated no gauge, which made
    // an unstocked gauge impossible to quote without a developer.
    expect(micronBox(0)).toBeTruthy();
    expect(micronBox(1)).toBeTruthy();
  });

  it('fills the micron in from the family when the box is empty', () => {
    render(<Host layers={[{ materialId: null, micron: '', rateOverride: '' }, {}]} />);
    pick('PET');
    // The thinnest PET on the list, as a starting point.
    expect(micronBox(0).value).toBe('12');
  });

  it('does not overwrite a gauge already typed', () => {
    render(<Host />);
    type('19');
    pick('PET');
    // Overwriting would undo the office's own figure the moment they corrected
    // the film beside it.
    expect(micronBox(0).value).toBe('19');
  });

  it('lists families, not one row per stocked gauge', () => {
    render(<Host />);
    const options = [...filmSelect(0).options].map((o) => o.text.trim());
    expect(options).toContain('PET');
    expect(options).not.toContain('PET 12µm');
    expect(options).not.toContain('PET 19µm');
    // PET and PE each appeared twice before, once per gauge.
    expect(options.filter((o) => o === 'PET')).toHaveLength(1);
  });

  /*
   * **A film's price is agreed job to job.**
   *
   * The works' own quotations carry PET at 185, 175 and 190 — every one at 12µ,
   * every one written on 23 March 2022. The box used to appear only for a gauge
   * the rates master does not stock, which covered the other reason to type a
   * rate and missed this one completely: a rate agreed at the film's own gauge
   * was stored and then invisible, so reopening the quotation and pressing Save
   * replaced what was charged with the catalogue price.
   */
  it('offers a rate on a film stocked at the gauge typed, and shows the list price', () => {
    render(<Host />);
    pick('PET');
    type('19');
    // PET 19µm is a real material at Rs. 218 — offered as the placeholder, so
    // leaving the box alone follows the list.
    expect(rateBox(0)).toBeTruthy();
    expect(rateBox(0)!.placeholder).toBe('218.00');
    expect(screen.getByText(/218\.00/)).toBeTruthy();
  });

  it('calls it the rate for this job at the stocked gauge', () => {
    render(<Host />);
    pick('PET');
    expect(rateBox(0)).toBeTruthy();
    expect(screen.getByText('Rate for this job')).toBeTruthy();
    expect(screen.queryByText('Rate for this gauge')).toBeNull();
    expect(screen.getByText(/210\.00/)).toBeTruthy();
  });

  it('asks for a rate once a gauge off the price list is typed', () => {
    render(<Host />);
    pick('PET');
    type('20');

    expect(rateBox(0)).toBeTruthy();
    /*
     * And names the nearest gauge the master does stock, so it is obvious that
     * a 20 was typed against a list holding 12 and 19 — rather than reading as
     * an unpriced film. The nearest is also the ply's density carrier: density
     * is a property of the polymer, not the gauge, so any PET answers for it.
     */
    expect(screen.getByText(/PET 19µm is priced at 19µ/)).toBeTruthy();
  });

  it('changes what it calls the box when the gauge goes off the list and back', () => {
    render(<Host />);
    pick('PET');
    type('20');
    // Off the list the film's own rate cannot apply, so the box is the only
    // price there is — and the label says which gauge it is for.
    expect(screen.getByText('Rate for this gauge')).toBeTruthy();

    type('12');
    expect(screen.getByText('Rate for this job')).toBeTruthy();
    expect(screen.queryByText('Rate for this gauge')).toBeNull();
  });

  it('offers a rate for a film whose name states no gauge', () => {
    render(<Host />);
    pick('PP Woven');
    type('90');
    // PP Woven is priced by GSM, so its rate applies at any thickness — but the
    // works may still have agreed a different price for this job.
    expect(rateBox(0)).toBeTruthy();
    expect(screen.getByText('Rate for this job')).toBeTruthy();
  });

  it('offers nothing until a film is chosen', () => {
    render(<Host layers={[{ materialId: null, micron: '', rateOverride: '' }, {}]} />);
    // A rate for a film nobody has picked is a box with no question behind it.
    expect(rateBox(0)).toBeNull();
  });

  it('clears a typed rate when the film is swapped', () => {
    render(<Host />);
    pick('PET');
    type('20');
    fireEvent.change(rateBox(0)!, { target: { value: '245' } });

    pick('PE');
    type('20');

    // 245 was the price of a 20µ PET. Carrying it onto a polythene ply would
    // cost that ply at a rate nobody entered for it.
    expect(rateBox(0)?.value).toBe('');
  });
});
