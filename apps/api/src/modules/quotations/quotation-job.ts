import { JOB_KIND_LABELS, POUCH_TYPE_LABELS, type QuotationItem } from '@yuva/shared';

/**
 * A quotation line, as a row in the jobs table.
 *
 * Extracted because two paths now write jobs and they must not drift: the
 * office saves a new design as it steps through the wizard, and `recordOutcome`
 * still creates any that are missing when a quotation is won. Two copies of
 * this mapping would eventually disagree, and the symptom would be a job whose
 * recorded structure depends on which door it came through.
 *
 * The jobs table predates stated plies: it has three fixed slots, for the
 * printed ply, an optional metallised one, and the sealant. The line's plies map
 * onto them by position — outermost first, sealant last, anything between into
 * the middle. A four-ply laminate loses its third ply here, which is the jobs
 * table's limitation rather than the quotation's; the quotation keeps every ply.
 */
export function jobDataFromQuotationItem(item: QuotationItem) {
  const plies = [...item.layers].sort((a, b) => a.position - b.position);
  const outer = plies[0] ?? null;
  const middle = plies.length >= 3 ? plies[1] : null;
  const sealant = plies.length >= 2 ? plies[plies.length - 1] : null;

  return {
    jobName: item.jobName,
    // 0 means "not from the imported spreadsheet", the same marker the customer
    // editor uses for a job added by hand.
    sourceRow: 0,
    customerSource: 'EXPLICIT' as const,
    needsCustomer: false,
    // A roll has no pouch style; the jobs table predates the enum and stores
    // 'NA' for anything unknown.
    pouchType: item.pouchType ? POUCH_TYPE_LABELS[item.pouchType] : 'NA',
    jobType: JOB_KIND_LABELS[item.jobKind],
    layer: plies.length,
    petMicron: outer?.micron ?? null,
    metPetMicron: middle?.micron ?? null,
    polyMicron: sealant?.micron ?? 0,
    designOpenWidth: item.widthMm,
    designHeight: item.heightMm,
    totalCylinders: item.cylinderCount,
    /*
     * Zero GSM means the ply's material had no density recorded, in which case
     * the line was never costed and there is nothing truthful to store — null
     * says that, 0 would read as "weighs nothing".
     */
    petGsm: outer?.gsm || null,
    metPetGsm: middle?.gsm || null,
    polyGsm: sealant?.gsm || null,
    // The imported jobs table stores this as text, not a number.
    pouchesPerKg: String(item.pouchesPerKg),
  };
}
