import type { Request, Response } from 'express';
import type { RespondToQuotationInput } from '@yuva/shared';
import { ok, pdf as sendPdf } from '../../utils/api-response.js';
import * as share from './quotation-share.service.js';
import * as quotationService from './quotation.service.js';
import { renderQuotationPdf } from './quotation-pdf.js';

/**
 * **The endpoints a customer reaches, holding nothing but a link.**
 *
 * Kept in their own controller rather than added to `quotation.controller`,
 * because the difference between these and those is the whole point: every
 * handler in the other file sits behind `authenticate` and a module guard,
 * and every handler here is open to the internet. A file boundary is a weak
 * guard, but it does mean nobody adds a public route by accident while
 * editing the office's ones.
 */

/** What the customer sees, and a note that they looked. */
export async function view(req: Request, res: Response) {
  ok(res, await share.publicQuotationByToken(req.params.token as string));
}

/**
 * The same quotation as a PDF.
 *
 * Rendered rather than stored: the PDF a customer downloads from the link is
 * the same document the office previews and the same one that was attached to
 * the email, produced by the same code. A file kept from send-time would be
 * one more thing that can drift.
 */
export async function pdf(req: Request, res: Response) {
  const id = await share.publicQuotationIdByToken(req.params.token as string);
  const quotation = await quotationService.getQuotationById(id);
  const file = await renderQuotationPdf(quotation);

  const safeName = quotation.customerName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  sendPdf(
    res,
    file,
    `Quotation_${quotation.number}_${safeName || 'Customer'}.pdf`,
    req.query.inline === '1',
  );
}

/**
 * Accepting or declining.
 *
 * The address and the browser string are taken here rather than in the
 * service, because they are facts about the request and the service should
 * not have to know what an Express request looks like to record them.
 *
 * `req.ip` is Express's, which with `trust proxy` set reads the forwarded
 * header — on Render and behind Vercel's rewrite the socket address is a load
 * balancer and would corroborate nothing.
 */
export async function respond(req: Request, res: Response) {
  const answer = await share.respondToQuotation(
    req.params.token as string,
    req.body as RespondToQuotationInput,
    {
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
    },
  );
  ok(res, answer);
}
