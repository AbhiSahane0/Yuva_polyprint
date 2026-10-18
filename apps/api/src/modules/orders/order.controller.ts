import type { Request, Response } from 'express';
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderInput } from '@yuva/shared';
import { created, ok, pdf, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import { ORDER_STATUS_LABELS } from '@yuva/shared';
import type { CertificateKind } from './certificate-document.js';
import { renderCertificatePdf } from './certificate-pdf.js';
import * as orderService from './order.service.js';

export async function list(req: Request, res: Response) {
  ok(res, await orderService.listOrders(req.query as unknown as ListOrdersQuery));
}

export async function nextNumber(_req: Request, res: Response) {
  ok(res, { number: await orderService.peekNextNumber() });
}

export async function getOne(req: Request, res: Response) {
  ok(res, await orderService.getOrderById(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  created(res, await orderService.createOrder(req.body as CreateOrderInput));
}

export async function update(req: Request, res: Response) {
  ok(res, await orderService.updateOrder(req.params.id as string, req.body as UpdateOrderInput));
}

export async function remove(req: Request, res: Response) {
  ok(res, await orderService.deleteOrder(req.params.id as string));
}

/**
 * A certificate for this order, as a PDF the office can send on.
 *
 * `?inline=1` serves it for display rather than download — what the office
 * usually wants is to look at it, print it and attach it to a mail, not to
 * collect files in a downloads folder.
 */
async function certificate(req: Request, res: Response, kind: CertificateKind) {
  const file = await renderCertificatePdf(req.params.id as string, kind);
  pdf(res, file.pdf, file.filename, req.query.inline === '1');
}

/** What the laminate is, layer by layer. */
export async function analysisCertificate(req: Request, res: Response) {
  await certificate(req, res, 'coa');
}

/** That the material is virgin and fit for food contact. */
export async function foodGradeCertificate(req: Request, res: Response) {
  await certificate(req, res, 'food-grade');
}

/** The order book, as the screen has it filtered. */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as ListOrdersQuery;
  const { items } = await orderService.listOrders({ ...query, page: 1, pageSize: EXPORT_LIMIT });

  const file = await buildReport({
    title: 'Orders',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'No.', width: 9, format: 'int', value: (o) => o.number },
      { header: 'Order date', width: 12, format: 'date', value: (o) => asDate(o.orderDate) },
      { header: 'Customer', width: 32, value: (o) => o.customerName },
      { header: 'Job', width: 34, value: (o) => o.jobName },
      { header: 'Status', width: 13, value: (o) => ORDER_STATUS_LABELS[o.status] ?? o.status },
      { header: 'Quantity kg', width: 13, format: 'kg', total: true, value: (o) => o.quantityKg },
      { header: 'Rate / kg', width: 12, format: 'rs2', value: (o) => o.ratePerKg },
      { header: 'Amount', width: 15, format: 'rs', total: true, value: (o) => o.amount },
      { header: 'Customer PO', width: 18, value: (o) => o.customerPoNumber },
      { header: 'Quotation', width: 11, format: 'int', value: (o) => o.quotationNumber },
      { header: 'Due', width: 12, format: 'date', value: (o) => asDate(o.dueDate) },
      { header: 'Completed', width: 12, format: 'date', value: (o) => asDate(o.completedAt) },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Orders'));
}

/** A yyyy-mm-dd string as a date Excel will sort and format. Null stays null. */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}
