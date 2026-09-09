import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CostingBreakdown, CreateQuotationFormValues, PricingBasis } from '@yuva/shared';
import { QuantityFields, type QuantityResult } from './QuantityFields';

/**
 * The one thing worth pinning here: **the boxes must state what the form
 * holds**.
 *
 * Switching kilograms to pouches swaps which two fields the row is bound to,
 * and the office reads a price off those boxes. When they disagreed with the
 * total beside them, the screen showed 100 pouches at Rs. 400 and Rs. 0 as the
 * amount — a quotation could be sent on a figure nobody typed.
 *
 * The cause was that react-hook-form's `register` is uncontrolled and React
 * had no reason to replace the input: same element, same position, new name.
 * Nothing about that is obvious from reading the component, which is why it is
 * tested rather than commented.
 *
 * The round-trip is the test that bites. jsdom re-registers more eagerly than
 * a browser does, so without the fix it blanks the box to 0 here where Chrome
 * left the kilograms standing — different symptom, same defect, and the
 * round-trip catches both. The first case below is the one that was actually
 * seen on screen; it is asserted because it is the behaviour that matters, not
 * because jsdom reproduces it.
 */

/** A host that owns the basis, as the wizard's job card does. */
function Host() {
  const [basis, setBasis] = useState<PricingBasis>('PER_KG');
  const { control, register } = useForm<CreateQuotationFormValues>({
    defaultValues: {
      items: [
        {
          quantities: [{ quantityKg: 0, ratePerKg: 0, quantityPouches: 0, ratePerPouch: 0 }],
        },
      ],
    } as CreateQuotationFormValues,
  });

  return (
    <QuantityFields
      control={control}
      register={register}
      itemIndex={0}
      pricingBasis={basis}
      onBasisChange={setBasis}
      results={[] as (QuantityResult | undefined)[]}
    />
  );
}

const quantityBox = () => screen.getByLabelText(/quantity 1/i) as HTMLInputElement;
const rateBox = () => screen.getByLabelText(/rate 1/i) as HTMLInputElement;
const switchTo = (label: 'Kilogram' | 'Pouches') =>
  fireEvent.click(screen.getByRole('button', { name: label }));

describe('QuantityFields', () => {
  it('does not carry the kilogram figures over into the pouch boxes', () => {
    render(<Host />);

    fireEvent.change(quantityBox(), { target: { value: '100' } });
    fireEvent.change(rateBox(), { target: { value: '400' } });

    switchTo('Pouches');

    /*
     * Nothing has been priced per pouch yet, so both boxes read as nothing —
     * empty or zero, depending on what the row was seeded with. Showing 100
     * and 400 is the bug: those are kilograms and rupees per kilogram, and the
     * total beside them would say Rs. 0.
     */
    expect(Number(quantityBox().value || 0)).toBe(0);
    expect(Number(rateBox().value || 0)).toBe(0);
  });

  it('gives the kilogram figures back on switching to them', () => {
    render(<Host />);

    fireEvent.change(quantityBox(), { target: { value: '100' } });
    fireEvent.change(rateBox(), { target: { value: '400' } });

    switchTo('Pouches');
    fireEvent.change(quantityBox(), { target: { value: '5000' } });
    fireEvent.change(rateBox(), { target: { value: '12' } });

    switchTo('Kilogram');

    // Both units are kept, so a customer who asks for the price the other way
    // round is answered without re-typing the first one.
    expect(quantityBox().value).toBe('100');
    expect(rateBox().value).toBe('400');

    switchTo('Pouches');
    expect(quantityBox().value).toBe('5000');
    expect(rateBox().value).toBe('12');
  });

  it('reports both units beside the amount', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 6.16,
        ratePerKg: 1623.38,
        totalPouches: 1000,
        totalAmount: 10000,
        costPerPouch: 10,
        marginPercent: 86.9,
        materialCostPerKg: 213.23,
      },
    ];

    function Row() {
      const { control, register } = useForm<CreateQuotationFormValues>({
        defaultValues: {
          items: [{ quantities: [{ quantityPouches: 1000, ratePerPouch: 10 }] }],
        } as CreateQuotationFormValues,
      });
      return (
        <QuantityFields
          control={control}
          register={register}
          itemIndex={0}
          pricingBasis="PER_POUCH"
          onBasisChange={() => {}}
          results={results}
        />
      );
    }

    render(<Row />);

    // The weight as well as the count: the film is ordered by weight however
    // the line is sold.
    expect(screen.getByText('6.16 kg')).toBeTruthy();
    expect(screen.getByText('1,000 pouches')).toBeTruthy();

    // The gross margin says which two figures made it, and what it leaves out.
    const gross = screen.getByText(/86\.9% gross/);
    expect(gross.getAttribute('title')).toContain('Rs. 1,623.38');
    expect(gross.getAttribute('title')).toContain('Rs. 213.23');
    expect(gross.getAttribute('title')).toContain('Film, ink and adhesive only');

    /*
     * And net is ABSENT rather than zero, because no costing was supplied.
     * Showing 0% would read as a job that earns nothing, which is a different
     * claim from "this line cannot be costed yet".
     */
    expect(screen.getByText('net —')).toBeTruthy();
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
        totalAmount: 40000,
        costPerPouch: 20,
        marginPercent: 50,
        materialCostPerKg: 200,
      },
    ];

    /* Materials are half the rate; everything is 92% of it. */
    const costing = {
      materialCostPerKg: 200,
      fullCostPerKg: 368,
      /* Its own rate too, or the row cannot tell whether the typed one is stale. */
      ratePerKg: 400,
      ratePerPiece: 20,
    } as CostingBreakdown;

    function Row() {
      const { control, register } = useForm<CreateQuotationFormValues>({
        defaultValues: {
          items: [{ quantities: [{ quantityKg: 100, ratePerKg: 400 }] }],
        } as CreateQuotationFormValues,
      });
      return (
        <QuantityFields
          control={control}
          register={register}
          itemIndex={0}
          pricingBasis="PER_KG"
          results={results}
          costings={[costing]}
        />
      );
    }

    render(<Row />);

    expect(screen.getByText('50.0% gross')).toBeTruthy();
    expect(screen.getByText('8.0% net')).toBeTruthy();

    // Net names the whole cost, so nobody has to guess what it left in.
    const net = screen.getByText('8.0% net');
    expect(net.getAttribute('title')).toContain('Rs. 368.00');
    expect(net.getAttribute('title')).toContain('setup');
  });

  it('leaves the pouch count off a roll', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 100,
        ratePerKg: 400,
        totalPouches: 0,
        totalAmount: 40000,
        costPerPouch: 0,
        marginPercent: 46.6,
        materialCostPerKg: 213.45,
      },
    ];

    function Roll() {
      const { control, register } = useForm<CreateQuotationFormValues>({
        defaultValues: {
          items: [{ quantities: [{ quantityKg: 100, ratePerKg: 400 }] }],
        } as CreateQuotationFormValues,
      });
      return (
        <QuantityFields
          control={control}
          register={register}
          itemIndex={0}
          pricingBasis="PER_KG"
          showsPouches={false}
          results={results}
        />
      );
    }

    render(<Roll />);

    expect(screen.getByText('100.00 kg')).toBeTruthy();
    // "0 pouches" reads as a count rather than as an absence.
    expect(screen.queryByText(/pouches$/)).toBeNull();
  });
});

describe('a rate that no longer matches the job', () => {
  /**
   * Changing the film under a filled-in rate must not overwrite a price
   * somebody decided on — and must not leave it there silently either. A rate
   * worked out for a 60µ poly stayed in the box after the ply was corrected to
   * 110µ, and the margin beside it went on measuring against a price that no
   * longer described the job.
   */
  const priced = (typedPerKg: number, costedPerKg: number) => {
    const results: QuantityResult[] = [
      {
        quantityKg: 100,
        ratePerKg: typedPerKg,
        totalPouches: 2000,
        totalAmount: typedPerKg * 100,
        costPerPouch: 0,
        marginPercent: 50,
        materialCostPerKg: 200,
      },
    ];
    const costing = {
      materialCostPerKg: 200,
      fullCostPerKg: 300,
      ratePerKg: costedPerKg,
      ratePerPiece: costedPerKg / 20,
    } as CostingBreakdown;

    function Row() {
      const { control, register } = useForm<CreateQuotationFormValues>({
        defaultValues: {
          items: [{ quantities: [{ quantityKg: 100, ratePerKg: typedPerKg }] }],
        } as CreateQuotationFormValues,
      });
      return (
        <QuantityFields
          control={control}
          register={register}
          itemIndex={0}
          pricingBasis="PER_KG"
          results={results}
          costings={[costing]}
        />
      );
    }
    render(<Row />);
  };

  it('says what it costs now when the two have drifted apart', () => {
    priced(330.55, 291.95);
    expect(screen.getByText(/Costs Rs\. 291\.95 a kg now/)).toBeTruthy();
  });

  it('stays quiet when they agree', () => {
    // Rounding is not drift; a rupee in a hundred is the threshold.
    priced(292.5, 291.95);
    expect(screen.queryByText(/Costs Rs/)).toBeNull();
  });

  it('says nothing at all when the line is not costed', () => {
    const results: QuantityResult[] = [
      {
        quantityKg: 100,
        ratePerKg: 330,
        totalPouches: 0,
        totalAmount: 33000,
        costPerPouch: 0,
        marginPercent: null,
        materialCostPerKg: null,
      },
    ];
    function Row() {
      const { control, register } = useForm<CreateQuotationFormValues>({
        defaultValues: {
          items: [{ quantities: [{ quantityKg: 100, ratePerKg: 330 }] }],
        } as CreateQuotationFormValues,
      });
      return (
        <QuantityFields
          control={control}
          register={register}
          itemIndex={0}
          pricingBasis="PER_KG"
          results={results}
        />
      );
    }
    render(<Row />);
    expect(screen.queryByText(/Costs Rs/)).toBeNull();
  });
});
