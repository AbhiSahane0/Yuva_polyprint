import { describe, expect, it } from 'vitest';
import { JOB_FIELD_GROUPS, type JobFieldDef } from './job-fields';

/**
 * **The job specification is data, so the mistakes in it are data too.**
 *
 * Forty-five fields described in one table rather than written out as JSX is
 * what makes this editable by somebody who has never seen the database. The
 * cost is that a field with the wrong shape is a line in a list, not a
 * compiler error — so the rules that `JobCard` relies on are pinned here.
 */

const FIELDS: JobFieldDef[] = JOB_FIELD_GROUPS.flatMap((group) => group.fields);

describe('every box the customer form draws', () => {
  /*
   * `JobCard` renders a list with `options ?? []`. A list of nothing still
   * draws the chevron, so it is something to click and be disappointed by —
   * the same reason the quotation's job name falls back to a plain box for a
   * customer with no designs on record.
   */
  it('gives a list something to list', () => {
    const empty = FIELDS.filter(
      (field) =>
        (field.kind === 'combobox' || field.kind === 'select') &&
        (field.options ?? []).length === 0,
    );
    expect(empty.map((field) => field.name)).toEqual([]);
  });

  /* A closed set the office cannot add to, or suggestions it can. Options on
     anything else are never read, so they are a mistake that reads as a
     feature. */
  it('does not offer options nothing will show', () => {
    const stray = FIELDS.filter(
      (field) =>
        field.options !== undefined && field.kind !== 'combobox' && field.kind !== 'select',
    );
    expect(stray.map((field) => field.name)).toEqual([]);
  });

  /* Every field is `jobs.N.<name>` in the form and a column on the record. Two
     of a name would register one box twice and silently drop the other. */
  it('names each field once', () => {
    const names = FIELDS.map((field) => field.name);
    expect(names).toHaveLength(new Set(names).size);
  });

  /* The caption above the box. An unlabelled field is one nobody can fill in
     on purpose. */
  it('labels all of them', () => {
    expect(FIELDS.filter((field) => field.label.trim() === '')).toEqual([]);
  });
});

describe('the suggestion boxes', () => {
  /*
   * Named for what they are. They were called `datalist` after the native
   * element they first used; the element went when it turned out the browser
   * draws its own arrow and its own popup, and the name stayed on for a while
   * describing a control the app renders nowhere.
   */
  it('are a kind this app actually draws', () => {
    const kinds = new Set(FIELDS.map((field) => field.kind ?? 'text'));
    expect(kinds.has('datalist' as never)).toBe(false);
    expect(kinds.has('combobox')).toBe(true);
  });

  /* "Choose or type" is the whole point of the control: a closed list would be
     a Select. Said on every one of them, so none reads as a locked field. */
  it('say that anything may still be typed', () => {
    const comboboxes = FIELDS.filter((field) => field.kind === 'combobox');
    expect(comboboxes.length).toBeGreaterThan(0);
    for (const field of comboboxes) {
      expect(field.placeholder, `${field.name} has no placeholder`).toBe('Choose or type');
    }
  });
});
