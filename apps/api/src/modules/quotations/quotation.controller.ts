import type { Request, Response } from 'express';
import type { RecordOutcomeInput, SendQuotationInput } from '@yuva/shared';
import type { CreateQuotationInput, ListQuotationsQuery, UpdateQuotationInput } from '@yuva/shared';
import { created, ok, paginated, pdf as sendPdf } from '../../utils/api-response.js';
import * as quotationService from './quotation.service.js';
import { renderQuotationPdf } from './quotation-pdf.js';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as ListQuotationsQuery;
  const { items, total } = await quotationService.listQuotations(query);
  paginated(res, items, query.page, query.pageSize, total);
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await quotationService.peekNextNumber() });
}

export async function getById(req: Request, res: Response) {
  ok(res, await quotationService.getQuotationById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await quotationService.createQuotation(req.body as CreateQuotationInput));
}

export async function update(req: Request, res: Response) {
  const quotation = await quotationService.updateQuotation(
    req.params.id as string,
    req.body as UpdateQuotationInput,
  );
  ok(res, quotation);
}

export async function remove(req: Request, res: Response) {
  ok(res, await quotationService.deleteQuotation(req.params.id as string));
}

/**
 * The document as a real PDF.
 *
 * `?inline=1` serves it for display rather than download — the preview uses
 * that, so what the user approves on screen is byte-for-byte the file the
 * customer receives, not a separate HTML rendering that can drift from it.
 */
export async function pdf(req: Request, res: Response) {
  const quotation = await quotationService.getQuotationById(req.params.id as string);
  const file = await renderQuotationPdf(quotation);

  const safeName = quotation.customerName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  sendPdf(
    res,
    file,
    `Quotation_${quotation.number}_${safeName || 'Customer'}.pdf`,
    req.query.inline === '1',
  );
}

/** Emails the quotation, with the PDF attached. */
export async function send(req: Request, res: Response) {
  const result = await quotationService.sendQuotationEmail(
    req.params.id as string,
    req.body as SendQuotationInput,
    req.user?.displayName ?? 'Office',
  );
  ok(res, result);
}

/** Every recorded send for this quotation. */
export async function emailHistory(req: Request, res: Response) {
  ok(res, await quotationService.listQuotationEmails(req.params.id as string));
}

/**
 * A revision of an existing quotation — same number, next version.
 *
 * A POST because it creates a document, and 201 because it creates a new one
 * rather than changing the one in the path.
 */
export async function createVersion(req: Request, res: Response) {
  const quotation = await quotationService.createQuotationVersion(req.params.id as string);
  created(res, quotation);
}

/** Every version of this quotation's number, newest first. */
export async function versions(req: Request, res: Response) {
  const rows = await quotationService.listQuotationVersions(req.params.id as string);
  ok(res, rows);
}

/** Records the customer's answer; a win creates the customer and their jobs. */
export async function recordOutcome(req: Request, res: Response) {
  const result = await quotationService.recordOutcome(
    req.params.id as string,
    req.body as RecordOutcomeInput,
  );
  ok(res, result);
}
