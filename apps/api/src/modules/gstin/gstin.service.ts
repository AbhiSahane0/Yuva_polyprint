import { checkGstin, type GstinLookup } from '@yuva/shared';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { ApiError } from '../../utils/api-error.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Looking a GSTIN up against the registry.
 *
 * Two rules shape everything here.
 *
 * **The offline check runs first.** A GSTIN that fails its own check digit
 * cannot have been issued, so asking about it wastes a paid credit to be told
 * something arithmetic already knew. See `checkGstin` in `@yuva/shared`.
 *
 * **Every answer is cached, permanently, by GSTIN.** A legal name and a
 * registered address do not change; a credit spent on one should never be spent
 * again. The single exception is the registration's status, which genuinely
 * does change — a cache hit reports how old it is so the caller can decide
 * whether that matters. It does not, for a quotation. It does for an invoice.
 */

/** How the provider answers. Their fields, before we make them ours. */
interface ProviderResponse {
  gstin?: string;
  legal_name?: string | null;
  trade_name?: string | null;
  status?: string | null;
  taxpayer_type?: string | null;
  constitution?: string | null;
  registration_date?: string | null;
  address?: string | null;
  building?: string | null;
  street?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  nature_of_business?: string[] | null;
  centre_jurisdiction?: string | null;
  state_jurisdiction?: string | null;
  /** Set by some providers instead of an HTTP error when nothing is found. */
  valid?: boolean;
  /**
   * This provider names its failure field `error` and adds a `fix`; others use
   * `message`. Both are read so a provider swap does not silently lose the one
   * sentence that says what actually went wrong.
   */
  error?: string | null;
  message?: string | null;
}

/*
 * The provider's contract, in one place.
 *
 * Documented as `GET /v1/gstin/:gstin` with the key in an `x-api-key` header.
 * If the office moves to another provider, this constant and `toLookup` below
 * are the only two things that change — nothing above them knows who answers.
 */
const BASE_URL = env.GSTIN_API_BASE_URL;
const TIMEOUT_MS = 10_000;

/**
 * The provider's answer, in our vocabulary.
 *
 * Kept deliberately small and separate from the fetch, because it is the one
 * piece here that has to be checked against a real response rather than a
 * document. Every field is optional on the way in and null on the way out, so
 * a provider that names something differently degrades to a missing field
 * rather than to a crash.
 */
function toLookup(gstin: string, body: ProviderResponse): GstinLookup {
  const text = (value: string | null | undefined): string | null => {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  // Some providers return the address whole, some in parts, some both. Prefer
  // the parts — they are what the customer form actually needs — and fall back
  // to the single line rather than showing nothing.
  const parts = [body.building, body.street].map(text).filter(Boolean);
  const addressLine = parts.length > 0 ? parts.join(', ') : text(body.address);

  return {
    gstin,
    legalName: text(body.legal_name),
    tradeName: text(body.trade_name),
    status: text(body.status),
    taxpayerType: text(body.taxpayer_type),
    constitution: text(body.constitution),
    registrationDate: text(body.registration_date),
    address: addressLine,
    city: text(body.city),
    district: text(body.district),
    state: text(body.state),
    pincode: text(body.pincode),
    natureOfBusiness: body.nature_of_business ?? [],
    centreJurisdiction: text(body.centre_jurisdiction),
    stateJurisdiction: text(body.state_jurisdiction),
    checkedAt: new Date().toISOString(),
    fromCache: false,
  };
}

/** Reads a previous answer, if this GSTIN has ever been looked up. */
async function readCache(gstin: string): Promise<GstinLookup | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: cacheKey(gstin) } });
  if (!row) return null;

  try {
    return { ...(JSON.parse(row.value) as GstinLookup), fromCache: true };
  } catch {
    // A corrupt cache entry is not worth failing over — spend the credit again.
    logger.warn({ gstin }, 'Discarding an unreadable GSTIN cache entry');
    return null;
  }
}

const cacheKey = (gstin: string): string => `gstin:${gstin}`;

/**
 * Everything the registry knows about one GSTIN.
 *
 * `force` re-asks even when the answer is cached, which is what a "check it is
 * still active" action needs and what ordinary form use must never do.
 */
export async function lookupGstin(input: string, force = false): Promise<GstinLookup> {
  const check = checkGstin(input);

  /*
   * Refused before any credit is spent. The message is the offline one, which
   * says what is actually wrong with the number rather than "not found" — a
   * transposed digit and an unregistered business need different things done
   * about them.
   */
  if (!check.valid) {
    throw ApiError.badRequest(check.problem === 'EMPTY' ? 'Enter a GSTIN' : check.message);
  }

  const gstin = check.normalized;

  if (!force) {
    const cached = await readCache(gstin);
    if (cached) return cached;
  }

  if (!env.GSTIN_API_KEY) {
    throw ApiError.serviceUnavailable(
      'GSTIN lookup is not configured on this server. The offline format check still applies.',
    );
  }

  // AbortSignal.timeout rather than a bare fetch: a provider that hangs would
  // otherwise hold an Express handler open until the socket gave up.
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1/gstin/${gstin}`, {
      method: 'GET',
      headers: { 'x-api-key': env.GSTIN_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    logger.error({ err: cause, gstin }, 'GSTIN lookup could not reach the provider');
    throw ApiError.serviceUnavailable('Could not reach the GSTIN service. Try again shortly.');
  }

  if (response.status === 404) {
    throw ApiError.notFound('No registration found for that GSTIN');
  }

  if (response.status === 401 || response.status === 403) {
    // Worth separating from a generic failure: this one is fixed by an
    // administrator, not by retrying, and the office cannot tell that apart.
    logger.error({ status: response.status }, 'GSTIN provider rejected the API key');
    throw ApiError.serviceUnavailable(
      'The GSTIN service rejected our credentials. An administrator needs to check the key.',
    );
  }

  if (response.status === 402 || response.status === 429) {
    logger.error({ status: response.status }, 'GSTIN provider is out of credit or rate limiting');
    throw ApiError.serviceUnavailable(
      'The GSTIN service is out of credits or busy. The offline format check still applies.',
    );
  }

  if (!response.ok) {
    logger.error({ status: response.status }, 'GSTIN lookup failed');
    throw ApiError.serviceUnavailable('The GSTIN service did not answer. Try again shortly.');
  }

  const body = (await response.json()) as ProviderResponse;

  // A provider that answers 200 with `valid: false` rather than a 404.
  if (body.valid === false) {
    throw ApiError.notFound(body.error ?? body.message ?? 'No registration found for that GSTIN');
  }

  const lookup = toLookup(gstin, body);

  /*
   * Cached after the fact, and never allowed to fail the request: the office
   * has the answer they paid for either way, and a write that failed is a
   * reason to spend another credit later, not to lose this one now.
   */
  try {
    await prisma.appSetting.upsert({
      where: { key: cacheKey(gstin) },
      create: { key: cacheKey(gstin), value: JSON.stringify(lookup) },
      update: { value: JSON.stringify(lookup) },
    });
  } catch (cause) {
    logger.warn({ err: cause, gstin }, 'Could not cache a GSTIN lookup');
  }

  return lookup;
}
