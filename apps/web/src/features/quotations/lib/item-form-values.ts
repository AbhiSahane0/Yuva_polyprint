import type { CreateQuotationFormValues, Quotation } from '@yuva/shared';

/**
 * **A saved line, as the form holds it.**
 *
 * Opening a draft to edit means copying every field of every line out of the
 * stored document and into the form. That copy is the whole of this file, and
 * it is here rather than inline in the reset for one reason: **a field left
 * out of it is not a blank box, it is a silent edit.** The form opens without
 * the field, the office saves something unrelated, and the save writes the
 * form's idea of the line — missing field and all — back over the document.
 *
 * It has gone wrong three times, each time the same way and each time only
 * noticed from the outside:
 *
 * - `wastagePercent` came back blank, so saving anything at all repriced the
 *   document on the works' wastage instead of its own.
 * - `pricingBasis` was re-derived from the style, so a standup pouch sold by
 *   the kilogram flipped to per-piece on any patch that did not resend lines.
 * - `colours`, `hasDPunch` and `hasVNotch` were missing outright. A quotation
 *   written in CMYK reopened with no colours chosen — and then, because the
 *   structure asks for a white base, with a single white special. One colour,
 *   one cylinder, one station, on a document sold with four. Saving made it
 *   true. The punch tick went the same way, taking the pouch's making rate,
 *   its wastage and its ink laydown with it.
 *
 * So the copy is tested against the schema rather than read over: anything
 * `quotationItemSchema` accepts must appear here, and a new field fails that
 * test on the day it is added rather than on the day a quotation is wrong.
 */
export function itemFormValues(
  item: Quotation['items'][number],
): CreateQuotationFormValues['items'][number] {
  return {
    id: item.id,
    jobId: item.jobId,
    jobName: item.jobName,
    jobKind: item.jobKind,
    pouchType: item.pouchType,
    pouchTypeNote: item.pouchTypeNote,
    /*
     * Taken from the stored line, not re-derived: a quotation sold by the
     * kilogram must not silently become a per-piece one on reopening.
     */
    pricingBasis: item.pricingBasis,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    isGazette: item.isGazette,
    gazetteBottom: item.gazetteBottom,
    gazetteLeft: item.gazetteLeft,
    gazetteRight: item.gazetteRight,
    /*
     * The two finishing ticks.
     *
     * The punch is not cosmetic: it decides the pouch's making rate, pulls the
     * line onto the pouch workbook's wastage and ink laydown, and is the one
     * thing that tells a three side seal from a punched one. Losing it on
     * reopening repriced the line and nothing on the screen said so.
     */
    hasDPunch: item.hasDPunch,
    hasVNotch: item.hasVNotch,
    layers: item.layers.map((layer) => ({
      materialId: layer.materialId,
      micron: layer.micron,
      /*
       * A rate that was typed goes back in the box; one that came from the
       * film does not.
       *
       * The server says which it was — the ply stores it. It used to be
       * deduced from the ply quoting a gauge the material does not name, which
       * missed every rate agreed at the film's OWN gauge: the works agrees PET
       * at 185, 175 and 190, all of them 12µ. Those came back as an empty box,
       * and the next save replaced what was charged with the catalogue price.
       */
      rateOverride: layer.rateOverride,
    })),
    /*
     * The inks this line was sold on, in the order they were stored.
     *
     * Priced as they were priced, not looked up again: re-reading them from
     * the rates list would move the quotation every time an ink changed price,
     * on a document already sent. The server orders them by position and that
     * order is the press's, so it comes straight back.
     */
    colours: item.colours.map((colour) => ({
      name: colour.name,
      kind: colour.kind,
      materialId: colour.materialId,
      laydownGsm: colour.laydownGsm,
      solidsPercent: colour.solidsPercent,
      ratePerKg: colour.ratePerKg,
    })),
    quantities: item.quantities.map((quantity) => ({
      quantityKg: quantity.quantityKg,
      ratePerKg: quantity.ratePerKg,
      quantityPouches: quantity.quantityPouches,
      ratePerPouch: quantity.ratePerPouch,
    })),
    repeatWidth: item.repeatWidth,
    repeatHeight: item.repeatHeight,
    cylinderCount: item.cylinderCount,
    transportCost: item.transportCost,
    chargeCylinders: item.chargeCylinders,
    customerCylinders: item.customerCylinders,
    repairCylinders: item.repairCylinders,
    repairs: item.repairs,
    cylinderManufacturer: item.cylinderManufacturer,
    cylinderDesign: item.cylinderDesign,
  } as CreateQuotationFormValues['items'][number];
}
