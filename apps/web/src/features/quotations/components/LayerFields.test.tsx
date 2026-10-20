import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CreateQuotationFormValues } from '@yuva/shared';
import { LayerFields } from './LayerFields';

/**
 * The film and the gauge are two questions, asked once each.
 *
 * The dropdown offers families — PET, PE — and the gauge is typed beside it.
 *
 * **A film has one rate and it applies at every gauge.** The works pays near
 * enough the same for a kilogram of PET whether the reel is 12 micron or 15, so
 * it keeps one PET rate rather than one per thickness. The gauge decides how
 * many metres that kilogram covers, never what the kilogram costs.
 *
 * The failure guarded here is the one that came of reading the master the other
 * way: a ply quoted at a gauge no row named was refused a price, so an ordinary
 * 50µ sealant left the whole line uncostable and the margin reading as a dash
 * until somebody typed a figure to make the screen work again.
 */

const FILMS = [
  { id: 'pet12', name: 'PET 12µm', density: 1.4, usualMicron: 12, currentRate: 210 },
  { id: 'pet19', name: 'PET 19µm', density: 1.4, usualMicron: 19, currentRate: 218 },
  // One row, at 12µ, and the works laminates it at 50 — which is the structure
  // the bug below was reported on.
  { id: 'met12', name: 'MET PET 12µm', density: 1.4, usualMicron: 12, currentRate: 180 },
  { id: 'pe50', name: 'PE 50µm', density: 0.92, usualMicron: 50, currentRate: 185 },
  // Specified by GSM, so its name states no gauge and nobody has recorded one
  // against it either. The form must ask rather than guess.
  { id: 'ppw', name: 'PP Woven', density: null, usualMicron: null, currentRate: 150 },
  // An LDPE grade: blown to whatever gauge the job asks for, so no gauge in
  // the name. This one the works has recorded, at the 50µ it actually buys.
  {
    id: 'nat5',
    name: 'LDPE Natural 5 KG (NAT-5KG)',
    density: 0.92,
    usualMicron: 50,
    currentRate: 180,
  },
  {
    id: 'shr3',
    name: 'LDPE 3-Layer Shrink (SHR-3L)',
    density: 0.92,
    usualMicron: null,
    currentRate: 191,
  },
  { id: 'bopp20', name: 'BOPP 20µm', density: 0.91, usualMicron: 20, currentRate: 200 },
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
const typeRate = (rate: string, n = 0) =>
  fireEvent.change(rateBox(n)!, { target: { value: rate } });
/** The whole row as somebody reads it, so a sentence split across spans matches. */
const onScreen = () => document.body.textContent ?? '';

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
   * every one written on 23 March 2022. So the rate is asked on every ply, and
   * it is asked by being filled in rather than hinted at: a greyed placeholder
   * reads as an empty field, and an empty field beside the word "rate" is the
   * one thing on the row that looks like it still needs doing.
   */
  it('fills the rate box with the film’s own rate, and names it as the list', () => {
    render(<Host />);
    pick('PET');
    expect(rateBox(0)?.value).toBe('210');
    expect(onScreen()).toContain('List Rs. 210.00');
  });

  it('calls it the rate for this job, whatever the gauge', () => {
    render(<Host />);
    pick('PET');
    type('50');
    expect(screen.getByText('Rate for this job')).toBeTruthy();
    expect(screen.queryByText('Rate for this gauge')).toBeNull();
  });

  it('costs a gauge the master does not stock instead of refusing to', () => {
    render(<Host />);
    pick('MET PET');
    type('50');

    /*
     * The bug this replaces: the master holds one MET PET row, at 12µ, and 50µ
     * is an ordinary sealant. The row used to answer "MET PET 12µm is priced at
     * 12µ — Rs. 180.00/kg" with an empty box, and the line stayed uncostable
     * until a figure was invented.
     */
    expect(rateBox(0)?.value).toBe('180');
    expect(onScreen()).not.toContain('is priced at');
  });

  it('follows the other row’s rate when the gauge moves the ply onto it', () => {
    render(<Host />);
    pick('PET');
    expect(rateBox(0)?.value).toBe('210');

    type('19');
    // The box held PET 12µm's rate untouched, so it was this form's figure
    // rather than anybody's, and PET 19µm's own rate replaces it.
    expect(rateBox(0)?.value).toBe('218');
  });

  it('keeps a rate the office typed when the gauge is corrected', () => {
    render(<Host />);
    pick('PET');
    typeRate('245');
    type('19');
    // 245 is theirs. A corrected micron is not a reason to throw it away, and
    // wiping it is what the row used to do on every keystroke in that box.
    expect(rateBox(0)?.value).toBe('245');
  });

  it('says how far this job is from the list when the two differ', () => {
    render(<Host />);
    pick('PET');
    typeRate('190');
    /*
     * Once the box is filled and editable, nothing else on the screen would
     * catch a digit dropped in it — 190 where 210 was meant is a plausible
     * number. So the column stops repeating the rate and reports the distance.
     */
    expect(onScreen()).toContain('List Rs. 210.00');
    expect(onScreen()).toContain('Rs. 20.00 below');
  });

  /*
   * **A gauge nobody knows is asked for, not guessed.**
   *
   * A film whose name states no gauge used to start at 12µ, so the row would
   * validate. Fifteen of the eighteen films the works buys are in that state —
   * every LDPE grade, Nylon, PP — and on a sealant that runs at 50, quoting 12
   * puts a third of the laminate into the costing at a quarter of its weight,
   * with nothing on the screen to say so. The works records the thickness
   * against the film instead, and the box starts there.
   */
  it('starts a film at the thickness the works records against it', () => {
    render(<Host layers={[{ materialId: null, micron: 0, rateOverride: '' }, {}]} />);
    pick('LDPE Natural 5 KG (NAT-5KG)');
    expect(micronBox(0).value).toBe('50');
    expect(rateBox(0)?.value).toBe('180');
  });

  it('leaves the box empty when nothing knows the gauge', () => {
    render(<Host layers={[{ materialId: null, micron: '', rateOverride: '' }, {}]} />);
    pick('PP Woven');
    expect(micronBox(0).value).toBe('');
  });

  it('keeps a gauge already typed when a film with no gauge is chosen', () => {
    render(<Host />);
    type('60', 1);
    pick('LDPE Natural 5 KG (NAT-5KG)', 1);
    expect(micronBox(1).value).toBe('60');
  });

  /*
   * The second pick. BOPP fills in its 20, and swapping it for a grade nobody
   * has recorded left the grade reading 20 — a figure nobody typed, kept as if
   * they had. It is cleared now rather than replaced with a guess.
   */
  it('clears the previous film’s filled-in gauge when an unrecorded grade replaces it', () => {
    render(<Host layers={[{ materialId: null, micron: 0, rateOverride: '' }, {}]} />);
    pick('BOPP');
    expect(micronBox(0).value).toBe('20');
    pick('LDPE 3-Layer Shrink (SHR-3L)');
    expect(micronBox(0).value).toBe('');
  });

  it('carries one recorded grade’s thickness to the next', () => {
    render(<Host layers={[{ materialId: null, micron: 0, rateOverride: '' }, {}]} />);
    pick('LDPE 3-Layer Shrink (SHR-3L)');
    expect(micronBox(0).value).toBe('');
    pick('LDPE Natural 5 KG (NAT-5KG)');
    expect(micronBox(0).value).toBe('50');
  });

  /*
   * The rule that keeps a recorded thickness a DEFAULT. It fills an empty box
   * and stops there; a figure the office typed survives a change of film, even
   * when the new film has a thickness of its own on record.
   */
  it('never overwrites a typed gauge with the one recorded against the film', () => {
    render(<Host layers={[{ materialId: null, micron: 0, rateOverride: '' }, {}]} />);
    type('72');
    pick('LDPE Natural 5 KG (NAT-5KG)');
    expect(micronBox(0).value).toBe('72');
  });

  it('keeps a gauge typed against one LDPE grade when switching to another', () => {
    render(<Host layers={[{ materialId: null, micron: 0, rateOverride: '' }, {}]} />);
    pick('LDPE Natural 5 KG (NAT-5KG)');
    type('60');
    pick('LDPE 3-Layer Shrink (SHR-3L)');
    expect(micronBox(0).value).toBe('60');
  });

  it('offers a rate for a film whose name states no gauge', () => {
    render(<Host />);
    pick('PP Woven');
    type('90');
    // PP Woven is priced by GSM, so its rate applies at any thickness — but the
    // works may still have agreed a different price for this job.
    expect(rateBox(0)?.value).toBe('150');
    expect(screen.getByText('Rate for this job')).toBeTruthy();
  });

  it('offers nothing until a film is chosen', () => {
    render(<Host layers={[{ materialId: null, micron: '', rateOverride: '' }, {}]} />);
    // A rate for a film nobody has picked is a box with no question behind it.
    expect(rateBox(0)).toBeNull();
  });

  it('replaces a typed rate with the new film’s when the film is swapped', () => {
    render(<Host />);
    pick('PET');
    typeRate('245');

    pick('PE');

    // 245 was the price of a PET. Carrying it onto a polythene ply would cost
    // that ply at a rate nobody entered for it.
    expect(rateBox(0)?.value).toBe('185');
  });
});
