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
  /* Derived by the page from the style and the size, not read off a screen. */
  pouchMakingPerKg: 11.04,
};

/** A document whose jobs have no size yet, so making cannot be worked out. */
const NO_MAKING: CostingMasters = { ...MASTERS, pouchMakingPerKg: null };

/** A standup is in the pouch workbook, at 7%; a reel is not, at 8%. */
const STANDUP: PouchType = 'STANDUP';

function Host({
  defaults,
  pouchTypes = [STANDUP],
  masters = MASTERS,
}: {
  defaults?: Partial<CreateQuotationFormValues>;
  pouchTypes?: (PouchType | null)[];
  masters?: CostingMasters;
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
      masters={masters}
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

  /*
   * It used to say so, in one line, and the client asked for that line to go.
   * The quotation screen is read with the customer across the desk, and what
   * the works makes on the job is not theirs to read — the same reason the
   * margin percentages on the quantity rows lost the words "gross" and "net".
   * The figures are a tick away, which is the point of the tick.
   */
  it('puts no figure on screen at all while they are away', () => {
    render(<Host />);
    expect(onScreen()).not.toContain('Margin 9%');
    expect(onScreen()).not.toContain('6.80');
    expect(onScreen()).not.toContain('Wastage');
    expect(onScreen()).not.toContain('11.04');
    /* Nor a heading over it: a heading above one checkbox is noise. */
    expect(onScreen()).not.toContain('This quotation’s costing');
    /* The checkbox names the section by itself. */
    expect(onScreen()).toContain('Edit this quotation’s costing');
  });

  it('says what decides making when it cannot be worked out', () => {
    // Only once the boxes are open, where it belongs on the box it explains.
    render(<Host masters={NO_MAKING} />);
    expect(onScreen()).not.toContain('by style');
    fireEvent.click(checkbox());
    expect(box('pouchMakingPerKg')?.placeholder).toBe('by style');
  });

  it('opens the boxes filled in with the works’ own figures', () => {
    render(<Host />);
    fireEvent.click(checkbox());
    expect(box('marginPercent')?.value).toBe('9');
    expect(box('transportPerKg')?.value).toBe('6.8');
    // A standup is in the pouch workbook, which runs at 7 rather than 8.
    expect(box('wastagePercent')?.value).toBe('7');
  });

  it('fills pouch making in with what the style and the size come to', () => {
    /*
     * The works charges making PER POUCH, and there is no per-kilogram figure
     * on the Costing screen to copy: the same charge reads between Rs 11 and
     * Rs 64 a kilogram across its own nine costed pouches, on nothing but how
     * big the pouch is. So the page derives it — `perPouch × pouchesPerKg`,
     * which is exactly what the rate carries — and the box shows that.
     */
    render(<Host />);
    fireEvent.click(checkbox());
    expect(box('pouchMakingPerKg')?.value).toBe('11.04');
  });

  it('leaves pouch making empty when no single figure applies', () => {
    // Before a job has a size to derive one from, on a document whose jobs
    // disagree, and on one that makes no pouches at all.
    render(<Host masters={NO_MAKING} />);
    fireEvent.click(checkbox());
    expect(box('pouchMakingPerKg')?.value).toBe('');
    expect(box('pouchMakingPerKg')?.placeholder).toBe('by style');
  });

  it('follows making down as the job it is derived from changes', () => {
    const { rerender } = render(<Host />);
    fireEvent.click(checkbox());
    expect(box('pouchMakingPerKg')?.value).toBe('11.04');

    rerender(<Host masters={{ ...MASTERS, pouchMakingPerKg: 15.2 }} />);

    /*
     * The pouch was resized under an open section. Left at 11.04 the box would
     * look like the works' own figure, no longer BE it, and so survive the
     * strip on save as a deliberate override nobody made.
     */
    expect(box('pouchMakingPerKg')?.value).toBe('15.2');
  });

  it('does not follow a figure the office typed', () => {
    const { rerender } = render(<Host />);
    fireEvent.click(checkbox());
    fireEvent.change(box('pouchMakingPerKg')!, { target: { value: '20' } });

    rerender(<Host masters={{ ...MASTERS, pouchMakingPerKg: 15.2 }} />);

    // 20 is theirs. Resizing a pouch is not a reason to throw it away.
    expect(box('pouchMakingPerKg')?.value).toBe('20');
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
    // And 15 is not left on screen in a summary either: closed shows nothing.
    expect(onScreen()).not.toContain('15');
  });
});

describe('strippedCosting', () => {
  it('unsets anything still equal to the works’ own figure', () => {
    const out = strippedCosting(
      {
        marginPercent: '9',
        transportPerKg: '6.8',
        wastagePercent: '7',
        pouchMakingPerKg: '11.04',
      },
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

  it('keeps a making figure once the job it was derived from has moved', () => {
    // The derived figure is 11.04 for THIS document. A box holding 9.80 is not
    // the works' own whatever it once was, so it stands.
    expect(strippedCosting({ pouchMakingPerKg: '9.80' }, MASTERS, [STANDUP]).pouchMakingPerKg).toBe(
      '9.80',
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
