import { env } from '../config/env.js';
import { logger } from './logger.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Sending mail through Resend.
 *
 * Their REST API is a single POST, so this calls it directly rather than
 * pulling in the SDK — one less dependency in an image that already carries
 * Chromium, and no client library to keep in step with.
 */

const ENDPOINT = 'https://api.resend.com/emails';

/** Resend's cap is 40MB per message; a quotation PDF is well under 1MB. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface Attachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  attachments?: Attachment[];
}

/** Whether mail is configured at all. Lets callers fail with a useful message. */
export function isMailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/**
 * Turns a Resend failure into something the office can act on.
 *
 * The one that matters in practice is the 403 you get when sending from
 * `onboarding@resend.dev` to anyone but the account owner. Passed through
 * verbatim it reads as a permissions bug in this app; it is really a Resend
 * account limit with a specific fix.
 */
function describeFailure(status: number, body: string): ApiError {
  const lower = body.toLowerCase();

  if (status === 401 || status === 403) {
    if (lower.includes('testing emails') || lower.includes('own email address')) {
      return ApiError.badRequest(
        'Resend is still in test mode for this sender, so it will only deliver to the ' +
          'address that owns the Resend account. Verify a domain and set MAIL_FROM to an ' +
          'address on it to send to customers.',
      );
    }
    if (lower.includes('domain is not verified') || lower.includes('not verified')) {
      return ApiError.badRequest(
        'The sending domain in MAIL_FROM is not verified with Resend. Verify it, or use ' +
          'onboarding@resend.dev while testing.',
      );
    }
    return ApiError.badRequest('Resend rejected the request. Check RESEND_API_KEY and MAIL_FROM.');
  }

  if (status === 422) {
    // Resend refuses the IANA reserved domains outright, which is easy to hit
    // while testing and says nothing about the address being wrong.
    if (lower.includes('testing email address') || lower.includes('example.com')) {
      return ApiError.badRequest(
        'Resend will not deliver to reserved test domains such as example.com. ' +
          'Use a real address, or delivered@resend.dev to test without emailing anyone.',
      );
    }
    return ApiError.badRequest('Resend rejected an address on this message. Check the spelling.');
  }
  if (status === 429) {
    return ApiError.badRequest('Resend is rate limiting us. Wait a moment and try again.');
  }
  return ApiError.internal('The email could not be sent. Please try again.');
}

/**
 * Sends one message. Returns Resend's id for it.
 *
 * Attachments go as base64, which is what the API takes.
 */
export async function sendEmail(input: SendEmailInput): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    throw ApiError.badRequest(
      'Email is not configured on the server. Set RESEND_API_KEY to enable sending.',
    );
  }

  const attachments = input.attachments ?? [];
  const total = attachments.reduce((sum, file) => sum + file.content.length, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    throw ApiError.badRequest('The attachment is too large to email.');
  }

  const payload = {
    from: env.MAIL_FROM,
    to: input.to,
    ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((file) => ({
            filename: file.filename,
            content: file.content.toString('base64'),
          })),
        }
      : {}),
  };

  /*
   * A quotation PDF is rendered by Chromium before this runs, so the whole
   * operation is already slow. Bound the network part so a hung request cannot
   * hold the connection open indefinitely.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    logger.error({ err: error }, 'Resend request failed');
    throw controller.signal.aborted
      ? ApiError.internal('The email service did not respond in time. Please try again.')
      : ApiError.internal('Could not reach the email service. Please try again.');
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();

  if (!response.ok) {
    // Recipients are logged, the API key never is.
    logger.error({ status: response.status, body, to: input.to }, 'Resend rejected the message');
    throw describeFailure(response.status, body);
  }

  try {
    const parsed = JSON.parse(body) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}
