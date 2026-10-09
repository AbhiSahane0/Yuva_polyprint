import type { Request, Response } from 'express';
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderInput } from '@yuva/shared';
import { created, ok, pdf } from '../../utils/api-response.js';
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
