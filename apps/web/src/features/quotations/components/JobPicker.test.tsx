import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CustomerJob } from '@yuva/shared';
import { JobPicker } from './JobPicker';

/**
 * **Several jobs on one quotation, chosen beside the company they are for.**
 *
 * An enquiry arrives as a company and a handful of designs in one breath, and
 * the quotation that answers it has a line for each. This is where those lines
 * come from; the Jobs step prices them and no longer names them.
 */

const LAXMI = {
  id: 'job-laxmi',
  jobName: 'Laxmi Spices 250gm',
  jobCode: 'YP-101',
} as unknown as CustomerJob;

const PAPAD = {
  id: 'job-papad',
  jobName: 'Papad Atta 1 Kg',
  jobCode: 'YP-102',
} as unknown as CustomerJob;

const JOBS = [LAXMI, PAPAD];

type Line = { jobName: string; jobId: string | null; repeat: boolean; ownCylinders?: boolean };

function setup(lines: Line[], jobs: CustomerJob[] = JOBS) {
  const handlers = {
    onPickSaved: vi.fn(),
    onAddNew: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
  };
  render(
    <JobPicker
      jobs={jobs}
      lines={lines.map((line) => ({ ownCylinders: false, ...line }))}
      {...handlers}
    />,
  );
  return handlers;
}

describe('adding a job to the quotation', () => {
  it('brings the whole design when one of theirs is picked', () => {
    const handlers = setup([]);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByRole('option', { name: /Laxmi Spices 250gm/ }));
    expect(handlers.onPickSaved).toHaveBeenCalledWith('job-laxmi');
    expect(handlers.onAddNew).not.toHaveBeenCalled();
  });

  it('adds a name the works has never printed as a new design', () => {
    const handlers = setup([]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Sagar Masala 200g' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add job' }));
    expect(handlers.onAddNew).toHaveBeenCalledWith('Sagar Masala 200g');
  });

  /*
   * Typed, but it is one of theirs. Treating it as a new design would quote a
   * second set of cylinders for a design the works already holds — which is the
   * expensive half of the same mistake.
   */
  it('still brings the design when its name is typed out rather than picked', () => {
    const handlers = setup([]);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '  laxmi SPICES 250gm ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add job' }));
    expect(handlers.onPickSaved).toHaveBeenCalledWith('job-laxmi');
    expect(handlers.onAddNew).not.toHaveBeenCalled();
  });

  /* Nothing is decided until it is added — a half-typed name is not a line. */
  it('adds nothing from an empty box', () => {
    setup([]);
    expect(screen.getByRole('button', { name: 'Add job' })).toBeDisabled();
  });

  /*
   * Two lines for one design would be priced twice and sold once, and the
   * second would carry the first's cylinder decision with it. The same product
   * at another size is a different design and gets its own name.
   */
  it('stops offering a design that is already on the quotation', () => {
    setup([{ jobName: 'Laxmi Spices 250gm', jobId: 'job-laxmi', repeat: true }]);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Laxmi Spices 250gm/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Papad Atta 1 Kg/ })).toBeTruthy();
  });

  /* A company with nothing on record gets a plain box: a chevron over an empty
     list is something to click and be disappointed by. */
  it('offers no dropdown to a company the works has never printed for', () => {
    const handlers = setup([], []);
    expect(screen.queryByRole('button', { name: 'Show suggestions' })).toBeNull();
    const box = screen.getByPlaceholderText('What this quotation is for');
    fireEvent.focus(box);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.change(box, { target: { value: 'Brand new pack' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(handlers.onAddNew).toHaveBeenCalledWith('Brand new pack');
  });
});

describe('the jobs already on it', () => {
  it('lists them in the order the Jobs step prices them', () => {
    setup([
      { jobName: 'Laxmi Spices 250gm', jobId: 'job-laxmi', repeat: true },
      { jobName: 'Sagar Masala 200g', jobId: null, repeat: false },
    ]);
    const chips = screen
      .getAllByRole('button', { name: /^Remove / })
      .map((button) => button.getAttribute('aria-label'));
    expect(chips).toEqual(['Remove Laxmi Spices 250gm', 'Remove Sagar Masala 200g']);
  });

  /*
   * A chip is too small for "A S Agro (Lokratna Besan 500gm.)" and the field
   * is worth more than the whole name: six designs on one quotation is an
   * ordinary morning, and six full-width rows pushed the rest of the step off
   * the screen. The name is shortened on the chip and whole on hovering it.
   */
  it('keeps the whole name on the chip for hovering, however long it is', () => {
    setup([{ jobName: 'A S Agro (Lokratna Besan 500gm.)', jobId: 'job-agro', repeat: true }]);
    expect(screen.getByTitle(/^A S Agro \(Lokratna Besan 500gm\.\) — repeat/)).toBeTruthy();
  });

  /*
   * Which it is, said where it is decided. A repeat prints from a set already
   * in the works and is not quoted for cutting one — the consequence of picking
   * a design rather than typing a name, and worth a lot of money.
   */
  it('says which lines are repeats and which are new designs', () => {
    setup([
      { jobName: 'Laxmi Spices 250gm', jobId: 'job-laxmi', repeat: true },
      { jobName: 'Sagar Masala 200g', jobId: null, repeat: false },
    ]);
    expect(screen.getByText('Repeat')).toBeTruthy();
    expect(screen.getByText('New design')).toBeTruthy();
  });

  /*
   * Keyed on the cylinder decision rather than on the id. Stepping past the
   * Jobs step records a new design against the customer, so a brand-new line
   * acquires an id of its own within moments of being named — and reading the
   * id would then call it a repeat.
   */
  it('calls a saved new design what it is, not a repeat', () => {
    setup([{ jobName: 'Sagar Masala 200g', jobId: 'job-just-saved', repeat: false }]);
    expect(screen.getByText('New design')).toBeTruthy();
    expect(screen.queryByText('Repeat')).toBeNull();
  });

  /* Both charge nothing for cylinders, and they are not the same thing: one is
     a set on a shelf here, the other a set that was never the works\u2019 to make. */
  it('tells a set the customer brought from one the works already holds', () => {
    setup([
      { jobName: 'Amol Chivda 100gm', jobId: 'job-chivda', repeat: false, ownCylinders: true },
    ]);
    expect(screen.getByText('Customer\u2019s set')).toBeTruthy();
    expect(screen.queryByText('Repeat')).toBeNull();
    expect(screen.queryByText('New design')).toBeNull();
  });

  it('renames a line through the one box that names it', () => {
    const handlers = setup([{ jobName: 'Laxmi Spices', jobId: 'job-laxmi', repeat: true }]);
    /* The chip is a label until it is clicked, and a box once it is. */
    fireEvent.click(screen.getByRole('button', { name: 'Laxmi Spices' }));
    fireEvent.change(screen.getByDisplayValue('Laxmi Spices'), {
      target: { value: 'Laxmi Spices 500gm' },
    });
    expect(handlers.onRename).toHaveBeenCalledWith(0, 'Laxmi Spices 500gm');
  });

  it('takes one off the quotation', () => {
    const handlers = setup([
      { jobName: 'Laxmi Spices 250gm', jobId: 'job-laxmi', repeat: true },
      { jobName: 'Papad Atta 1 Kg', jobId: 'job-papad', repeat: true },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Papad Atta 1 Kg' }));
    expect(handlers.onRemove).toHaveBeenCalledWith(1);
  });

  /* An empty field says what it is for. A line under it saying the quotation
     has no jobs is a second sentence about the same emptiness. */
  it('asks for the first one rather than announcing there are none', () => {
    setup([], []);
    expect(screen.getByPlaceholderText('What this quotation is for')).toBeTruthy();
  });
});
