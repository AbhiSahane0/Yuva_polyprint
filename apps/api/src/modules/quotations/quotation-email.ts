import { formatRs, type Quotation } from '@yuva/shared';

/**
 * The body of a quotation email.
 *
 * Deliberately plain. Mail clients are a hostile rendering target — Outlook
 * still uses Word's engine — so this is a table-free, single-column layout with
 * inline styles and no images. The quotation itself is the attached PDF; this
 * is only the covering note.
 */

/**
 * Escapes text for HTML.
 *
 * The customer's name and the sender's note both end up in the markup, and
 * neither is trusted: a company called "Smith & Sons <Foods>" must not break
 * the email, let alone inject into it.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turns the sender's plain-text note into paragraphs, preserving line breaks. */
function toParagraphs(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
}

export function defaultSubject(quotation: Quotation): string {
  return `Quotation #${quotation.number} — Yuva Polyprint & Packaging Industries`;
}

export function buildQuotationEmail(quotation: Quotation, message: string) {
  const jobs = quotation.items.length;
  const jobLabel = `${jobs} job${jobs === 1 ? '' : 's'}`;
  const note = message.trim();

  const text = [
    `Dear ${quotation.customerName},`,
    '',
    note || 'Please find our quotation attached.',
    '',
    `Quotation no: ${quotation.number}`,
    `Date: ${quotation.date}`,
    `Items: ${jobLabel}`,
    `Total (incl. GST): ${formatRs(quotation.grandWithGst)}`,
    `Advance payable: ${formatRs(quotation.totalAdvance)}`,
    '',
    'The full quotation is attached as a PDF.',
    '',
    'Thanks and regards,',
    'Yuva Polyprint & Packaging Industries',
    'Sangamner, Ahmednagar',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">
    <p style="margin:0 0 16px;font-size:15px">Dear ${escapeHtml(quotation.customerName)},</p>

    ${note ? toParagraphs(note) : '<p style="margin:0 0 14px;line-height:1.55">Please find our quotation attached.</p>'}

    <div style="margin:20px 0;padding:16px;background:#f5f6f8;border-radius:8px;font-size:14px;line-height:1.9">
      <strong style="display:block;margin-bottom:6px">Quotation #${quotation.number}</strong>
      Date: ${escapeHtml(quotation.date)}<br/>
      Items: ${escapeHtml(jobLabel)}<br/>
      Total incl. GST: <strong>${escapeHtml(formatRs(quotation.grandWithGst))}</strong><br/>
      Advance payable: <strong>${escapeHtml(formatRs(quotation.totalAdvance))}</strong>
    </div>

    <p style="margin:0 0 20px;line-height:1.55;font-size:14px">
      The full quotation, with the specification for each item, is attached as a PDF.
    </p>

    <p style="margin:0;font-size:14px;line-height:1.6">
      Thanks and regards,<br/>
      <strong>Yuva Polyprint &amp; Packaging Industries</strong><br/>
      <span style="color:#5b6270">Sangamner, Ahmednagar</span>
    </p>
  </div>
</body></html>`;

  return { text, html };
}
