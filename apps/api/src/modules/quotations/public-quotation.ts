import {
  POUCH_TYPE_LABELS,
  resolveSelectedQuantity,
  type PublicQuotation,
  type PublicQuotationItem,
  type PublicQuotationResponse,
  type Quotation,
  type QuotationItem,
} from '@yuva/shared';

/**
 * **What a customer holding a link is allowed to see.**
 *
 * Written out by hand, field by field, and that is the point of the file.
 *
 * The stored quotation carries the works' own working: `costPerPouch`,
 * `materialCost`, `marginPercent` on every line, the costing overrides that
 * produced them, and every quantity the office priced while deciding what to
 * offer. Serving the whole object and hiding three fields in the page would
 * put the works' margin in the browser of every customer who opens the network
 * tab — which is not a theoretical leak, it is one network tab.
 *
 * So the public shape is a different shape. A field reaches the customer
 * because somebody wrote it down here on purpose, and a field added to
 * `QuotationItem` next year reaches them only if somebody decides it should.
 *
 * **One quantity, not three.** The office prices two or three quantities side
 * by side and picks which one the customer is quoted; the others are its
 * working. The link shows the one that was sent, the same one the PDF prints.
 */

/** "Standup pouch 170 × 240 mm" — how the document words a line. */
function describe(item: QuotationItem): string {
  if (item.jobKind === 'ROLL') return 'Printed roll';
  if (item.pouchType === null) return 'Pouch';
  if (item.pouchType === 'OTHER') {
    return item.pouchTypeNote.trim() || 'Pouch';
  }
  return `${POUCH_TYPE_LABELS[item.pouchType]} pouch`;
}

/**
 * The tier the customer was quoted.
 *
 * The one they have already accepted if they have, otherwise the one the
 * office selected. Never the first by default: with the office choosing which
 * column is sent, falling back to the first would show a price that was never
 * offered.
 */
export function quotedTier(quotation: Quotation) {
  const won = quotation.tiers.find((tier) => tier.id === quotation.wonTierId);
  if (won) return won;

  const byPosition = [...quotation.tiers].sort((a, b) => a.position - b.position);
  const chosen = resolveSelectedQuantity(quotation.selectedQuantity, byPosition.length);
  return byPosition[chosen - 1] ?? byPosition[0] ?? null;
}

function publicItem(item: QuotationItem, tierPosition: number): PublicQuotationItem {
  /* The line's figures at the one quantity being quoted. A line with nothing
     at that position is priced at zero rather than left off: a job missing
     from the list the customer is agreeing to is worse than a job at nil. */
  const quantity = item.quantities.find((row) => row.position === tierPosition);

  return {
    position: item.position,
    jobName: item.jobName,
    description: describe(item),
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    micron: item.micron,
    colours: item.colours.length,
    quantityKg: quantity?.quantityKg ?? 0,
    ratePerKg: quantity?.ratePerKg ?? 0,
    quantityPouches: quantity?.quantityPouches ?? 0,
    ratePerPouch: quantity?.ratePerPouch ?? 0,
    totalAmount: quantity?.totalAmount ?? 0,
    pricingBasis: item.pricingBasis,
    /* What is charged, not what one would have cost. A repeat and a set the
       customer brought both come through as nothing, which is what the
       customer is being asked to agree to. */
    cylinderCost: item.totalCylinderCost,
  };
}

export function toPublicQuotation(
  quotation: Quotation,
  link: { expiresAt: Date },
  response: PublicQuotationResponse | null,
): PublicQuotation {
  const tier = quotedTier(quotation);

  return {
    number: quotation.number,
    version: quotation.version,
    date: quotation.date,
    customerName: quotation.customerName,
    title: quotation.title,

    items: quotation.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => publicItem(item, tier?.position ?? 1)),

    materialSubtotal: tier?.materialSubtotal ?? 0,
    cylinderSubtotal: tier?.cylinderSubtotal ?? 0,
    grandSubtotal: tier?.grandSubtotal ?? 0,
    grandWithGst: tier?.grandWithGst ?? 0,
    gstPercent: quotation.gstPercent,
    totalAdvance: tier?.totalAdvance ?? 0,

    terms: quotation.terms,
    notes: quotation.notes,

    expiresAt: link.expiresAt.toISOString(),
    response,
  };
}
