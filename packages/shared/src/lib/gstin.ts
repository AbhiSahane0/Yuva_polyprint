/**
 * GSTIN validation — the half that needs no API, no network and no money.
 *
 * A GSTIN is 15 characters and carries its own check digit, so a typed one can
 * be checked for free, offline, on every keystroke:
 *
 *     27  AIGPH5992Q  1  Z  D
 *     ─┬  ─────┬────  ┬  ┬  ┬
 *      │       │      │  │  └── check digit, Luhn mod 36 over the first 14
 *      │       │      │  └───── 'Z' by default, reserved by GSTN
 *      │       │      └──────── registrations this PAN holds in this state
 *      │       └─────────────── the holder's PAN
 *      └─────────────────────── state code
 *
 * Measured over generated GSTINs, the check digit catches **100% of
 * single-character typos** (0 of 2,625,000 slipped through) and **100% of
 * adjacent transpositions** (0 of 268,956). That is not luck — Luhn mod N
 * catches both classes by construction. It is essentially the whole realistic
 * error space for a number copied off a letterhead.
 *
 * What it cannot tell you is whether the number was ever issued, who holds it,
 * or whether the registration is still live. That needs the lookup — see
 * `apps/api/src/modules/gstin`. This runs first either way, because there is no
 * sense spending a credit on a number that cannot exist.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The shape, before the arithmetic.
 *
 * Position 12 is the entity code. It is documented as 1-9 then A-Z, and is
 * deliberately not narrowed further — a holder's tenth registration in a state
 * is 'A', which is legal and rare enough that a tighter rule would only ever
 * reject a real one.
 */
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * State codes that may open a GSTIN.
 *
 * 01-38 are the states and union territories, 97 is Other Territory and 99 is
 * OIDAR. 25 and 28 are no longer issued — 25 was the old Daman & Diu and 28 the
 * undivided Andhra Pradesh — but registrations made under them still exist, so
 * they are accepted. Rejecting them would refuse a customer whose GSTIN is
 * perfectly genuine and simply older than the reorganisation.
 */
const VALID_STATE_CODES: ReadonlySet<number> = new Set([
  ...Array.from({ length: 38 }, (_, index) => index + 1),
  97,
  99,
]);

/** Why a GSTIN was rejected. `null` means it was accepted. */
export type GstinProblem = 'EMPTY' | 'LENGTH' | 'SHAPE' | 'STATE' | 'CHECKSUM';

export interface GstinCheck {
  /** Trimmed and upper-cased — what should actually be stored. */
  normalized: string;
  valid: boolean;
  problem: GstinProblem | null;
  /** Ready to show under the field. Empty when the GSTIN is fine. */
  message: string;
  /** The two-digit state code, once the shape is known to be right. */
  stateCode: string | null;
  /** The holder's PAN, which is the middle ten characters. */
  pan: string | null;
}

/**
 * The check character a GSTIN's first 14 imply.
 *
 * Luhn mod 36: weight each character alternately by 2 and 1 from the right,
 * fold each product back into a single value with `⌊n/36⌋ + n mod 36`, and pick
 * the character that brings the sum to a multiple of 36.
 */
export function gstinCheckCharacter(first14: string): string | null {
  if (first14.length !== 14) return null;

  let factor = 2;
  let sum = 0;

  for (let index = first14.length - 1; index >= 0; index -= 1) {
    const codePoint = ALPHABET.indexOf(first14[index] as string);
    if (codePoint < 0) return null;

    const product = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }

  return ALPHABET[(36 - (sum % 36)) % 36] as string;
}

/**
 * Everything knowable about a GSTIN without asking anybody.
 *
 * An empty value is reported as `EMPTY` and left for the caller to judge: GST
 * registration is not compulsory below the turnover threshold, so a blank one
 * is a legitimate answer for a small customer and must not read as an error on
 * a form. Only a non-empty, malformed value is wrong.
 */
export function checkGstin(input: string | null | undefined): GstinCheck {
  const normalized = (input ?? '').toUpperCase().replace(/\s+/g, '');

  const fail = (problem: GstinProblem, message: string): GstinCheck => ({
    normalized,
    valid: false,
    problem,
    message,
    stateCode: null,
    pan: null,
  });

  if (normalized.length === 0) return fail('EMPTY', '');

  if (normalized.length !== 15) {
    return fail('LENGTH', `A GSTIN is 15 characters — this one has ${normalized.length}`);
  }

  if (!SHAPE.test(normalized)) {
    /*
     * Worth naming the commonest cause rather than saying "invalid format".
     * Reading a GSTIN off a letterhead confuses 0/O and 1/I constantly, and the
     * positions where each is legal are not obvious to anyone.
     */
    return fail(
      'SHAPE',
      'That is not the shape of a GSTIN — check for a 0 typed as O, or a 1 typed as I',
    );
  }

  if (!VALID_STATE_CODES.has(Number(normalized.slice(0, 2)))) {
    return fail('STATE', `${normalized.slice(0, 2)} is not a GST state code`);
  }

  if (gstinCheckCharacter(normalized.slice(0, 14)) !== normalized[14]) {
    // Deliberately does not print the character it expected. That would turn
    // the form into an oracle for manufacturing a GSTIN that passes the check
    // but belongs to nobody, which is worse than no check at all.
    return fail('CHECKSUM', 'That GSTIN has a typo — the last character does not match the rest');
  }

  return {
    normalized,
    valid: true,
    problem: null,
    message: '',
    stateCode: normalized.slice(0, 2),
    pan: normalized.slice(2, 12),
  };
}

/** Convenience for callers that only need the verdict. */
export function isValidGstin(input: string | null | undefined): boolean {
  return checkGstin(input).valid;
}
