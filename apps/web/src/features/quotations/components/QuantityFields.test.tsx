import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CostingBreakdown, CreateQuotationFormValues } from '@yuva/shared';
import { QuantityFields, type QuantityResult } from './QuantityFields';

/**
 * **One typed pair, in kilograms, and the pouch figures worked out from it.**
 *
 * There used to be a Kilogram / Pouches switch, and it decided which two
 * fields the row was BOUND to — so whichever unit was picked, the other was
 * off screen. It also carried a real defect: `register` is uncontrolled and
 * React had no reason to replace the input across the switch (same element,
 * same position, new name), so the box went on showing the kilograms that were
 * typed while the form read and wrote the pouch fields underneath. 100 pouches
 * at Rs. 400 with Rs. 0 as the amount, and a quotation could be sent on a
 * figure nobody typed.
 *
 * That whole class of bug is gone with the switch. The two units are now two
 * boxes side by side — `500 kg = 21,565 pouches` — each always visible, each
 * typeable, and the kilograms are the field the form actually holds. The tests
 * below pin what replaced it: that typing pouches fills the kilograms in, that
 * the count follows the weight, and that neither is offered as a control that
 * cannot answer while the laminate has no density.
 */

const kgBox = () => screen.getByLabelText('Quantity 1') as HTMLInputElement;
const pouchBox = () => screen.getByLabelText(/quantity 1 in pouches/i) as HTMLInputElement;
const rateBox = () => screen.getByLabelText('Rate 1') as HTMLInputElement;
const rateEachBox = () => screen.getByLabelText(/rate 1 per pouch/i) as HTMLInputElement;

/** A row bound to one quantity, as the wizard's job card renders it. */
function Row({
  results = [],
  costings,
  pouchesPerKg,
  showsPouches,
  startKg = 0,
  startRate = 0,
}: {
  results?: (QuantityResult | undefined)[];
  costings?: (CostingBreakdown | null)[];
  pouchesPerKg?: number;
  showsPouches?: boolean;
  startKg?: number;
  startRate?: number;
}) {
  const { control, register, setValue } = useForm<CreateQuotationFormValues>({
    defaultValues: {
      items: [
        {
          quantities: [
            { quantityKg: startKg, ratePerKg: startRate, quantityPouches: 0, ratePerPouch: 0 },
          ],
        },
      ],
    } as CreateQuotationFormValues,
  });

  return (
    <QuantityFields
      control={control}
      register={register}
      setValue={setValue}
      itemIndex={0}
      results={results}
      {...(costings ? { costings } : {})}
      {...(pouchesPerKg === undefined ? {} : { pouchesPerKg })}
      {...(showsPouches === undefined ? {} : { showsPouches })}
    />
  );
}

describe('QuantityFields', () => {
  it('offers no unit switch — both units are boxes, side by side', () => {
    render(<Row pouchesPerKg={43.13} />);

    expect(screen.queryByRole('button', { name: 'Pouches' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kilogram' })).toBeNull();

    /* Both are typeable, and each says its unit under it — no mode to remember. */
    expect(kgBox()).toBeTruthy();
    expect(pouchBox()).toBeTruthy();
    expect(rateBox()).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText('pouches')).toBeTruthy();
    expect(screen.getByText('per kg')).toBeTruthy();
  });

  it('fills the kilograms in when the order arrives as a number of pouches', () => {
    render(<Row pouchesPerKg={43.13} />);

    fireEvent.change(pouchBox(), { target: { value: '1000' } });

    // 1000 ÷ 43.13, to the gram.
    expect(kgBox().value).toBe('23.186');
    expect(pouchBox().value).toBe('1000');
  });

  it('shows the pouch count that the kilograms come to', () => {
    render(<Row pouchesPerKg={43.13} startKg={500} />);

    // 500 × 43.13, as a whole number of pouches.
    expect(pouchBox().value).toBe('21565');
  });

  /*
   * Nothing to convert with, so the box would be a control that cannot answer.
   * Disabled rather than absent: the row should not change shape as films are
   * chosen, and the label says what it is waiting for.
   */
  it('disables the pouch box until the laminate has a weight', () => {
    render(<Row pouchesPerKg={0} />);
    expect(pouchBox().disabled).toBe(true);
  });

  it('shows the rate each beside the rate per kilogram', () => {
    render(<Row pouchesPerKg={43.13} startKg={500} startRate={281.24} />);

    // 281.24 ÷ 43.13, to four places — half a paisa is negotiable on a pouch.
    expect(rateEachBox().value).toBe('6.5208');
  });

  it('fills the rate per kilogram in when the haggling is done per pouch', () => {
    render(<Row pouchesPerKg={43.13} startKg={500} startRate={281.24} />);

    fireEvent.change(rateEachBox(), { target: { value: '6.5' } });

    // 6.50 × 43.13 — the per-kilogram figure that lands on a round rate each.
    expect(rateBox().value).toBe('280.345');
    expect(rateEachBox().value).toBe('6.5');
  });

  it('reads the kilograms back as pouches, and totals what that comes to', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 500,
        ratePerKg: 281.24,
        totalPouches: 21_565,
        totalAmount: 140_621,
        costPerPouch: 6.52,
        marginPercent: 21.3,
        materialCostPerKg: 221.34,
      },
    ];

    render(<Row results={results} pouchesPerKg={43.13} startKg={500} />);

    expect(pouchBox().value).toBe('21565');

    // The total is the figure that goes on the document, and the count with its
    // weight is the working behind the pouch boxes.
    expect(screen.getByText('Rs. 1,40,621')).toBeTruthy();
    expect(screen.getByText(/21,565 pouches at 23\.19 g each/)).toBeTruthy();
  });

  /*
   * Zeroes would read as a costed answer. Until every ply has a film there is
   * no density, so there is no weight per pouch and therefore no count and no
   * rate each — which is a different statement from "nought".
   */
  it('says what is missing rather than showing a zero rate each', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 500,
        ratePerKg: 0,
        totalPouches: 0,
        totalAmount: 0,
        costPerPouch: 0,
        marginPercent: null,
        materialCostPerKg: null,
      },
    ];

    render(<Row results={results} pouchesPerKg={0} />);

    expect(screen.getByText(/the pouch boxes need a film on every ply/i)).toBeTruthy();
    // Both halves of both pairs are there, and both are dead until a film is.
    expect(pouchBox().disabled).toBe(true);
    expect(rateEachBox().disabled).toBe(true);
  });

  it('keeps the total on a roll but offers no pouch box or pouch figures', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 100,
        ratePerKg: 400,
        totalPouches: 0,
        totalAmount: 40_000,
        costPerPouch: 0,
        marginPercent: 46.6,
        materialCostPerKg: 213.45,
      },
    ];

    render(<Row results={results} pouchesPerKg={0} showsPouches={false} startKg={100} />);

    expect(kgBox().value).toBe('100');
    // Money belongs in one place whether or not the job has pouches in it.
    expect(screen.getByText('Rs. 40,000')).toBeTruthy();
    // A reel has no pouches, so no box, no rate each — and no complaint about
    // a missing film, because nothing here was ever going to be counted.
    expect(screen.queryByLabelText(/in pouches/i)).toBeNull();
    expect(screen.queryByLabelText(/per pouch/i)).toBeNull();
    expect(screen.queryByText(/the pouch boxes need a film/i)).toBeNull();
  });

  it('reports gross and net side by side once the line can be costed', () => {
    /*
     * The pair exists because one figure was the flattering one. Margin over
     * materials leaves out the wages, the power, the transport, the packing
     * and the press setup — on a real quotation it read 41.9% where the job
     * earned 8%.
     */
    const results: QuantityResult[] = [
      {
        quantityKg: 100,
        ratePerKg: 400,
        totalPouches: 2000,
        totalAmount: 40_000,
        costPerPouch: 20,
        marginPercent: 50,
        materialCostPerKg: 200,
      },
    ];

    /* Materials are half the rate; everything is 92% of it. */
    const costing = { materialCostPerKg: 200, fullCostPerKg: 368 } as CostingBreakdown;

    render(<Row results={results} costings={[costing]} pouchesPerKg={20} />);

    expect(screen.getByText('50.0% gross')).toBeTruthy();
    expect(screen.getByText('8.0% net')).toBeTruthy();

    // Net names the whole cost, so nobody has to guess what it left in.
    const net = screen.getByText('8.0% net');
    expect(net.getAttribute('title')).toContain('Rs. 368.00');
    expect(net.getAttribute('title')).toContain('setup');
  });

  /*
   * No costing supplied, so net is ABSENT rather than zero: 0% would read as a
   * job that earns nothing, which is a different claim from "not costable yet".
   */
  it('leaves net out rather than reading zero when the line cannot be costed', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 6.16,
        ratePerKg: 1623.38,
        totalPouches: 1000,
        totalAmount: 10_000,
        costPerPouch: 10,
        marginPercent: 86.9,
        materialCostPerKg: 213.23,
      },
    ];

    render(<Row results={results} pouchesPerKg={162.34} />);

    const gross = screen.getByText(/86\.9% gross/);
    expect(gross.getAttribute('title')).toContain('Rs. 1,623.38');
    expect(gross.getAttribute('title')).toContain('Film, ink and adhesive only');
    expect(screen.getByText('net —')).toBeTruthy();
  });
});
