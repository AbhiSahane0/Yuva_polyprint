import rateLimit from 'express-rate-limit';
import { ERROR_CODE, HTTP_STATUS } from '@yuva/shared';
import type { ApiFailure } from '@yuva/shared';
import { env } from '../config/env.js';

const tooManyRequests: ApiFailure = {
  success: false,
  error: { code: ERROR_CODE.RATE_LIMITED, message: 'Too many requests, please try again later' },
};

/** Baseline limiter for the whole API surface. */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

/**
 * Tighter limiter for the login endpoint. A username and password form is
 * exactly what brute-force attempts target, and scrypt makes every attempt
 * expensive for us too — so this guards the CPU as much as the account.
 *
 * Successful logins are not counted. The office signs in every morning on a
 * shared machine, and counting those would let ordinary work lock them out.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

/**
 * Sending quotations by email.
 *
 * Every call costs money at the provider and renders a PDF with Chromium
 * first, so this is looser than login but far tighter than the general API. It
 * is per-IP, which for one office is effectively per-company — the intent is to
 * bound a runaway loop, not to ration ordinary work.
 */
/**
 * GSTIN lookups.
 *
 * Every uncached one spends a paid credit at the provider, so this bounds the
 * damage a stuck retry loop can do to the account's balance. It is generous
 * against real use — the office looks a GSTIN up once per new customer, a
 * handful of times a week — and tight against a script.
 */
export const gstinRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

export const emailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

/**
 * The public quotation link.
 *
 * The one part of this API a stranger can reach without a session, so it is
 * the one part worth bounding against somebody working through guessed
 * tokens.
 *
 * **Deliberately generous, because the key may not be one customer.** This is
 * per-IP, and in production the browser does not reach this API directly: it
 * goes through the Vercel rewrite, so `req.ip` is whatever `trust proxy`
 * resolves out of the forwarded chain. If that ever resolves to an edge
 * address rather than the customer's, every customer shares one bucket — and
 * a tight limit would then turn into 429s for people trying to accept a
 * quotation. Four an minute across the whole works is still nothing against a
 * 32-byte token (there are 2^256 of them) and is far more than real use:
 * a customer opens their link a few times and answers once.
 *
 * Not skipped in test, unlike the others: the limit is a feature of this
 * endpoint rather than noise in the way of one.
 */
export const publicLinkRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});
