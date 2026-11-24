import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * **The link a customer opens to accept a quotation.**
 *
 * The whole security of this feature is one secret in a URL, so it is worth
 * saying plainly what that means and what is done about it.
 *
 * - **The token is 32 random bytes**, from the system CSPRNG. That is the same
 *   strength as the session tokens the office signs in with. Guessing one is
 *   not a thing that happens.
 * - **Only its SHA-256 is stored.** A database that leaks must not hand
 *   somebody the power to accept every open quotation in it. The raw token
 *   lives in the customer's email and WhatsApp message and nowhere else — not
 *   in the database, and not in the log, which is why requests are matched by
 *   hash and the token never reaches `logger`.
 * - **It expires.** The printed terms give the quotation fifteen days; the
 *   link is given twenty, so somebody answering on the last day is not turned
 *   away by an hour.
 * - **It is per version.** A revision is a different document at a different
 *   price, so the link that went out with version 1 cannot accept version 2.
 *
 * What this does NOT do is prove who is holding it. Anyone the customer
 * forwards the mail to can press Accept, which is exactly how a quotation
 * works on paper too — so the page asks who they are and the answer is kept
 * with the time, the address it came from and the version they saw. That
 * record, not the token, is what settles an argument a year later.
 */

/** 32 bytes as hex. The regex in `quotationTokenParamSchema` must match this. */
const TOKEN_BYTES = 32;

export interface MintedLink {
  /** Given to the customer. Never stored. */
  token: string;
  /** Stored. Never leaves the building. */
  tokenHash: string;
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintLink(now: Date = new Date()): MintedLink {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(now.getTime() + env.QUOTATION_LINK_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

/**
 * Compares two hashes without leaking how far they matched.
 *
 * Belt and braces: the lookup is a unique-index hit on the hash, so timing
 * says nothing useful anyway. It is here because the day somebody replaces
 * that query with a scan, this is the line that stops it mattering.
 */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether this base address would produce a link nobody outside can open.
 *
 * `PUBLIC_APP_URL` defaults to the dev server so a link made on a laptop
 * opens on that laptop. On a deployed server that default is a trap: the link
 * is minted, recorded, emailed and sent over WhatsApp, and **nothing fails**.
 * The office sees a successful send; the customer sees a page that will not
 * load; and the first anybody knows of it is when a quotation goes unanswered.
 *
 * It has already happened once, on the first production send.
 */
export function pointsAtNobody(base: string, production: boolean): boolean {
  return production && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(base);
}

/**
 * The address the customer is sent to.
 *
 * `/q/` rather than `/quotations/`: short enough to survive a WhatsApp line
 * break, and plainly not a page of the office's own app.
 *
 * Throws rather than returning a localhost address on a deployed server. A
 * send that fails with a sentence naming the missing setting is worth a great
 * deal more than a send that succeeds and delivers a dead link — the first
 * costs somebody five minutes, the second costs a quotation.
 */
export function linkUrl(token: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/+$/, '');

  if (pointsAtNobody(base, env.isProduction)) {
    throw ApiError.badRequest(
      'PUBLIC_APP_URL is not set on this server, so the accept link would point at ' +
        'localhost and the customer could not open it. Set it to the public address of ' +
        'the web app, then send again.',
    );
  }

  return `${base}/q/${token}`;
}
