import type {
  PublicQuotation,
  PublicQuotationResponse,
  Quotation,
  QuotationLinkProblem,
  QuotationResponseRecord,
  RespondToQuotationInput,
} from '@yuva/shared';
import { normaliseMobile } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { isMailConfigured, sendEmail } from '../../lib/mailer.js';
import { isWhatsAppConfigured, sendWhatsApp } from '../../lib/whatsapp.js';
import { ApiError } from '../../utils/api-error.js';
import { getQuotationById } from './quotation.service.js';
import { hashToken } from './quotation-link.js';
import { quotedTier, toPublicQuotation } from './public-quotation.js';
import {
  acceptanceAlertSubject,
  acceptanceWhatsAppToOffice,
  acceptedTemplateVariables,
  buildAcceptanceAlertEmail,
  buildCustomerConfirmationEmail,
  confirmationSubject,
  confirmationWhatsAppToCustomer,
  customerWhatsAppNumber,
} from './quotation-notify.js';

/**
 * **The customer's side of a quotation.**
 *
 * Everything here answers a request that carries no session — somebody with a
 * link, who may be the buyer, may be the buyer's colleague, and may be a
 * stranger who was forwarded the mail. Three rules follow from that and are
 * worth stating before the code:
 *
 * 1. **Nothing here trusts the caller.** The token is the only credential and
 *    it is matched by hash; every other field in the request is typed by
 *    whoever is holding it.
 * 2. **Nothing here leaks the works' working.** See `public-quotation.ts`.
 * 3. **Nothing here creates work.** Accepting moves a status and writes a
 *    record. The customer, the designs, the order and the cylinders are
 *    created by the office pressing Won, as they always were.
 */

/** A link that is good, or the reason it is not. */
type Resolved =
  | { ok: true; linkId: string; expiresAt: Date; quotationId: string }
  | { ok: false; problem: QuotationLinkProblem };

async function resolveToken(token: string, now: Date = new Date()): Promise<Resolved> {
  const link = await prisma.quotationLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      quotationId: true,
      expiresAt: true,
      revokedAt: true,
      quotation: { select: { isLatest: true } },
    },
  });

  if (!link) return { ok: false, problem: 'unknown' };
  /*
   * Superseded is checked before withdrawn, because a revision withdraws the
   * old links as it is created — and "we have sent you a revised quotation" is
   * a far more useful thing to read than "this link was withdrawn".
   */
  if (!link.quotation.isLatest) return { ok: false, problem: 'superseded' };
  if (link.revokedAt) return { ok: false, problem: 'withdrawn' };
  if (link.expiresAt <= now) return { ok: false, problem: 'expired' };

  return { ok: true, linkId: link.id, expiresAt: link.expiresAt, quotationId: link.quotationId };
}

/**
 * Turns a link problem into the error the customer sees.
 *
 * All four answer 404 — a stranger working through guessed tokens must not be
 * able to tell "no such link" from "that one has lapsed", because the second
 * confirms a quotation exists. The message differs because a real customer
 * holding a real link needs to know which of these has happened to them, and
 * they already know their quotation exists.
 */
function linkError(problem: QuotationLinkProblem): ApiError {
  switch (problem) {
    case 'expired':
      return ApiError.notFound(
        'This quotation link has expired. Please ask us for a fresh one — we are happy to send it.',
      );
    case 'withdrawn':
      return ApiError.notFound('This quotation link has been withdrawn. Please get in touch.');
    case 'superseded':
      return ApiError.notFound(
        'We have since sent you a revised quotation, so this link is no longer current. ' +
          'Please use the latest one, or get in touch.',
      );
    default:
      return ApiError.notFound('We could not find that quotation. Please check the link.');
  }
}

/** The answer already given on this quotation, if there is one. */
async function latestResponse(quotationId: string): Promise<PublicQuotationResponse | null> {
  const row = await prisma.quotationResponse.findFirst({
    where: { quotationId },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return {
    decision: row.decision,
    personName: row.personName,
    personRole: row.personRole,
    note: row.note,
    respondedAt: row.createdAt.toISOString(),
  };
}

/**
 * The quotation behind a link, and a note that it was looked at.
 *
 * The view is counted on every open, not only the first. "They have opened it
 * four times and not answered" is a different sales conversation from "they
 * have never opened it", and the office cannot have either without this.
 */
export async function publicQuotationByToken(token: string): Promise<PublicQuotation> {
  const resolved = await resolveToken(token);
  if (!resolved.ok) throw linkError(resolved.problem);

  const [quotation, response] = await Promise.all([
    getQuotationById(resolved.quotationId),
    latestResponse(resolved.quotationId),
    prisma.quotationLink.update({
      where: { id: resolved.linkId },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      select: { id: true },
    }),
  ]);

  return toPublicQuotation(quotation, { expiresAt: resolved.expiresAt }, response);
}

/** The same quotation as a PDF, for the Download button on the public page. */
export async function publicQuotationIdByToken(token: string): Promise<string> {
  const resolved = await resolveToken(token);
  if (!resolved.ok) throw linkError(resolved.problem);
  return resolved.quotationId;
}

export interface RespondContext {
  ipAddress: string;
  userAgent: string;
}

/**
 * Records the customer's answer.
 *
 * **Second answers are refused, not overwritten.** Two people at one company
 * open the same forwarded mail; the second must be told their colleague has
 * already answered rather than quietly replacing it — and an acceptance that
 * can be flipped to a refusal by anyone holding the link is not evidence of
 * anything.
 *
 * **Declining goes straight to lost.** Nothing is created by losing, so there
 * is nothing for the office to confirm; the reason they typed becomes the
 * reason on the record, which is the one part of a loss worth keeping.
 */
export async function respondToQuotation(
  token: string,
  input: RespondToQuotationInput,
  context: RespondContext,
): Promise<PublicQuotationResponse> {
  const resolved = await resolveToken(token);
  if (!resolved.ok) throw linkError(resolved.problem);

  const quotation = await getQuotationById(resolved.quotationId);

  const already = await latestResponse(resolved.quotationId);
  if (already) {
    throw ApiError.conflict(
      already.decision === 'ACCEPTED'
        ? `This quotation was already accepted by ${already.personName}. Please get in touch if that is not right.`
        : `An answer has already been recorded for this quotation by ${already.personName}. Please get in touch.`,
    );
  }

  /* A quotation the office has already settled is not open to an answer. */
  if (quotation.status === 'WON' || quotation.status === 'LOST') {
    throw ApiError.conflict(
      'This quotation has already been settled with our office. Please get in touch.',
    );
  }

  const accepted = input.decision === 'ACCEPTED';
  const tier = quotedTier(quotation);
  const decidedAt = new Date();

  const [row] = await prisma.$transaction([
    prisma.quotationResponse.create({
      data: {
        quotationId: quotation.id,
        linkId: resolved.linkId,
        decision: input.decision,
        personName: input.personName,
        personRole: input.personRole,
        note: input.note,
        tierId: tier?.id ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent.slice(0, 500),
      },
    }),
    prisma.quotation.update({
      where: { id: quotation.id },
      data: accepted
        ? { status: 'ACCEPTED' }
        : /*
           * Lost is the end of it, and `decidedAt` is set here rather than
           * waiting for the office: the customer has decided, and the date
           * that matters is the day they said so.
           */
          { status: 'LOST', lostReason: input.note, decidedAt },
      select: { id: true },
    }),
  ]);

  const response: PublicQuotationResponse = {
    decision: row.decision,
    personName: row.personName,
    personRole: row.personRole,
    note: row.note,
    respondedAt: row.createdAt.toISOString(),
  };

  /*
   * Told, not awaited into the answer.
   *
   * The customer's acceptance is recorded by the time this runs. If Resend is
   * down or Twilio refuses the number, the right outcome is a logged warning
   * and a customer who sees their acceptance confirmed on screen — not a 500
   * on the one action this whole feature exists for, after the row is already
   * written.
   */
  await notify(quotation, response, tier?.grandWithGst ?? quotation.grandWithGst).catch(
    (cause: unknown) => {
      logger.error({ cause, quotationId: quotation.id }, 'Could not announce a quotation answer');
    },
  );

  return response;
}

/**
 * Tells the works, and thanks the customer.
 *
 * Four messages, each independent: one failing must not stop the others, which
 * is why this is `allSettled` over separate promises rather than a chain.
 */
async function notify(
  quotation: Quotation,
  response: PublicQuotationResponse,
  total: number,
): Promise<void> {
  const accepted = response.decision === 'ACCEPTED';
  const jobs: Promise<unknown>[] = [];

  if (isMailConfigured() && env.OFFICE_ALERT_EMAIL) {
    const { text, html } = buildAcceptanceAlertEmail(quotation, response, total);
    jobs.push(
      sendEmail({
        to: [env.OFFICE_ALERT_EMAIL],
        subject: acceptanceAlertSubject(quotation, response),
        text,
        html,
      }),
    );
  }

  /* Normalised for the same reason, and falling back to what was configured:
     a number this helper cannot vouch for is still worth trying when somebody
     put it there on purpose — it may be outside India. */
  const officeMobile = env.OFFICE_WHATSAPP
    ? (normaliseMobile(env.OFFICE_WHATSAPP) ?? env.OFFICE_WHATSAPP)
    : null;
  if (isWhatsAppConfigured() && officeMobile) {
    jobs.push(
      sendWhatsApp({
        to: officeMobile,
        body: acceptanceWhatsAppToOffice(quotation, response, total),
        contentSid: env.TWILIO_TEMPLATE_QUOTATION_ACCEPTED,
        contentVariables: env.TWILIO_TEMPLATE_QUOTATION_ACCEPTED
          ? acceptedTemplateVariables(quotation, response, total)
          : undefined,
      }),
    );
  }

  /*
   * Only an acceptance is acknowledged to the customer.
   *
   * "Thank you for declining our quotation" is not a message anybody wants to
   * receive, and a customer who has just said no does not need a receipt for
   * it. The office hears about it either way.
   */
  if (accepted && isMailConfigured() && quotation.email && quotation.email !== 'NA') {
    const { text, html } = buildCustomerConfirmationEmail(quotation, response, total);
    jobs.push(
      sendEmail({
        to: [quotation.email],
        subject: confirmationSubject(quotation),
        text,
        html,
        replyTo: env.MAIL_REPLY_TO,
      }),
    );
  }

  /*
   * The customer's number as WhatsApp addresses it, not as the office typed
   * it.
   *
   * A quotation snapshots the mobile the way it came off the spreadsheet —
   * `9890605665`, with no country code — and Twilio refuses that with 21211.
   * `normaliseMobile` is the one place this app turns an office number into a
   * handset address, and it answers null for a landline or a blank rather
   * than guessing, so an undeliverable number simply gets no message instead
   * of a failure in the log.
   */
  const customerMobile = accepted ? customerWhatsAppNumber(quotation) : null;
  if (customerMobile && isWhatsAppConfigured()) {
    jobs.push(
      sendWhatsApp({
        to: customerMobile,
        body: confirmationWhatsAppToCustomer(quotation, total),
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ cause: result.reason }, 'One acceptance message could not be sent');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The office's side of the same records                                      */
/* -------------------------------------------------------------------------- */

/** Every answer recorded against this quotation, newest first. */
export async function listResponses(quotationId: string): Promise<QuotationResponseRecord[]> {
  const rows = await prisma.quotationResponse.findMany({
    where: { quotationId },
    orderBy: { createdAt: 'desc' },
    include: { tier: { select: { position: true } } },
    take: 20,
  });

  return rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    personName: row.personName,
    personRole: row.personRole,
    note: row.note,
    respondedAt: row.createdAt.toISOString(),
    tierPosition: row.tier?.position ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  }));
}
