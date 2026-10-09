import type { Request, Response } from 'express';
import type { JobCardInput, JobCardQuery, UpdateJobCardInput } from '@yuva/shared';
import { created, ok, paginated, pdf } from '../../utils/api-response.js';
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
