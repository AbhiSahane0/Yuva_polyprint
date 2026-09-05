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
  it('defaults to the work queue, not to a column', () => {
    // Drafts need finishing, sent ones need chasing, won and lost are settled.
    // Newest first inside each, because that is what is being worked on.
    expect(listOrderBy({ page: 1, pageSize: 25 })).toEqual([{ status: 'asc' }, { number: 'desc' }]);
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
