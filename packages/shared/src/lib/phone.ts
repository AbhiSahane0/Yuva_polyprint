/**
 * Indian mobile numbers, as the office has them and as WhatsApp needs them.
 *
 * The two are not the same. The customer master holds numbers the way somebody
 * typed them into a spreadsheet — `9545390337`, and in one row a pair of
 * landlines in a single cell — while WhatsApp addresses a handset by its full
 * international number and nothing else. Normalising in one place means the
 * number shown on screen, the number stored against a send and the number a
 * message is eventually addressed to are the same number.
 *
 * Only mobiles. A landline cannot receive a WhatsApp message, so accepting one
 * would store a number that can never be delivered to and give the office no
 * reason to doubt it until the message silently fails months later.
 */

/** India. The works quotes domestically; a second country would be a decision, not a default. */
export const DEFAULT_DIALLING_CODE = '91';

/**
 * A mobile number in the form WhatsApp addresses: `+919545390337`.
 *
 * Null when it is not a mobile this can be sure of. Accepts the shapes the
 * office actually types — with or without `+91`, with a leading zero, spaced or
 * dashed — and rejects everything else rather than guessing, because a
 * plausible-looking wrong number is worse than a rejected one.
 */
export function normaliseMobile(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  // 'NA' is the importer's placeholder for a blank cell, not a number.
  if (trimmed === '' || trimmed.toUpperCase() === 'NA') return null;

  // A cell holding two numbers is not one number. The importer left at least one
  // of these behind — splitting it here would silently pick one of the pair.
  if (/[,;/]/.test(trimmed)) return null;

  const digits = trimmed.replace(/[\s()\-.]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;

  // Strip whichever prefix is present: a country code, a trunk zero, or both.
  let national = digits;
  if (national.startsWith(DEFAULT_DIALLING_CODE) && national.length > 10) {
    national = national.slice(DEFAULT_DIALLING_CODE.length);
  }
  if (national.startsWith('0')) national = national.slice(1);

  // Indian mobile numbers are ten digits and begin 6, 7, 8 or 9. Landlines and
  // short codes do not, and cannot receive a WhatsApp message.
  if (!/^[6-9]\d{9}$/.test(national)) return null;

  return `+${DEFAULT_DIALLING_CODE}${national}`;
}

/** Whether this is a mobile a message could be addressed to. */
export function isMobile(value: string | null | undefined): boolean {
  return normaliseMobile(value) !== null;
}

/**
 * The same number, spaced the way it is read aloud: `+91 95453 90337`.
 *
 * For showing on screen only. What is stored and sent is always the compact
 * form, so the two can never drift apart.
 */
export function formatMobile(value: string | null | undefined): string {
  const normalised = normaliseMobile(value);
  if (!normalised) return (value ?? '').trim();
  const national = normalised.slice(3);
  return `+${DEFAULT_DIALLING_CODE} ${national.slice(0, 5)} ${national.slice(5)}`;
}

/**
 * Every mobile in a pasted or typed string, de-duplicated and in order.
 *
 * One paste can carry several numbers, and the office pastes from wherever the
 * enquiry arrived. Splitting on the usual separators and normalising each is
 * what makes "9545390337, 7720046005" two chips rather than one rejection.
 */
export function collectMobiles(value: string): { valid: string[]; invalid: string[] } {
  const parts = value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const normalised = normaliseMobile(part);
    if (normalised) valid.push(normalised);
    else invalid.push(part);
  }
  return { valid: [...new Set(valid)], invalid };
}
