import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * **Sending WhatsApp through Twilio.**
 *
 * One POST, form-encoded, exactly as the mailer calls Resend directly — one
 * less dependency in an image that already carries Chromium.
 *
 * ## The thing to understand about WhatsApp
 *
 * A business may not simply message a customer. Meta allows free text only
 * inside **24 hours of the customer last writing to you**; outside that window
 * every message must be a **template approved by Meta in advance**, sent by
 * its content SID with the variable values filled in. Quoting is always
 * outside the window — the customer has not written to you, you are writing to
 * them — so the real path is the template path.
 *
 * Twilio's **sandbox** ignores all of that: a customer who has sent the join
 * code gets plain text. That is what makes it useful for building, and what
 * makes it useless for customers. So this sends a template when one is
 * configured and plain text when one is not, and the swap from sandbox to the
 * works' own number is two environment variables and no code.
 *
 * ## Failure is not an error here
 *
 * A quotation that was emailed, recorded and accepted must not be reported as
 * failed because WhatsApp was down. Every function here answers with an
 * outcome rather than throwing, and the caller writes down what happened.
 */

const API = 'https://api.twilio.com/2010-04-01';

export interface WhatsAppMessage {
  /** E.164, with or without the `whatsapp:` prefix. */
  to: string;
  /** Plain text. Used as-is by the sandbox, ignored when a template is sent. */
  body: string;
  /**
   * An approved template's content SID, where there is one for this message.
   *
   * Without it a real WhatsApp number answers 63016 — "cannot send freeform
   * message outside the 24-hour window" — which is not a bug to chase but a
   * template to get approved.
   */
  contentSid?: string | undefined;
  /**
   * The template's variables, keyed by their number as Meta has them: a
   * template reading "Quotation {{1}} for {{2}}" takes `{ '1': '124', '2': 'A S Agro' }`.
   */
  contentVariables?: Record<string, string> | undefined;
}

export interface WhatsAppResult {
  to: string;
  /** Twilio's message SID, for chasing a delivery in their console. */
  sid: string | null;
  /** Null when it went; a sentence the office can act on when it did not. */
  error: string | null;
}

/** Whether WhatsApp is configured at all. Lets callers skip it cleanly. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
}

/** Twilio wants `whatsapp:+919876543210`, however the number was typed. */
function channelAddress(number: string): string {
  const trimmed = number.trim();
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

/**
 * Turns a Twilio failure into something the office can act on.
 *
 * The three that happen in practice, and what each really means:
 *
 * - **63015 / 63016** — a freeform message outside the 24-hour window. The fix
 *   is an approved template, not a retry.
 * - **63007** — the `from` number is not a WhatsApp sender. On the sandbox it
 *   usually means the customer has not sent the join code.
 * - **21211** — the number is not a WhatsApp number at all, which for this
 *   works is most often a landline typed into the mobile box.
 */
function describeFailure(status: number, body: string): string {
  let code: number | undefined;
  let message = body;
  try {
    const parsed = JSON.parse(body) as { code?: number; message?: string };
    code = parsed.code;
    if (parsed.message) message = parsed.message;
  } catch {
    /* Not JSON. The raw body is still better than nothing. */
  }

  if (code === 63015 || code === 63016) {
    return (
      'WhatsApp refused a plain message: a business may only send free text within ' +
      '24 hours of the customer writing to it. Get the template approved by Meta and ' +
      'set its content SID.'
    );
  }
  if (code === 63007) {
    return (
      'Twilio does not recognise the sending number as a WhatsApp sender. On the sandbox ' +
      'the customer must send the join code once before anything can reach them.'
    );
  }
  if (code === 21211 || code === 21614) {
    return 'That number is not reachable on WhatsApp.';
  }
  if (status === 401 || status === 403) {
    return 'Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
  }
  return `WhatsApp could not be sent (${status}): ${message}`;
}

/**
 * Sends one message, answering with what happened rather than throwing.
 *
 * @see WhatsAppResult
 */
export async function sendWhatsApp(message: WhatsAppMessage): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    return { to: message.to, sid: null, error: 'WhatsApp is not configured on this server.' };
  }

  const form = new URLSearchParams({
    From: channelAddress(env.TWILIO_WHATSAPP_FROM as string),
    To: channelAddress(message.to),
  });

  if (message.contentSid) {
    form.set('ContentSid', message.contentSid);
    if (message.contentVariables) {
      form.set('ContentVariables', JSON.stringify(message.contentVariables));
    }
  } else {
    form.set('Body', message.body);
  }

  const credentials = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID as string}:${env.TWILIO_AUTH_TOKEN as string}`,
  ).toString('base64');

  try {
    const response = await fetch(
      `${API}/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID as string)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      },
    );

    const text = await response.text();
    if (!response.ok) {
      const error = describeFailure(response.status, text);
      /* The number is the customer's, so it is logged; the body is not, because
         a quotation total is not something to leave in a log file. */
      logger.warn({ to: message.to, status: response.status }, error);
      return { to: message.to, sid: null, error };
    }

    const parsed = JSON.parse(text) as { sid?: string };
    return { to: message.to, sid: parsed.sid ?? null, error: null };
  } catch (cause) {
    const error = 'WhatsApp could not be reached.';
    logger.warn({ to: message.to, cause }, error);
    return { to: message.to, sid: null, error };
  }
}

/** The same message to several numbers, each reported on its own. */
export async function sendWhatsAppToMany(
  numbers: string[],
  message: Omit<WhatsAppMessage, 'to'>,
): Promise<WhatsAppResult[]> {
  return Promise.all(numbers.map((to) => sendWhatsApp({ ...message, to })));
}
