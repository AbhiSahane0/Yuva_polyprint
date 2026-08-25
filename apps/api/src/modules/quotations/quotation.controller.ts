import type { Request, Response } from 'express';
import type { CreateQuotationInput, ListQuotationsQuery, UpdateQuotationInput } from '@yuva/shared';
import { created, ok, paginated } from '../../utils/api-response.js';
import * as quotationService from './quotation.service.js';
import { renderQuotationHtml } from './quotation-document.js';
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

/** The printable document as HTML — used by the on-screen preview. */
export async function preview(req: Request, res: Response) {
  const quotation = await quotationService.getQuotationById(req.params.id as string);

  // The document carries one inline script that fills the job table to the foot
  // of the page. Helmet's app-wide policy blocks inline scripts, so this
  // response gets its own far stricter policy: no network access of any kind,
  // only the inline style/script and the data: URIs the document already holds.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      'img-src data:',
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  );

  res.type('html').send(renderQuotationHtml(quotation));
}

/** The same document as a real PDF file. */
export async function pdf(req: Request, res: Response) {
  const quotation = await quotationService.getQuotationById(req.params.id as string);
  const file = await renderQuotationPdf(quotation);

  const safeName = quotation.customerName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const filename = `Quotation_${quotation.number}_${safeName || 'Customer'}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(file.length));
  res.end(Buffer.from(file));
}
