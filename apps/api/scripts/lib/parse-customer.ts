/**
 * Parses the legacy "Comapny Name, Address & Mobile" column.
 *
 * That one spreadsheet column mixes company name, postal address and one or
 * more phone numbers, with no consistent separator. Formats in the May-2025
 * sheet include:
 *
 *   "Maharaja Atta, Hare Ram Agencies, Near Mali Boarding, ..., Mob. 7720046005"
 *   "Anupriya Agro Industries A/P Dhanori Tal Kopargaon Dist Ahmednagar Mb. 9545390337"
 *   "Bunty Food Products Add : At Post Kandali ... Mob No. 9975576723,7972530006."
 *   "Amrut Sanjivani ... Mob. (02423) 222394, 222044. 7620345065"
 *   "Sarthak Sonpapdi Sangamner"                        (name only, no phone)
 *
 * Strategy, in order:
 *   1. Split off the phone section at the first phone label (Mob/Mb/Contact/...).
 *      Only digits AFTER that label count as phone numbers, which is what stops
 *      pincodes ("422 113") and plot numbers ("Gat No 118", "83/1/1") being
 *      misread as mobiles.
 *   2. Split the remaining text into company name + address.
 *   3. Pull pincode, district, taluka and contact person out of what is left.
 *
 * Anything the heuristics cannot resolve confidently is returned with
 * `isVerified: false` so the office team can correct it inside the app.
 */

export const NA = 'NA';

export interface ParsedCustomer {
  companyName: string;
  contactPerson: string;
  address: string;
  city: string;
  district: string;
  pincode: string;
  mobile: string;
  altPhone: string;
  email: string;
  sourceRaw: string;
  isVerified: boolean;
}

/** Entries in the customer column that are not customers at all. */
const NOT_A_CUSTOMER = [/^both side v ?no?utch$/i, /^x+$/i, /^n\/?a\.?$/i, /^-+$/];

/** Where the phone section begins. */
const PHONE_LABEL =
  /\b(?:mob(?:ile)?|mb|contact|cont|ph|phone|tel|cell)\b\s*\.?\s*(?:no\.?|number)?\s*[.:-]?\s*/i;

/** Legal-entity suffixes that reliably end a company name. */
const LEGAL_SUFFIX =
  /^(.*?\b(?:pvt\.?\s*ltd\.?|private\s+limited|p\.?\s*ltd\.?|limited|ltd\.?|llp|foundation))/i;

/** Tokens that reliably mark the start of a postal address. */
const ADDRESS_MARKER =
  /\b(?:add\s*:|a\/p\b|at\.?\s*post\.?|at\s+post|gat\s+no|plot\s+no|sr\s+no|r\s+no|survey\s+no|near\b|opp\.?\b|behind\b|midc\b|road\b|marg\b|chowk\b|nagar\b|wadi\b|mala\b|tal\.?\b|dist\.?\b|taluka\b|district\b|state\s+highway)/i;

const CONTACT_PERSON =
  /\b(?:mr\.?|mrs\.?|ms\.?|shri\.?|smt\.?)\s+([A-Za-z][A-Za-z.\s]{2,40}?)(?=,|\.|$|\s+mob|\s+mb)/i;

const DISTRICT =
  /\bdist(?:rict)?\.?\s*[:-]?\s*([A-Za-z'\s]{3,30}?)(?=\s*(?:,|\.|\d|$|mob|mb\b|pin))/i;
const TALUKA = /\btal(?:uka)?\.?\s*[:-]?\s*([A-Za-z'\s]{3,30}?)(?=\s*(?:,|\.|\d|$|dist|mob|mb\b))/i;

/** Six-digit Indian pincode, tolerating "422 113", "-414001", "Pin code411033". */
const PINCODE = /\b(?:pin\s*(?:code)?\s*)?(\d{3}\s?\d{3})\b/i;

/** A pincode written inside the phone section, e.g. "Mob No 9922054143. Pin code411033". */
const PINCODE_IN_PHONES = /\bpin\s*(?:code)?\s*:?\s*\d{3}\s?\d{3}\b/gi;

/** State names that trail a district and should not be part of it. */
const TRAILING_STATE = /\s+(?:maharashtra|gujarat|karnataka|india)\s*$/i;

function tidy(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\s,;.-]+$/, '')
    .replace(/^[\s,;.-]+/, '')
    .trim();
}

function orNA(value: string): string {
  const cleaned = tidy(value);
  return cleaned.length > 0 ? cleaned : NA;
}

/** True for a plausible Indian mobile number. */
function isMobile(digits: string): boolean {
  return digits.length === 10 && /^[6-9]/.test(digits);
}

interface PhoneSplit {
  mobile: string;
  altPhone: string;
  /** The text with the phone section removed. */
  remainder: string;
  hadPhoneSection: boolean;
}

function extractPhones(raw: string): PhoneSplit {
  const match = PHONE_LABEL.exec(raw);
  if (!match || match.index === undefined) {
    return { mobile: NA, altPhone: NA, remainder: raw, hadPhoneSection: false };
  }

  const remainder = raw.slice(0, match.index);
  // A pincode sometimes trails the phone number ("... 9922054143. Pin code411033").
  // Strip it before reading digits, or it becomes a phantom second phone.
  const phoneSection = raw.slice(match.index).replace(PINCODE_IN_PHONES, ' ');

  // Read each whitespace/comma-separated token separately, so "(02423) 222394"
  // yields the STD code and the number as two values rather than one merged
  // 11-digit string, and "9975576723,7972530006" yields two mobiles.
  const numbers = phoneSection
    .split(/[\s,;/]+/)
    .map((token) => token.replace(/\D/g, ''))
    .filter((digits) => digits.length >= 6);

  // A leading 0 or 91 country code is noise on an otherwise valid mobile.
  const normalised = numbers.map((digits) => {
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
  });

  const unique = [...new Set(normalised)];
  const mobiles = unique.filter(isMobile);
  const others = unique.filter((digits) => !isMobile(digits));

  return {
    mobile: mobiles[0] ?? NA,
    altPhone: [...mobiles.slice(1), ...others].join(', ') || NA,
    remainder,
    hadPhoneSection: true,
  };
}

interface NameSplit {
  companyName: string;
  address: string;
  confident: boolean;
}

function splitNameAndAddress(text: string): NameSplit {
  const cleaned = tidy(text);
  if (!cleaned) return { companyName: '', address: '', confident: false };

  // 1. A legal-entity suffix is the most reliable boundary.
  const legal = LEGAL_SUFFIX.exec(cleaned);
  const legalName = legal?.[1];
  if (legalName) {
    const name = tidy(legalName);
    // Guard against a suffix so late in the string that the "name" swallowed
    // the address.
    if (name.length <= 60) {
      return { companyName: name, address: tidy(cleaned.slice(legalName.length)), confident: true };
    }
  }

  // 2. Otherwise cut at the first address marker.
  const marker = ADDRESS_MARKER.exec(cleaned);
  if (marker?.index !== undefined && marker.index > 0) {
    const name = tidy(cleaned.slice(0, marker.index));
    if (name.length >= 3) {
      return { companyName: name, address: tidy(cleaned.slice(marker.index)), confident: true };
    }
  }

  // 3. No address signal at all — the whole string is the company name.
  return { companyName: cleaned, address: '', confident: false };
}

/**
 * Records the heuristics get wrong, corrected explicitly. Keyed by the exact
 * source string so an override is auditable and cannot silently start matching
 * a different record.
 */
const OVERRIDES: Record<string, Partial<ParsedCustomer>> = {
  // Indian place names ("Hari Om Nagar", "Walekar Wadi", "Swatantrya Chowk")
  // end in a word that also marks the start of an address, so a generic rule
  // either truncates the company name or swallows the address. These eight are
  // split by hand rather than by a regex that would still be wrong.
  'Sanvi Agro Foods and Flour Mill Baratoti Karanja, Maliwada, Ahmednagar-414001, Mob No. 9423699934':
    {
      companyName: 'Sanvi Agro Foods and Flour Mill',
      address: 'Baratoti Karanja, Maliwada, Ahmednagar-414001',
    },
  'Samant Foods Hari Om Nagar 83/1/1, Peth Road Panchavati, Nashik- 422003, Mob No. 9890605665.': {
    companyName: 'Samant Foods',
    address: 'Hari Om Nagar 83/1/1, Peth Road Panchavati, Nashik- 422003',
  },
  'Shree N P Foods Naikwadi Automobiles Devthan Road Akole Ahmednagar Mb 9767375858': {
    companyName: 'Shree N P Foods',
    address: 'Naikwadi Automobiles, Devthan Road, Akole, Ahmednagar',
  },
  'Radhey Enterprises Walekar Wadi, Chinchwad, Pune 33, Mob No. 9922054143. Pin code411033': {
    companyName: 'Radhey Enterprises',
    address: 'Walekar Wadi, Chinchwad, Pune 33',
  },
  'Shree Plastic 199-A AMI Apartment Plot No. 6, Mahatma Nagar Nashik - 7 Mb No. 9422234926': {
    companyName: 'Shree Plastic',
    address: '199-A AMI Apartment, Plot No. 6, Mahatma Nagar, Nashik - 7',
  },
  'Subhash Pandurang Kothmire 1602, Swatantrya Chowk Sangamner Ahmednagar Maharashtra Mob No. 9561111585':
    {
      companyName: 'Subhash Pandurang Kothmire',
      address: '1602, Swatantrya Chowk, Sangamner, Ahmednagar, Maharashtra',
    },
  'Maharaja Atta, Hare Ram Agencies, Near Mali Boarding, Court Road, Kopargaon, Tal. Kopargaon, Dist. Ahilyanagar, Mob. 7720046005':
    {
      companyName: 'Maharaja Atta (Hare Ram Agencies)',
      address: 'Near Mali Boarding, Court Road, Kopargaon, Tal. Kopargaon, Dist. Ahilyanagar',
    },
  'Sarthak Sonpapdi Sangamner': {
    companyName: 'Sarthak Sonpapdi',
    address: 'Sangamner',
    city: 'Sangamner',
  },
};

export function parseCustomer(raw: string): ParsedCustomer | null {
  const source = raw.trim();
  if (!source) return null;
  if (NOT_A_CUSTOMER.some((pattern) => pattern.test(source))) return null;
  // A single stray character is a typo, not a customer.
  if (source.replace(/[^A-Za-z]/g, '').length < 2) return null;

  const phones = extractPhones(source);
  const { companyName, address, confident } = splitNameAndAddress(phones.remainder);

  const districtMatch = DISTRICT.exec(source);
  const talukaMatch = TALUKA.exec(source);

  // "Shri Naresh Raut Foundation" opens with an honorific that is part of the
  // company name, not a contact person. A real contact never starts the string.
  const contactCandidate = CONTACT_PERSON.exec(source);
  const contactMatch = contactCandidate?.index === 0 ? null : contactCandidate;
  // Look for the pincode only in the non-phone half, so a phone number can
  // never be mistaken for one.
  const pincodeMatch = PINCODE.exec(phones.remainder);

  const parsed: ParsedCustomer = {
    companyName: orNA(companyName),
    contactPerson: orNA(contactMatch?.[1] ?? ''),
    address: orNA(address),
    city: orNA(talukaMatch?.[1] ?? ''),
    district: orNA((districtMatch?.[1] ?? '').replace(TRAILING_STATE, '')),
    pincode: pincodeMatch?.[1] ? pincodeMatch[1].replace(/\s/g, '') : NA,
    mobile: phones.mobile,
    altPhone: phones.altPhone,
    // The sheet contains no email addresses at all.
    email: NA,
    sourceRaw: source,
    isVerified: false,
  };

  const override = OVERRIDES[source];
  if (override) Object.assign(parsed, override);

  // "Verified" means: the name/address split used a reliable signal (or a
  // hand-checked override) AND name, address and mobile are all present.
  // Anything else is surfaced in the app for the office team to complete.
  parsed.isVerified =
    (confident || Boolean(override)) &&
    parsed.companyName !== NA &&
    parsed.address !== NA &&
    parsed.mobile !== NA;

  return parsed;
}
