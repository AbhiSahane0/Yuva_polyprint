import { describe, expect, it } from 'vitest';
import { listOrderBy } from './quotation.service.js';

/**
 * What the list is ordered by, and the tie-break behind every sort.
 *
 * Worth pinning because the tie-break is invisible: without it, two quotations
 * sharing a date — which is most of them, the office writes several a day —
 * have no defined order, and Postgres may return them differently on each page.
 * That shows up as rows jumping about while paging, which reads as a bug in the
 * pagination rather than a missing ORDER BY.
 */
describe('listOrderBy', () => {
  it('defaults to newest first, by the date on the document', () => {
    /*
     * It used to lead on status — every draft, then every sent one, then the
     * won and the lost. D sorts before S, so a quotation written this morning
     * sat below eleven from last year, and the office opens this screen to find
     * what they wrote today.
     */
    expect(listOrderBy({ page: 1, pageSize: 25 })).toEqual([
      { date: 'desc' },
      { number: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('breaks a same-day tie all the way down to the id', () => {
    /* The office writes several a day, so the date alone ties constantly. The
       number settles almost all of them and the id settles the rest, which is
       what stops rows jumping about while paging. */
    const [first, second, third] = listOrderBy({ page: 1, pageSize: 25 });
    expect(Object.keys(first ?? {})).toEqual(['date']);
    expect(Object.keys(second ?? {})).toEqual(['number']);
    expect(Object.keys(third ?? {})).toEqual(['id']);
  });

  it('needs no tie-break when sorting by the number itself', () => {
    // The number is unique among the latest versions, so nothing can tie.
    expect(listOrderBy({ page: 1, pageSize: 25, sort: 'number', dir: 'asc' })).toEqual([
      { number: 'asc' },
    ]);
  });

  it.each(['customerName', 'date', 'status'] as const)('breaks ties on %s by number', (sort) => {
    expect(listOrderBy({ page: 1, pageSize: 25, sort, dir: 'asc' })).toEqual([
      { [sort]: 'asc' },
      { number: 'desc' },
    ]);
  });

  it('carries the direction through', () => {
    expect(listOrderBy({ page: 1, pageSize: 25, sort: 'date', dir: 'desc' })).toEqual([
      { date: 'desc' },
      { number: 'desc' },
    ]);
  });

  it('assumes ascending when a column is named without one', () => {
    expect(listOrderBy({ page: 1, pageSize: 25, sort: 'customerName' })).toEqual([
      { customerName: 'asc' },
      { number: 'desc' },
    ]);
  });
});
