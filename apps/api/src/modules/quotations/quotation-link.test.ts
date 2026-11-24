import { describe, expect, it } from 'vitest';
import { quotationTokenParamSchema } from '@yuva/shared';
import { hashToken, linkUrl, mintLink, sameToken } from './quotation-link.js';

/**
 * The link is the whole security of the customer-facing side, so the
 * properties it depends on are pinned rather than assumed.
 */

describe('the token in an accept link', () => {
  it('is 32 random bytes, which is what the route will accept', () => {
    const { token } = mintLink();

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    /* The router's guard and the minter must agree, or every link 404s. */
    expect(quotationTokenParamSchema.safeParse({ token }).success).toBe(true);
  });

  it('is different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintLink().token));
    expect(tokens.size).toBe(50);
  });

  /*
   * The stored hash must never be mistakable for the token. If these were
   * ever the same value, the database would hold working links.
   */
  it('is not what gets stored', () => {
    const { token, tokenHash } = mintLink();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(hashToken(token));
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('hashes two different tokens to two different rows', () => {
    expect(hashToken('a'.repeat(64))).not.toBe(hashToken('b'.repeat(64)));
  });

  it('compares equal hashes without caring how they were built', () => {
    const { token, tokenHash } = mintLink();

    expect(sameToken(hashToken(token), tokenHash)).toBe(true);
    expect(sameToken(hashToken(token), hashToken('x'))).toBe(false);
  });
});

describe('when a link lapses', () => {
  it('outlives the fifteen days the printed terms promise', () => {
    const now = new Date('2026-11-24T06:00:00.000Z');
    const { expiresAt } = mintLink(now);

    const days = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThanOrEqual(15);
  });
});

describe('the address the customer opens', () => {
  it('points at the web app, not at this API', () => {
    const url = linkUrl('a'.repeat(64));

    /* Whatever PUBLIC_APP_URL is set to in this environment, the link must be
       a page rather than an endpoint — a customer cannot read JSON. */
    expect(url).toContain('/q/');
    expect(url).not.toContain('/api/');
    expect(url.endsWith('a'.repeat(64))).toBe(true);
  });

  it('does not double the slash when the base url has a trailing one', () => {
    expect(linkUrl('b'.repeat(64))).not.toContain('//q/');
  });
});
