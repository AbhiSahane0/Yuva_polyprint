import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { JOB_SHEET_LINES, type JobSheetLine } from '@yuva/shared';
import { InkGrid } from './InkGrid';

/**
 * **A drum is not taken once.**
 *
 * The works takes ten kilograms of white, finishes it, takes fifteen more,
 * finishes that, takes two and puts one back. Their sheet has four cells for
 * it and adds them up — `=SUM(B15:E15)` — and we had one box, so Total could
 * only ever repeat Rec and the three draws had to be added up in somebody's
 * head on the way to a form whose whole purpose is arithmetic.
 */

const WHITE = JOB_SHEET_LINES.findIndex((line) => line.key === 'ink_white');

function inks(patch: Partial<JobSheetLine> = {}): JobSheetLine[] {
  return JOB_SHEET_LINES.map((template, index) => ({
    id: `line-${index + 1}`,
    position: index + 1,
    section: template.section,
    kind: template.kind,
    materialId: null,
    name: template.name,
    issuedKg: 0,
    returnedKg: 0,
    issueReels: [],
    returnReels: [],
    mixIssueReels: [],
    mixIssuedKg: 0,
    mixReturnedKg: 0,
    mixSharePercent: template.mixSharePercent,
    computedKg: 0,
    consumedOverrideKg: null,
    consumedKg: 0,
    ratePerKg: 0,
    amount: 0,
    ...(index === WHITE ? patch : {}),
  }));
}

const draw = (weightKg: number, position: number) => ({
  id: `draw-${position}`,
  position,
  weightKg,
  coreKg: 0,
  reelNumber: '',
});

/** The row for a colour, found by the name in its first cell. */
function row(name: string): HTMLElement {
  const tr = screen.getAllByText(name)[0]?.closest('tr');
  if (!tr) throw new Error(`no row for ${name}`);
  return tr;
}

/**
 * One cell of a colour's row, by the column it sits under.
 *
 * By position rather than by text: a row where the fresh consumption and the
 * M column happen to agree would otherwise match both, and the whole point of
 * the two columns is that they are different questions.
 */
const COLUMNS = [
  'Fresh Ink',
  'Rec',
  'Total',
  'Bal.',
  'Con.',
  'Mix Ink',
  'Mix Rec',
  'Mix Bal.',
  'Mix Cons.',
  'Mix Total',
] as const;

function cell(name: string, column: (typeof COLUMNS)[number]): HTMLElement {
  const cells = within(row(name)).getAllByRole('cell');
  const found = cells[COLUMNS.indexOf(column)];
  if (!found) throw new Error(`${name} has no ${column} cell`);
  return found;
}

describe('the ink block', () => {
  it('adds the draws up rather than asking for the total', () => {
    render(
      <InkGrid
        lines={inks({
          /* Ten, then fifteen, then two — and one kilogram came back. */
          issueReels: [draw(10, 1), draw(15, 2), draw(2, 3)],
          returnedKg: 1,
        })}
        onLine={() => undefined}
      />,
    );

    const white = row('White');
    expect(within(white).getByLabelText('White, fresh, draw 1')).toHaveValue('10');
    expect(within(white).getByLabelText('White, fresh, draw 2')).toHaveValue('15');
    expect(within(white).getByLabelText('White, fresh, draw 3')).toHaveValue('2');
    /* Total 27, Bal. 1, Con. 26 — and the balance is the one typed figure. */
    expect(cell('White', 'Total')).toHaveTextContent('27.000');
    expect(within(white).getByLabelText('White, fresh balance')).toHaveValue('1');
    expect(cell('White', 'Con.')).toHaveTextContent('26.000');
  });

  it('is never a box the works could type the total into', () => {
    render(
      <InkGrid lines={inks({ issueReels: [draw(10, 1), draw(15, 2)] })} onLine={() => undefined} />,
    );
    const white = row('White');
    expect(within(white).queryByLabelText('White, fresh total')).not.toBeInTheDocument();
    expect(cell('White', 'Total')).toHaveTextContent('25.000');
  });

  it('takes another draw when the drum is opened again', () => {
    const onLine = vi.fn();
    render(<InkGrid lines={inks({ issueReels: [draw(10, 1)] })} onLine={onLine} />);

    fireEvent.click(within(row('White')).getByLabelText('Add a White, fresh draw'));
    expect(onLine).toHaveBeenCalledWith(WHITE + 1, {
      issueReels: [
        expect.objectContaining({ weightKg: 10, position: 1 }),
        expect.objectContaining({ weightKg: 0, position: 2 }),
      ],
    });
  });

  /* Removing from the middle would renumber every draw after it under
     somebody's cursor, so only the last one goes. */
  it('takes the last draw back off, and only the last', () => {
    const onLine = vi.fn();
    const white = inks({ issueReels: [draw(10, 1), draw(15, 2)] });
    render(<InkGrid lines={white} onLine={onLine} />);

    const cells = within(row('White'));
    expect(cells.queryByLabelText('Remove the last White, fresh draw')).toBeInTheDocument();
    fireEvent.click(cells.getByLabelText('Remove the last White, fresh draw'));
    expect(onLine).toHaveBeenCalledWith(WHITE + 1, {
      issueReels: [expect.objectContaining({ weightKg: 10 })],
    });
  });

  /* Their mix column is one cell wide, which is why the works typed `=22+17`
     into it on this very sheet. It takes draws too. */
  it('gives the mixed drum its own draws', () => {
    render(
      <InkGrid
        lines={inks({ mixIssueReels: [draw(22, 1), draw(17, 2)], mixReturnedKg: 19 })}
        onLine={() => undefined}
      />,
    );
    const white = row('White');
    expect(within(white).getByLabelText('White, mix, draw 2')).toHaveValue('17');
    /* 39 out, 19 back, 20 consumed — and 40% of that reaches the costing. */
    expect(cell('White', 'Mix Cons.')).toHaveTextContent('20.000');
    expect(cell('White', 'Mix Total')).toHaveTextContent('8.000');
  });

  it('adds the colours up into the drum the solvents draw from', () => {
    const lines = inks();
    const white = lines[WHITE];
    const cyan = lines[JOB_SHEET_LINES.findIndex((line) => line.key === 'ink_cyan')];
    if (!white || !cyan) throw new Error('the form has no white or cyan');
    white.mixIssueReels = [draw(22, 1), draw(17, 2)];
    cyan.mixIssueReels = [draw(11, 1)];

    render(<InkGrid lines={lines} onLine={() => undefined} />);
    expect(screen.getByText(/The mix total — 50.000 out/)).toBeInTheDocument();
  });
});
