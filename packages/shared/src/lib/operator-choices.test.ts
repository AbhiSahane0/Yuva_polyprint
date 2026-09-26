import { describe, expect, it } from 'vitest';
import { operatorChoices, type OperatorChoice } from './operator-choices.js';

const person = (over: Partial<OperatorChoice> & { id: string; name: string }): OperatorChoice => ({
  roleName: 'Printing Operator',
  process: 'PRINTING',
  isActive: true,
  ...over,
});

const works: OperatorChoice[] = [
  person({ id: 'rahul', name: 'Rahul' }),
  person({ id: 'amit', name: 'Amit' }),
  person({ id: 'suresh', name: 'Suresh', roleName: 'Lamination Operator', process: 'LAMINATION' }),
  person({ id: 'manoj', name: 'Manoj', roleName: 'Slitting Operator', process: 'SLITTING' }),
  person({ id: 'priya', name: 'Priya', roleName: 'Supervisor', process: null }),
];

describe('who a stage offers', () => {
  it('puts the people whose role is this process first', () => {
    const { suggested } = operatorChoices(works, 'PRINTING');
    expect(suggested.map((p) => p.name)).toEqual(['Amit', 'Rahul']);
  });

  it('still offers everybody else', () => {
    /*
     * The day the slitting man covers the press is exactly the day worth
     * recording, and a list that cannot say so gets the wrong name typed in.
     */
    const { others } = operatorChoices(works, 'PRINTING');
    expect(others.map((p) => p.name)).toEqual(['Manoj', 'Priya', 'Suresh']);
  });

  it('loses nobody between the two lists', () => {
    const { suggested, others } = operatorChoices(works, 'LAMINATION');
    expect(suggested.length + others.length).toBe(works.length);
  });

  it('leaves out people who have left', () => {
    const withLeaver = [...works, person({ id: 'old', name: 'Gone', isActive: false })];
    const { suggested, others } = operatorChoices(withLeaver, 'PRINTING');
    expect([...suggested, ...others].map((p) => p.id)).not.toContain('old');
  });

  it('keeps the person already named, even once they have left', () => {
    /*
     * A record of who ran a job in March must not empty itself when they leave
     * in June. A dropdown that cannot show its own value shows a blank, which
     * reads as nobody ran it.
     */
    const withLeaver = [...works, person({ id: 'old', name: 'Gone', isActive: false })];
    const { suggested } = operatorChoices(withLeaver, 'PRINTING', 'old');
    expect(suggested.map((p) => p.id)).toContain('old');
  });

  it('offers everybody when the stage has no kind at all', () => {
    const { suggested, others } = operatorChoices(works, null);
    expect(suggested).toEqual([]);
    expect(others).toHaveLength(works.length);
  });

  it('sorts by name, not by the order they were added', () => {
    const { others } = operatorChoices(works, 'PRINTING');
    expect(others.map((p) => p.name)).toEqual([...others.map((p) => p.name)].sort());
  });
});
