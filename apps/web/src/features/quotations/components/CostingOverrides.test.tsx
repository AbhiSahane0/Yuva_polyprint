import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CreateQuotationFormValues, PouchType } from '@yuva/shared';
import { CostingOverrides, strippedCosting, type CostingMasters } from './CostingOverrides';

/**
 * Four figures the works rarely varies, folded away until asked for.
 *
 * They were four empty boxes at the top of the jobs step on every quotation,
 * above the job the office had actually come to price. The rule that makes the
 * fold safe is the one pinned hardest here: **opening the section, reading the
 * figures and closing it again must leave no trace.** The boxes now arrive
 * filled in, so without stripping, a quotation whose costing was so much as
 * glanced at would be frozen against a Costing screen it never meant to leave.
 */

const MASTERS: CostingMasters = {
  marginPercent: 9,
  transportPerKg: 6.8,
  defaultWastagePercent: 8,
  pouchWastagePercent: 7,
};

/** A standup is in the pouch workbook, at 7%; a reel is not, at 8%. */
const STANDUP: PouchType = 'STANDUP';

function Host({
  defaults,
  pouchTypes = [STANDUP],
}: {
  defaults?: Partial<CreateQuotationFormValues>;
  pouchTypes?: (PouchType | null)[];
}) {
  const { control, register, setValue, watch } = useForm<CreateQuotationFormValues>({
    defaultValues: {
      marginPercent: '',
      transportPerKg: '',
      pouchMakingPerKg: '',
      wastagePercent: '',
      ...defaults,
    } as CreateQuotationFormValues,
  });
  void control;
  return (
    <CostingOverrides
      register={register}
      setValue={setValue}
      values={{
        marginPercent: watch('marginPercent'),
        transportPerKg: watch('transportPerKg'),
        pouchMakingPerKg: watch('pouchMakingPerKg'),
        wastagePercent: watch('wastagePercent'),
      }}
      masters={MASTERS}
      pouchTypes={pouchTypes}
    />
  );
}

const box = (id: string) => document.getElementById(id) as HTMLInputElement | null;
const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement;
const onScreen = () => document.body.textContent ?? '';

describe('CostingOverrides', () => {
  it('shows no boxes until the checkbox is ticked', () => {
    render(<Host />);
    expect(box('marginPercent')).toBeNull();
    expect(box('transportPerKg')).toBeNull();
    expect(box('pouchMakingPerKg')).toBeNull();
    expect(box('wastagePercent')).toBeNull();
    expect(checkbox().checked).toBe(false);
  });

  it('says what the quotation is priced at while they are away', () => {
    // Folding them away must not mean the office cannot see the figures — that
    // would be worse than the boxes. One line, and it is the works' own.
    render(<Host />);
    expect(onScreen()).toContain('Margin 9%');
    expect(onScreen()).toContain('Transport Rs. 6.80/kg');
    expect(onScreen()).toContain('Wastage 7%');
  });

  it('opens the boxes filled in with the works’ own figures', () => {
    render(<Host />);
    fireEvent.click(checkbox());
    expect(box('marginPercent')?.value).toBe('9');
    expect(box('transportPerKg')?.value).toBe('6.8');
    // A standup is in the pouch workbook, which runs at 7 rather than 8.
    expect(box('wastagePercent')?.value).toBe('7');
  });

  it('leaves pouch making empty, because there is no one figure to fill it with', () => {
    /*
     * The works charges making PER POUCH, and the same charge reads between
     * Rs 11 and Rs 64 a kilogram across its own nine costed pouches depending
     * on nothing but how big the pouch is. A per-kilogram figure exists only
     * once a job has a size, and this box sits above all the jobs.
     */
    render(<Host />);
    fireEvent.click(checkbox());
    expect(box('pouchMakingPerKg')?.value).toBe('');
    expect(box('pouchMakingPerKg')?.placeholder).toBe('by style');
  });

  it('cannot offer a wastage when the jobs disagree about it', () => {
    // Which of the two applies is decided by the STYLE, job by job. A single
    // figure across a mixed document would be wrong for half of it.
    render(<Host pouchTypes={[STANDUP, null]} />);
    fireEvent.click(checkbox());
    expect(box('wastagePercent')?.value).toBe('');
    expect(box('wastagePercent')?.placeholder).toBe('by job kind');
  });

  it('does not overwrite a figure that is already there', () => {
    render(<Host defaults={{ marginPercent: '15' } as Partial<CreateQuotationFormValues>} />);
    // A saved quotation that overrode something opens showing it, rather than
    // hiding a number this document is actually priced at.
    expect(checkbox().checked).toBe(true);
    expect(box('marginPercent')?.value).toBe('15');
  });

  it('clears all four when the checkbox is unticked', () => {
    render(<Host />);
    fireEvent.click(checkbox());
    fireEvent.change(box('marginPercent')!, { target: { value: '15' } });

    fireEvent.click(checkbox());
    // Unticking is how an override is taken back, so it has to undo the typing
    // as well as the opening — otherwise 15 would price the document invisibly.
    expect(box('marginPercent')).toBeNull();
    expect(onScreen()).toContain('Margin 9%');
  });
});

describe('strippedCosting', () => {
  it('unsets anything still equal to the works’ own figure', () => {
    const out = strippedCosting(
      { marginPercent: '9', transportPerKg: '6.8', wastagePercent: '7' },
      MASTERS,
      [STANDUP],
    );
    expect(out).toEqual({
      marginPercent: '',
      transportPerKg: '',
      pouchMakingPerKg: '',
      wastagePercent: '',
    });
  });

  it('keeps a figure the office actually changed', () => {
    const out = strippedCosting({ marginPercent: '15', transportPerKg: '6.8' }, MASTERS, [STANDUP]);
    expect(out.marginPercent).toBe('15');
    expect(out.transportPerKg).toBe('');
  });

  it('reads 9 and "9.0" as the same answer', () => {
    // The box is a text input and the office may type either.
    expect(strippedCosting({ marginPercent: '9.0' }, MASTERS, [STANDUP]).marginPercent).toBe('');
  });

  it('keeps a zero, which is a real instruction', () => {
    // Nothing charged for pouch making is exactly what the works' two quotations
    // sold as reels say, and zero is not the same as "follow the style".
    expect(strippedCosting({ pouchMakingPerKg: '0' }, MASTERS, [STANDUP]).pouchMakingPerKg).toBe(
      '0',
    );
  });

  it('keeps a wastage the office set on a document its jobs disagree about', () => {
    // No master figure to compare against, so nothing can be stripped as equal
    // to it — which is right: they typed it because nothing else would do.
    expect(strippedCosting({ wastagePercent: '7' }, MASTERS, [STANDUP, null]).wastagePercent).toBe(
      '7',
    );
  });
});
