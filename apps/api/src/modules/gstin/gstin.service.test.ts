import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/*
 * Enough environment to let the config module load, set before anything imports
 * it. Without this the suite depends on a .env file being present, which passes
 * on a developer's machine and fails in CI — a mistake this repo has made once
 * already.
 */
vi.stubEnv('DATABASE_URL', 'postgresql://test/test');
vi.stubEnv('NODE_ENV', 'test');
// Explicitly absent: the "not configured" branch is one of the things tested.
vi.stubEnv('GSTIN_API_KEY', '');

/*
 * Prisma is mocked so these run without a database — the cache is incidental to
 * what is being tested here, which is that a credit is never spent when it
 * cannot possibly buy anything. Both mocks are declared before the import
 * because the service reads `env` and `prisma` at module scope.
 */
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('../../lib/prisma.js', () => ({
  prisma: { appSetting: { findUnique, upsert } },
}));

const { lookupGstin } = await import('./gstin.service.js');

/** The works' own GSTIN — a real one, so it passes the offline check. */
const VALID = '27AIGPH5992Q1ZD';

describe('lookupGstin refuses, without calling the provider,', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    findUnique.mockReset();
    upsert.mockReset();
  });

  it('a GSTIN with a bad check digit', async () => {
    // The placeholder that lived in the PDF template. It reads like a GSTIN.
    await expect(lookupGstin('27ABCDE1234F1Z5')).rejects.toThrow(/typo/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a GSTIN of the wrong length', async () => {
    await expect(lookupGstin('27AIGPH5992Q1Z')).rejects.toThrow(/15 characters/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an impossible state code', async () => {
    await expect(lookupGstin('40AIGPH5992Q1ZD')).rejects.toThrow(/state code/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an empty one', async () => {
    await expect(lookupGstin('')).rejects.toThrow(/enter a gstin/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('and it never even reads the cache for one that cannot exist', async () => {
    await expect(lookupGstin('27ABCDE1234F1Z5')).rejects.toThrow();
    // The arithmetic settles it; there is nothing to look up.
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('lookupGstin caching', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    upsert.mockResolvedValue({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    findUnique.mockReset();
    upsert.mockReset();
  });

  it('answers from the cache without spending a credit', async () => {
    findUnique.mockResolvedValue({
      key: `gstin:${VALID}`,
      value: JSON.stringify({
        gstin: VALID,
        legalName: 'Yuva Polyprint & Packaging Industries',
        status: 'Active',
        natureOfBusiness: [],
        checkedAt: '2026-08-01T00:00:00.000Z',
        fromCache: false,
      }),
    });

    const result = await lookupGstin(VALID);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.legalName).toBe('Yuva Polyprint & Packaging Industries');
    // Flagged, so the caller can weigh how old an "Active" is.
    expect(result.fromCache).toBe(true);
    expect(result.checkedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('re-asks when the caller forces a refresh', async () => {
    findUnique.mockResolvedValue({
      key: `gstin:${VALID}`,
      value: JSON.stringify({ gstin: VALID, status: 'Active', natureOfBusiness: [] }),
    });

    // No key configured in the test environment, so the refresh path stops at
    // the configuration guard — which is itself the proof that it got past the
    // cache rather than being served from it.
    await expect(lookupGstin(VALID, true)).rejects.toThrow(/not configured|could not reach/i);
  });

  it('spends the credit again rather than failing on a corrupt cache entry', async () => {
    findUnique.mockResolvedValue({ key: `gstin:${VALID}`, value: 'not json' });

    await expect(lookupGstin(VALID)).rejects.toThrow(/not configured|could not reach/i);
  });
});
