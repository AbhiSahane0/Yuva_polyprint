import type { Request, Response } from 'express';
import type { JobCardInput, JobCardQuery, UpdateJobCardInput } from '@yuva/shared';
import { created, ok, paginated, pdf, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import { renderJobCardPdf } from './job-card-pdf.js';
import * as service from './job-card.service.js';

/** Whoever is raising it. Falls back to 'Office', matching rates and stock. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as JobCardQuery;
  const { items, total } = await service.listJobCards(query);
  paginated(res, items, query.page, query.pageSize, total);
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await service.peekNextNumber() });
}

export async function get(req: Request, res: Response) {
  ok(res, await service.getJobCard(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await service.createJobCard(req.body as JobCardInput, actor(req)));
}

export async function update(req: Request, res: Response) {
  ok(res, await service.updateJobCard(req.params.id as string, req.body as UpdateJobCardInput));
}

export async function remove(req: Request, res: Response) {
  ok(res, await service.deleteJobCard(req.params.id as string));
}

/**
 * The card as a real PDF — the paper the office prints and signs.
 *
 * `?inline=1` serves it for display rather than download, which is what the
 * print dialog is opened on: the office wants it on the printer, not in the
 * downloads folder.
 */
export async function print(req: Request, res: Response) {
  const file = await renderJobCardPdf(req.params.id as string);
  pdf(res, file.pdf, file.filename, req.query.inline === '1');
}

/** What the floor has been told to make. */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as JobCardQuery;
  const { items } = await service.listJobCards({ ...query, page: 1, pageSize: EXPORT_LIMIT });

  const file = await buildReport({
    title: 'Job cards',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'Card', width: 9, format: 'int', value: (c) => c.number },
      { header: 'Date', width: 12, format: 'date', value: (c) => asDate(c.date) },
      { header: 'Job', width: 36, value: (c) => c.jobName },
      { header: 'Customer', width: 30, value: (c) => c.customerName },
      { header: 'Work order', width: 16, value: (c) => c.workOrderNo },
      { header: 'Order', width: 10, format: 'int', value: (c) => c.orderNumber },
      { header: 'Quantity kg', width: 13, format: 'kg', total: true, value: (c) => c.quantityKg },
      { header: 'Despatch', width: 12, format: 'date', value: (c) => asDate(c.dispatchDate) },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Job cards'));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}
