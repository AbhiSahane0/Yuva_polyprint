import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DesignSummary } from '@yuva/shared';

/**
 * Choosing a design by typing.
 *
 * The list used to be a native select of every design without a set — fifty of
 * them, in job order, scrolled. What matters about the replacement is not that
 * it filters, but that it still identifies a design by its **id**: two of this
 * works' designs share a name *and* a job code, because the source spreadsheet
 * reuses codes across genuinely different jobs. A picker that answered with
 * what was written would register a set against the wrong job and show nothing
 * to say so.
 */

const design = (over: Partial<DesignSummary>): DesignSummary =>
  ({
    jobId: 'job_1',
    jobCode: 'YPP2605224',
    jobName: 'Cholke Paneer 200gm.',
    customerId: 'c1',
    customerName: 'Cholke',
    pouchType: 'NA',
    expectedCylinders: 4,
    cylinderCount: 0,
    status: 'NONE',
    codes: [],
    colours: [],
    locations: [],
    ownership: null,
    totalCost: 0,
    artworkCount: 0,
    lastEventAt: null,
    ...over,
  }) as DesignSummary;

const DESIGNS: DesignSummary[] = [
  design({ jobId: 'job_a', expectedCylinders: 4 }),
  /*
   * Same name, same code, different job — both are real rows. The cylinder
   * count differs only so the assertions can prove *which* one was picked;
   * nothing on the row itself shows it.
   */
  design({ jobId: 'job_b', expectedCylinders: 9 }),
  design({
    jobId: 'job_c',
    jobName: 'Indigo Rajaram Jaggery 900gm.',
    jobCode: 'YPP2605352',
    customerName: 'Indigo',
    expectedCylinders: 6,
  }),
];

const registered = vi.hoisted(() => ({ input: null as unknown }));

vi.mock('../api/cylinder-api', () => ({
  useUnregisteredDesigns: () => ({ data: DESIGNS }),
  useRegisterCylinders: () => ({
    mutateAsync: (input: unknown) => {
      registered.input = input;
      return Promise.resolve({});
    },
    isPending: false,
  }),
}));

const { RegisterSetModal } = await import('./RegisterSetModal');

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RegisterSetModal open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

/*
 * By its label, not by role: a native <select> is also a combobox to the
 * accessibility tree, so the Ownership box would match too.
 */
const box = () => screen.getByLabelText('Design') as HTMLInputElement;

/*
 * Scoped to the suggestion list. A native <select> is a combobox to the
 * accessibility tree and its <option>s are options, so the Ownership box would
 * otherwise be counted in both.
 */
const suggestions = () => within(screen.getByRole('listbox')).getAllByRole('option');

describe('RegisterSetModal — choosing a design', () => {
  it('narrows the list as you type', () => {
    show();
    fireEvent.focus(box());
    expect(suggestions()).toHaveLength(3);

    fireEvent.change(box(), { target: { value: 'jagg' } });
    const rows = suggestions();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Indigo Rajaram Jaggery');
  });

  it('tells two identically named designs apart on the second line', () => {
    /*
     * They read the same, so the only thing that can separate them for a human
     * is the customer and the code. Without it the list looks like a duplicate
     * row and the office picks whichever.
     */
    show();
    fireEvent.focus(box());
    const rows = suggestions();
    expect(rows[0]!.textContent).toContain('Cholke · YPP2605224');
  });

  it('carries the chosen design forward by id, not by what it reads', () => {
    show();
    fireEvent.focus(box());

    /* The second of the two identical rows. */
    fireEvent.mouseDown(suggestions()[1]!);

    expect(box().value).toBe('Cholke Paneer 200gm.');

    /*
     * Both rows read 'Cholke Paneer 200gm. — Cholke · YPP2605224'. Only the
     * second expects nine cylinders, so this is the assertion that the id went
     * through and the text did not.
     */
    expect(screen.getByText(/the job expects 9 cylinders/)).toBeTruthy();
    expect(screen.getAllByPlaceholderText(/CYL-/i)).toHaveLength(9);
  });

  it('drops the choice when the box is edited after picking', () => {
    /*
     * Otherwise the box reads one design while the form holds another — the
     * kind of disagreement nobody notices until a set is registered against
     * the wrong job.
     */
    show();
    fireEvent.focus(box());
    fireEvent.mouseDown(suggestions()[2]!);
    expect(screen.getByText(/the job expects 6 cylinders/)).toBeTruthy();

    fireEvent.change(box(), { target: { value: 'Indigo Rajaram Jaggery 900gm' } });
    expect(screen.queryByText(/the job expects/)).toBeNull();
    expect(screen.getByText(/Pick one from the list/)).toBeTruthy();
  });

  it('seeds a row per cylinder the job expects', () => {
    // The count is already on the job; asking again would ask a question the
    // system can answer.
    show();
    fireEvent.focus(box());
    fireEvent.mouseDown(suggestions()[2]!);
    expect(screen.getAllByPlaceholderText(/CYL-/i)).toHaveLength(6);
  });
});
