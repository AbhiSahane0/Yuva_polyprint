import type { Quotation } from '@yuva/shared';
import { renderHtmlToPdf } from '../../lib/pdf.js';
import { renderQuotationHtml } from './quotation-document.js';

/**
 * The quotation as the customer receives it.
 *
 * The Chromium that prints it is shared with every other document the API
 * makes — see `lib/pdf.ts`. This file is only the pairing of this template
 * with that printer.
 */
export async function renderQuotationPdf(quotation: Quotation): Promise<Uint8Array> {
  return renderHtmlToPdf(renderQuotationHtml(quotation));
}
