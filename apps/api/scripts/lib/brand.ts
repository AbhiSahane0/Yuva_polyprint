/**
 * Recovers the customer for jobs whose customer column was left blank.
 *
 * The May-2025 sheet names a customer on only 73 of 415 job rows — whoever
 * maintained it filled the column for roughly the first 50 jobs and then
 * stopped. The customers still exist, but for most jobs the only trace of them
 * is the brand name at the front of the job name ("Radhey Murmura 500gm.",
 * "Humza Okra 900gm Zipper Pouch").
 *
 * Resolution runs in confidence order; the first pass that matches wins:
 *
 *   1. EXPLICIT  — the row names a customer. Always authoritative.
 *   2. LEARNED   — the job's brand token was seen on an explicit row
 *                  ("Kothmire ..." -> Subhash Pandurang Kothmire).
 *   3. BY NAME   — the brand token appears in a known customer's company name
 *                  ("Malpani Lime Massage" -> the existing Malpani record).
 *   4. PROVISIONAL — the token recurs across 2+ jobs and is a plausible brand,
 *                  so a customer record is created from it with 'NA' contact
 *                  details for the office team to complete.
 *   5. NONE      — flagged for manual assignment rather than guessed at.
 */

/** Words that start a job name but are never a customer. */
const NOT_A_BRAND = new Set([
  'plain',
  'pocket',
  'ice',
  'mava',
  'mawa',
  'chocobar',
  'panjabi',
  'dairy',
  'cheese',
  'garlic',
  'good',
  'quality',
  'plant',
  'power',
  'sample',
  'test',
  'blank',
  'outer',
  'inner',
  'roll',
  'pouch',
  'job',
  'new',
  'old',
  'small',
  'medium',
  'large',
  'open',
  'massage',
  'set',
  'mix',
  'super',
  'premium',
  'special',
  'sp',
]);

/**
 * Spelling variants of the same brand, collapsed onto one token so a single
 * customer is created instead of two. Left-hand side is what appears in the
 * sheet; right-hand side is the token kept.
 */
const BRAND_ALIASES: Record<string, string> = {
  greentop: 'green',
  mehak: 'mahek',
  shrishkalp: 'shrish',
  nawale: 'navale',
};

/** Display names for provisional customers, where the token alone reads badly. */
const BRAND_DISPLAY_NAMES: Record<string, string> = {
  green: 'Green Top',
  sai: 'Sai Foods',
  b: 'B (unidentified)',
};

/** The leading word of a job name, normalised. Empty when there is none. */
export function brandToken(jobName: string): string {
  const words = jobName
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0]?.toLowerCase() ?? '';
  return BRAND_ALIASES[first] ?? first;
}

/** Could this token reasonably name a customer? */
export function isPlausibleBrand(token: string): boolean {
  return token.length >= 3 && !NOT_A_BRAND.has(token);
}

/** Title-cased display name for a provisional customer built from a token. */
export function brandDisplayName(token: string): string {
  return BRAND_DISPLAY_NAMES[token] ?? token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Words that appear in many company names and so identify nobody.
 * Used when scanning a whole job name for a customer reference.
 */
const GENERIC_COMPANY_WORDS = new Set([
  'foods',
  'food',
  'agro',
  'industries',
  'industry',
  'enterprises',
  'enterprise',
  'products',
  'product',
  'limited',
  'private',
  'company',
  'traders',
  'trading',
  'group',
  'udyog',
  'gruha',
  'mahila',
  'shree',
  'shri',
  'sons',
  'chemical',
  'chemicals',
  'juice',
  'fertilizers',
  'sugarcane',
  'plastic',
  'packaging',
  'atta',
  'kulfi',
  'mawa',
  'dudh',
  'flour',
  'mill',
  'sweets',
  'masale',
  'pouch',
  'roll',
]);

/**
 * Builds a lookup of distinctive word -> company name, keeping only words that
 * identify exactly one customer. Lets "585mm Plain Roll(Food and Inns)" and
 * "Malpani Lime Massage" attach to the right existing customer even though
 * their leading word is not the brand.
 */
export function buildDistinctiveIndex(companyNames: string[]): Map<string, string> {
  const owners = new Map<string, Set<string>>();

  for (const name of companyNames) {
    const words = name
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !GENERIC_COMPANY_WORDS.has(word));

    for (const word of new Set(words)) {
      const set = owners.get(word) ?? new Set<string>();
      set.add(name);
      owners.set(word, set);
    }
  }

  const index = new Map<string, string>();
  for (const [word, set] of owners) {
    const only = [...set][0];
    if (set.size === 1 && only) index.set(word, only);
  }
  return index;
}

/** Finds a customer referenced anywhere in a job name, or null. */
export function findCustomerInJobName(jobName: string, index: Map<string, string>): string | null {
  const words = jobName
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    const owner = index.get(word);
    if (owner) return owner;
  }
  return null;
}
