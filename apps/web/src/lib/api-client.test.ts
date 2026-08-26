import { describe, expect, it } from 'vitest';
import { joinApiUrl } from './api-client';

/*
 * These lock the bug that took the quotation PDF down in production: the URL
 * was written as a literal "/api/..." instead of being built from the
 * configured base, so it worked against the Vite dev proxy and 404'd against
 * the frontend's own domain once the client pointed at another host.
 */
describe('joinApiUrl', () => {
  it('builds a same-origin path when the API is proxied', () => {
    expect(joinApiUrl('/api', '/quotations/abc/pdf')).toBe('/api/quotations/abc/pdf');
  });

  it('builds an absolute URL when the client points at another host', () => {
    expect(joinApiUrl('https://yuva-polyprint.onrender.com/api', '/quotations/abc/pdf')).toBe(
      'https://yuva-polyprint.onrender.com/api/quotations/abc/pdf',
    );
  });

  it('keeps the query string intact', () => {
    expect(joinApiUrl('https://api.example.com/api', '/quotations/abc/pdf?inline=1')).toBe(
      'https://api.example.com/api/quotations/abc/pdf?inline=1',
    );
  });

  it('does not double the slash when the base has a trailing one', () => {
    expect(joinApiUrl('/api/', '/quotations')).toBe('/api/quotations');
    expect(joinApiUrl('https://api.example.com/api///', '/quotations')).toBe(
      'https://api.example.com/api/quotations',
    );
  });

  it('accepts a path with no leading slash', () => {
    expect(joinApiUrl('/api', 'quotations')).toBe('/api/quotations');
  });

  it('never yields a protocol-relative URL from a doubled slash', () => {
    // "//host/path" would be read as a URL on another origin entirely.
    expect(joinApiUrl('/api/', '/x')).not.toContain('//x');
  });
});
