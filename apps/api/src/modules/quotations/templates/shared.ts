import {
  formatNumber,
  formatRs,
  POUCH_TYPE_LABELS,
  resolveSelectedQuantity,
  type Quotation,
  type QuotationItem,
  type QuotationItemQuantity,
  type QuotationTier,
} from '@yuva/shared';

/** Escapes user-supplied text — every one of these strings is rendered as HTML. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hides the 'NA' placeholders the imported data is full of. */
export function show(value: string | null | undefined): string {
  return !value || value === 'NA' ? '' : value;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 15 Sep 2026 — a date a customer reads, not one a database sorts. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/**
 * The one quantity the customer is quoted.
 *
 * A job may be priced at two or three while the office decides what to charge,
 * but that is working and not an offer — printing all of them turns one price
 * into a menu and invites the customer to negotiate against the office's own
 * arithmetic.
 */
export function quotedTier(quotation: Quotation): QuotationTier | null {
  const tiers = [...quotation.tiers].sort((a, b) => a.position - b.position);
  if (tiers.length === 0) return null;
  const chosen = resolveSelectedQuantity(quotation.selectedQuantity, tiers.length);
  return tiers[chosen - 1] ?? tiers[0] ?? null;
}

/** What a line was quoted at, for the quantity the document carries. */
export function quantityOf(item: QuotationItem, position: number): QuotationItemQuantity | null {
  return item.quantities.find((q) => q.position === position) ?? item.quantities[0] ?? null;
}

/**
 * The structure, as a customer would say it: `PET 12µ + W/O Poly 50µ`.
 *
 * The plies are what a buyer compares between suppliers, and the printed
 * original buried them in a "Layer" column holding the count. A laminate
 * described as "2" says nothing anybody can price against.
 */
export function structureOf(item: QuotationItem): string {
  return [...item.layers]
    .sort((a, b) => a.position - b.position)
    .map((layer) => `${filmName(layer.materialName)} ${formatNumber(layer.micron, 0)}µ`)
    .join(' + ');
}

/**
 * A film's name without the gauge the catalogue carries in it.
 *
 * The rates list names a film by its gauge — "PET 12µm", "W/O Poly 110µm" —
 * because that is how it is bought, and a quotation ply then states the gauge
 * it actually uses. Printing both gives "PET 12µm 12µ" at best and "W/O Poly
 * 110µm 50µ" at worst, which tells the customer their 50 micron poly is 110.
 *
 * The PLY's micron is the truth: a works quoting an unstocked gauge keeps the
 * catalogue film and types the thickness on the line. So the name loses its
 * gauge and the ply supplies it.
 */
export function filmName(name: string): string {
  return name
    .replace(/\s*\d+(\.\d+)?\s*(µm?|microns?|mic)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * `Cyan · Magenta · Yellow · Black + 2 special colours`.
 *
 * Several specials are counted rather than repeated: printing the same two
 * words three times in a row reads as a mistake, not as three stations.
 */
export function coloursOf(item: QuotationItem): string {
  const ordered = [...item.colours].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return '';

  const process = ordered.filter((c) => c.kind === 'PROCESS').map((c) => c.name);
  const specials = ordered.length - process.length;

  const named = process.join(' · ');
  if (specials === 0) return named;
  const tail = `${specials} special colour${specials === 1 ? '' : 's'}`;
  return named ? `${named} + ${tail}` : tail;
}

/** The whole order, in both units, because the works sells by one and buys by the other. */
export function orderedText(item: QuotationItem, q: QuotationItemQuantity | null): string {
  if (!q) return '';
  const kg = `${formatNumber(q.quantityKg, 2)} kg`;
  return item.jobKind === 'ROLL'
    ? kg
    : `${kg} &nbsp;·&nbsp; ${formatNumber(q.totalPouches)} pouches`;
}

/** The rate per kilogram, with the per-pouch figure beside it where there is one. */
export function rateText(item: QuotationItem, q: QuotationItemQuantity | null): string {
  if (!q) return '';
  const perKg = `${formatRs(q.ratePerKg, 2)}/kg`;
  if (item.jobKind === 'ROLL' || q.costPerPouch <= 0) return perKg;
  return `${perKg} &nbsp;·&nbsp; ${formatRs(q.costPerPouch, 2)}/pouch`;
}

/** Transport is folded into the cylinder total, which a customer will check. */
export function transportTotal(quotation: Quotation): number {
  return quotation.items.reduce((sum, item) => sum + item.transportCost, 0);
}

/** Whether any line on the document is charged for its cylinders. */
export function chargesCylinders(quotation: Quotation): boolean {
  return quotation.items.some((item) => item.chargeCylinders && item.totalCylinderCost > 0);
}

/**
 * A mobile as a person writes it: `+91 99999 99999`.
 *
 * The office types ten digits into the box and the document printed all ten in
 * a row. That is a database field on a letterhead — nobody reads a phone number
 * in one block, and a customer checking whether the number is theirs has to
 * count digits. Anything that is not a plain Indian mobile is left exactly as
 * typed: a landline with an STD code, a number with an extension, and a second
 * number after a slash are all real things the office writes here, and none of
 * them is improved by a guess.
 */
export function phone(value: string | null | undefined): string {
  const raw = show(value).trim();
  const digits = raw.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits) && !/[a-zA-Z/,]/.test(raw)) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (/^91[6-9]\d{9}$/.test(digits) && !/[a-zA-Z/,]/.test(raw)) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return raw;
}

/** `Standup zipper pouch` or `Printed roll` — what the line actually is. */
export function styleOf(item: QuotationItem): string {
  if (item.jobKind === 'ROLL') return 'Printed roll';
  if (item.pouchType === 'OTHER') return show(item.pouchTypeNote) || 'Pouch';
  if (!item.pouchType) return 'Pouch';
  const label = POUCH_TYPE_LABELS[item.pouchType];
  return /pouch/i.test(label) ? label : `${label} pouch`;
}

/**
 * The terms, without the same sentence twice.
 *
 * The document has always carried its own cylinder sentence, because the
 * one-time-charge rule is the single thing customers query and it deserves
 * plain words. But the works also keeps a standing list of terms, and that list
 * already says "Cylinder charges are one-time and reusable for repeat orders".
 * Printing both puts two versions of one rule three lines apart, and a customer
 * who reads them carefully starts looking for the difference between them.
 *
 * So the written-in sentence yields to the office's own wherever the office has
 * covered it. The other direction never yields: when the cylinders are NOT
 * charged, no standing term says so, and that is worth a line of its own.
 */
export function termLines(quotation: Quotation, cylinders: boolean): string[] {
  const own = quotation.terms.map((term) => esc(term));
  if (!cylinders) {
    return [
      '<b>No cylinder charge on this order.</b> The cylinders for this design are already with us from an earlier job.',
      ...own,
    ];
  }
  if (quotation.terms.some((term) => /cylinder/i.test(term))) return own;
  return [
    '<b>Cylinders are charged once.</b> They stay with us, and a repeat order of the same design carries no cylinder charge.',
    ...own,
  ];
}
