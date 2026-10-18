import type { Request, Response } from 'express';
import type { JobSheetInput } from '@yuva/shared';
import { created, ok, paginated, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import { JOB_SHEET_STATUS_LABELS } from '@yuva/shared';
import * as service from './job-sheet.service.js';

/** Whoever is recording it. Falls back to 'Office', matching rates and stock. */
const actor = (req: Request): string => req.user?.displayName ?? 'Office';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as { page: number; pageSize: number } & Record<string, never>;
  const { items, total } = await service.listJobSheets(query as never);
  paginated(res, items, query.page, query.pageSize, total);
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await service.peekNextNumber() });
}

export async function get(req: Request, res: Response) {
  ok(res, await service.getJobSheet(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await service.createJobSheet(req.body as JobSheetInput, actor(req)));
}

export async function update(req: Request, res: Response) {
  ok(
    res,
    await service.updateJobSheet(
      req.params.id as string,
      req.body as Partial<JobSheetInput>,
      actor(req),
    ),
  );
}

export async function cost(req: Request, res: Response) {
  ok(res, await service.costSheet(req.params.id as string));
}

export async function post(req: Request, res: Response) {
  ok(res, await service.postToStock(req.params.id as string, actor(req)));
}

export async function remove(req: Request, res: Response) {
  ok(res, await service.deleteJobSheet(req.params.id as string));
}

/**
 * What every run consumed, and what it cost a kilogram.
 *
 * The figure the office reconciles the month on, and the one it cannot read
 * off a screen twenty-five rows at a time.
 */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as Record<string, unknown>;
  const { items } = await service.listJobSheets({
    ...query,
    page: 1,
    pageSize: EXPORT_LIMIT,
  } as never);

  const file = await buildReport({
    title: 'Job sheets',
    filters: describeFilters(query),
    rows: items,
    columns: [
      { header: 'Sheet', width: 9, format: 'int', value: (s) => s.number },
      { header: 'Date', width: 12, format: 'date', value: (s) => asDate(s.date) },
      { header: 'Job', width: 34, value: (s) => s.jobName },
      { header: 'Customer', width: 28, value: (s) => s.customerName },
      { header: 'Form', width: 10, value: (s) => (s.isPouchForm ? 'Pouch' : 'Roll') },
      { header: 'Status', width: 11, value: (s) => JOB_SHEET_STATUS_LABELS[s.status] ?? s.status },
      { header: 'Output kg', width: 13, format: 'kg', total: true, value: (s) => s.finalOutputKg },
      { header: 'Material', width: 15, format: 'rs', total: true, value: (s) => s.materialCost },
      { header: 'Effective', width: 15, format: 'rs', total: true, value: (s) => s.effectivePrice },
      { header: 'Cost / kg', width: 12, format: 'rs2', value: (s) => s.costPerKg },
      { header: 'Wastage %', width: 11, format: 'percent', value: (s) => s.wastagePercent },
      { header: 'Off stock', width: 12, format: 'date', value: (s) => asDate(s.stockPostedAt) },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Job sheets'));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}
