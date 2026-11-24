import {
  formatRs,
  normaliseMobile,
  type PublicQuotationResponse,
  type Quotation,
} from '@yuva/shared';

/**
 * **What goes out when the customer answers.**
 *
 * Three messages, and they are not the same message in three places:
 *
 * - **To the works, by email.** Someone has to act on it. This one carries the
 *   detail — who pressed it, what they said, which quantity — because the
 *   person reading it has to decide whether to start buying film.
 * - **To the works, on WhatsApp.** The same news in one line, because the
 *   office reads WhatsApp on the floor and email at a desk.
 * - **To the customer.** A receipt. They have just agreed to spend lakhs on a
 *   web page and heard nothing back; silence is how a customer starts
 *   wondering whether it went through and rings to ask.
 *
 * The WhatsApp bodies are kept beside the email bodies rather than in the
 * Twilio client, because what to say is this module's business and how to send
 * it is not. Each also comes with the variable map for the approved template,
 * so the sandbox text and the template say the same thing.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "24 November 2026, 3:42 pm" in the works' own time, not the server's. */
function whenLocal(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

const WORKS = 'Yuva Polyprint & Packaging Industries';

/* -------------------------------------------------------------------------- */
/* To the works                                                               */
/* -------------------------------------------------------------------------- */

export function acceptanceAlertSubject(
  quotation: Quotation,
  response: PublicQuotationResponse,
): string {
  const verb = response.decision === 'ACCEPTED' ? 'ACCEPTED' : 'declined';
  return `Quotation #${quotation.number} ${verb} — ${quotation.customerName}`;
}

export function buildAcceptanceAlertEmail(
  quotation: Quotation,
  response: PublicQuotationResponse,
  total: number,
) {
  const accepted = response.decision === 'ACCEPTED';
  const headline = accepted
    ? `${quotation.customerName} has accepted quotation #${quotation.number}.`
    : `${quotation.customerName} has declined quotation #${quotation.number}.`;

  const who = response.personRole
    ? `${response.personName} (${response.personRole})`
    : response.personName;

  const lines = [
    headline,
    '',
    `Answered by: ${who}`,
    `When: ${whenLocal(response.respondedAt)}`,
    `Value: ${formatRs(total)} including GST`,
    ...(response.note
      ? ['', accepted ? 'Their note:' : 'Their reason:', response.note]
      : accepted
        ? []
        : ['', 'No reason given.']),
    '',
    accepted
      ? 'Nothing has been created in the system yet. Open the quotation and confirm it to ' +
        'raise the order, the designs and the cylinders.'
      : 'The quotation has been marked lost with their reason against it.',
  ];

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">
    <p style="margin:0 0 18px;font-size:17px;font-weight:bold;color:${accepted ? '#15803d' : '#b45309'}">
      ${escapeHtml(headline)}
    </p>

    <div style="margin:0 0 20px;padding:16px;background:#f5f6f8;border-radius:8px;font-size:14px;line-height:1.9">
      Answered by: <strong>${escapeHtml(who)}</strong><br/>
      When: ${escapeHtml(whenLocal(response.respondedAt))}<br/>
      Value: <strong>${escapeHtml(formatRs(total))}</strong> including GST
    </div>

    ${
      response.note
        ? `<p style="margin:0 0 6px;font-size:13px;color:#5b6270">${accepted ? 'Their note' : 'Their reason'}</p>
    <p style="margin:0 0 20px;padding:14px;border-left:3px solid #d4d7dd;line-height:1.55;font-size:14px">${escapeHtml(response.note)}</p>`
        : ''
    }

    <p style="margin:0;line-height:1.55;font-size:14px">
      ${
        accepted
          ? 'Nothing has been created in the system yet. Open the quotation and confirm it to raise the order, the designs and the cylinders.'
          : 'The quotation has been marked lost, with their reason against it.'
      }
    </p>
  </div>
</body></html>`;

  return { text: lines.join('\n'), html };
}

/**
 * The same news in one line, for the phone in somebody's pocket.
 *
 * Under 1,024 characters because that is Meta's limit on a template body, and
 * well under it because this is read while walking across a shop floor.
 */
export function acceptanceWhatsAppToOffice(
  quotation: Quotation,
  response: PublicQuotationResponse,
  total: number,
): string {
  const verb = response.decision === 'ACCEPTED' ? 'accepted' : 'declined';
  const who = response.personRole
    ? `${response.personName}, ${response.personRole}`
    : response.personName;

  return [
    `Quotation #${quotation.number} ${verb}.`,
    `${quotation.customerName} — ${formatRs(total)} incl. GST.`,
    `By ${who}.`,
    ...(response.note ? [`"${response.note}"`] : []),
    response.decision === 'ACCEPTED'
      ? 'Confirm it in the system to raise the order.'
      : 'Marked lost with their reason.',
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* To the customer                                                            */
/* -------------------------------------------------------------------------- */

export function confirmationSubject(quotation: Quotation): string {
  return `We have your acceptance — quotation #${quotation.number}`;
}

export function buildCustomerConfirmationEmail(
  quotation: Quotation,
  response: PublicQuotationResponse,
  total: number,
) {
  const text = [
    `Dear ${quotation.customerName},`,
    '',
    `Thank you — we have recorded your acceptance of quotation #${quotation.number}.`,
    '',
    `Accepted by: ${response.personName}`,
    `On: ${whenLocal(response.respondedAt)}`,
    `Value: ${formatRs(total)} including GST`,
    '',
    'Our office will be in touch to confirm the schedule and the advance.',
    '',
    'Thanks and regards,',
    WORKS,
    'Sangamner, Ahmednagar',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">
    <p style="margin:0 0 16px;font-size:15px">Dear ${escapeHtml(quotation.customerName)},</p>

    <p style="margin:0 0 18px;line-height:1.55;font-size:15px">
      Thank you — we have recorded your acceptance of quotation
      <strong>#${quotation.number}</strong>.
    </p>

    <div style="margin:0 0 20px;padding:16px;background:#f5f6f8;border-radius:8px;font-size:14px;line-height:1.9">
      Accepted by: <strong>${escapeHtml(response.personName)}</strong><br/>
      On: ${escapeHtml(whenLocal(response.respondedAt))}<br/>
      Value: <strong>${escapeHtml(formatRs(total))}</strong> including GST
    </div>

    <p style="margin:0 0 20px;line-height:1.55;font-size:14px">
      Our office will be in touch to confirm the schedule and the advance.
    </p>

    <p style="margin:0;font-size:14px;line-height:1.6">
      Thanks and regards,<br/>
      <strong>${escapeHtml(WORKS)}</strong><br/>
      <span style="color:#5b6270">Sangamner, Ahmednagar</span>
    </p>
  </div>
</body></html>`;

  return { text, html };
}

export function confirmationWhatsAppToCustomer(quotation: Quotation, total: number): string {
  return [
    `Thank you. We have your acceptance of quotation #${quotation.number}`,
    `(${formatRs(total)} incl. GST).`,
    'Our office will be in touch about the schedule and the advance.',
    WORKS,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Sending the quotation itself                                               */
/* -------------------------------------------------------------------------- */

export function quotationWhatsApp(quotation: Quotation, total: number, acceptUrl: string): string {
  return [
    `Quotation #${quotation.number} from ${WORKS}.`,
    `${quotation.items.length} job${quotation.items.length === 1 ? '' : 's'}, ${formatRs(total)} incl. GST.`,
    '',
    'View it and accept here:',
    acceptUrl,
  ].join('\n');
}

/**
 * The variables for Meta's approved templates.
 *
 * Numbered, because that is how Meta names them: a body reading
 * "Quotation {{1}} from Yuva Polyprint. {{2}}. Accept here: {{3}}" is filled
 * by `{ '1': '124', '2': '₹2,10,040 incl. GST', '3': 'https://…' }`.
 *
 * The exact template text to submit is in `docs/whatsapp-templates.md`. Keep
 * the two in step: a variable added to the template and not to this map comes
 * out blank in the customer's message, and Twilio does not complain.
 */
export function quotationTemplateVariables(
  quotation: Quotation,
  total: number,
  acceptUrl: string,
): Record<string, string> {
  return {
    '1': String(quotation.number),
    '2': `${formatRs(total)} incl. GST`,
    '3': acceptUrl,
  };
}

export function acceptedTemplateVariables(
  quotation: Quotation,
  response: PublicQuotationResponse,
  total: number,
): Record<string, string> {
  return {
    '1': String(quotation.number),
    '2': quotation.customerName,
    '3': `${formatRs(total)} incl. GST`,
    '4': response.personName,
  };
}

/**
 * The customer's number as WhatsApp addresses it, or null if it cannot be.
 *
 * A quotation snapshots the mobile the way it came off the office's
 * spreadsheet — `9890605665`, no country code, and in some rows `NA` or a
 * landline. Twilio refuses all of those, the last two rightly. So the number
 * goes through the one helper in this codebase that turns an office number
 * into a handset address, and a number it cannot vouch for gets no message
 * rather than a failure in the log.
 */
export function customerWhatsAppNumber(quotation: Pick<Quotation, 'mobile'>): string | null {
  return normaliseMobile(quotation.mobile);
}
