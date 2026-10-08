import type { Request, Response } from 'express';
import type { JobSheetInput } from '@yuva/shared';
import { created, ok, paginated } from '../../utils/api-response.js';
import { renderJobCardPdf } from './job-card-pdf.js';
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
 * The job card as a real PDF — the paper the office prints and signs.
 *
 * `?inline=1` serves it for display rather than download, which is what the
 * print dialog is opened on: the office wants it on the printer, not in the
 * downloads folder, and a file it never meant to keep is a file somebody has
 * to tidy up.
 */
export async function card(req: Request, res: Response) {
  const { pdf, filename } = await renderJobCardPdf(req.params.id as string);
  const inline = req.query.inline === '1';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
  );
  res.setHeader('Content-Length', String(pdf.length));
  // Helmet's default policy blocks a same-origin PDF from being framed.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.end(Buffer.from(pdf));
}
