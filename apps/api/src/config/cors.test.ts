import { describe, expect, it } from 'vitest';
import { createOriginMatcher } from './cors.js';

const PROD = 'https://yuva-polyprint.vercel.app';
const PREVIEWS = 'https://yuva-polyprint-*.vercel.app';

describe('createOriginMatcher', () => {
  it('matches an exact origin', () => {
    const allows = createOriginMatcher([PROD]);

    expect(allows(PROD)).toBe(true);
    expect(allows('https://somewhere-else.vercel.app')).toBe(false);
  });

  it('matches every shape of Vercel preview URL from one pattern', () => {
    const allows = createOriginMatcher([PROD, PREVIEWS]);

    expect(allows(PROD)).toBe(true);
    // Branch deployment
    expect(allows('https://yuva-polyprint-git-abhi-dev-abhisahane0.vercel.app')).toBe(true);
    // Per-commit deployment
    expect(allows('https://yuva-polyprint-k2f9x1qzp-abhisahane0.vercel.app')).toBe(true);
  });

  it('does not let a wildcard escape the hostname label', () => {
    const allows = createOriginMatcher([PREVIEWS]);

    // The dangerous case: a lookalike host on someone else's domain.
    expect(allows('https://yuva-polyprint-x.attacker.com')).toBe(false);
    expect(allows('https://yuva-polyprint-x.vercel.app.attacker.com')).toBe(false);
    // A wildcard must not swallow a further subdomain either.
    expect(allows('https://yuva-polyprint-a.b.vercel.app')).toBe(false);
  });

  it('does not match another project on vercel.app', () => {
    const allows = createOriginMatcher([PROD, PREVIEWS]);

    expect(allows('https://someone-elses-app.vercel.app')).toBe(false);
    expect(allows('https://yuva-polyprintx.vercel.app')).toBe(false);
  });

  it('respects the scheme and rejects a downgrade', () => {
    const allows = createOriginMatcher([PROD, PREVIEWS]);

    expect(allows('http://yuva-polyprint.vercel.app')).toBe(false);
    expect(allows('http://yuva-polyprint-git-main-me.vercel.app')).toBe(false);
  });

  it('does not treat regex characters in a pattern as regex', () => {
    const allows = createOriginMatcher(['https://app.example.com']);

    // The dot is a literal, not "any character".
    expect(allows('https://appXexample.com')).toBe(false);
    expect(allows('https://app.example.com')).toBe(true);
  });

  it('keeps localhost working for development', () => {
    const allows = createOriginMatcher(['http://localhost:5173']);

    expect(allows('http://localhost:5173')).toBe(true);
    expect(allows('http://localhost:4173')).toBe(false);
  });

  it('allows nothing when the list is empty', () => {
    const allows = createOriginMatcher([]);

    expect(allows(PROD)).toBe(false);
  });
});
