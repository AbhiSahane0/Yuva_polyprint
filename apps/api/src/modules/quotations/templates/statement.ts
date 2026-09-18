import { formatNumber, formatRs, type Quotation } from '@yuva/shared';
import { BASE_CSS } from '../quotation-letterhead.js';
import { docBand, FAMILY_CSS, foot, letterhead, terms } from './family.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  quantityOf,
  quotedTier,
  structureOf,
  styleOf,
  transportTotal,
} from './shared.js';

/**
 * **Statement** — the answer first, the jobs beneath it as a schedule.
 *
 * Every other layout builds to the total: jobs, then arithmetic, then the
 * figure at the bottom. That is the order the price was *calculated* in and the
 * reverse of the order it is *read* in — the customer opens the document to
 * find out what this costs, goes straight to the bottom right, and only then
 * comes back up to see what they are getting.
 *
 * So the total sits at the top with its build-up in cells beside it, and the
 * jobs follow as a schedule: one ruled row each, the same six columns every
 * time. That makes this the document for a quotation with four or six jobs on
 * it, where *Folio* would run to a second page and a buyer could not compare
 * two rates without turning back and forth.
 *
 * The total is set at the same size as the largest figure anywhere else on the
 * page. It is first, in the company's orange, and alone in its cell — which is
 * already every kind of emphasis a number needs.
 */
export function renderStatement(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);

  const materialGst = (tier?.materialWithGst ?? 0) - (tier?.materialSubtotal ?? 0);
  const cylinderGst = (tier?.cylinderWithGst ?? 0) - (tier?.cylinderSubtotal ?? 0);

  /*
   * The labels stay on one line each. A cell whose name wrapped pushed its
   * figure down a row, and five figures meant to be read across then sat at
   * three different heights — which is the opposite of what a band of cells is
   * for. Anything the label cannot carry goes under the figure as a note.
   */
  const parts: [string, number, string][] = [
    ['Material', tier?.materialSubtotal ?? 0, 'before GST'],
    [`GST ${gst}%`, materialGst, 'on the material'],
    ...(cylinders
      ? ([
          [
            'Cylinders',
            tier?.cylinderSubtotal ?? 0,
            transport > 0
              ? `charged once, includes ${formatRs(transport)} transport`
              : 'charged once',
          ],
          [`GST ${gst}%`, cylinderGst, 'on the cylinders'],
        ] as [string, number, string][])
      : []),
  ];

  const rows = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const perPouch = q?.costPerPouch ?? 0;

      return `
        <tr>
          <td class="no num">${String(index + 1).padStart(2, '0')}</td>
          <td class="job">
            <b>${esc(item.jobName)}</b>
            <span class="sub">${esc(styleOf(item))} &nbsp;·&nbsp; ${formatNumber(item.widthMm, 0)} × ${formatNumber(
              item.heightMm,
              0,
            )} mm &nbsp;·&nbsp; ${esc(structureOf(item))} &nbsp;·&nbsp; ${formatNumber(item.micron, 0)} micron</span>
          </td>
          <td class="print">${
            esc(coloursOf(item)) ||
            `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`
          }<span class="sub">${item.cylinderCount} cylinder${item.cylinderCount === 1 ? '' : 's'}${
            item.chargeCylinders && item.totalCylinderCost > 0
              ? ` at ${formatRs(item.costPerCylinder)}`
              : ', already with us'
          }</span></td>
          <td class="r num">${formatNumber(q?.quantityKg ?? 0, 2)} kg${
            pouches ? `<span class="sub">${formatNumber(q?.totalPouches ?? 0)} pouches</span>` : ''
          }</td>
          <td class="r num rate">${formatRs(q?.ratePerKg ?? 0, 2)}${
            pouches && perPouch > 0
              ? `<span class="sub">${formatRs(perPouch, 2)} a pouch</span>`
              : ''
          }</td>
          <td class="r num amt">${formatRs(q?.totalAmount ?? 0)}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}
${FAMILY_CSS}

  /* --- the answer, first ------------------------------------------------ */
  .headline { display: flex; align-items: stretch; border: 0.5pt solid var(--hair);
              border-radius: 2mm; overflow: hidden; margin-bottom: 5mm; }
  .headline .part { flex: 1; padding: 2.8mm 4mm; border-right: 0.5pt solid var(--hair);
                    min-width: 0; }
  .headline .part dt { font-size: var(--t-label); letter-spacing: .09em; text-transform: uppercase;
                       color: var(--muted); font-weight: 700; white-space: nowrap; }
  .headline .part dd { margin: .6mm 0 0; font-size: var(--t-value); color: var(--ink);
                       font-weight: 700; font-variant-numeric: tabular-nums; }
  .headline .part .note { display: block; font-size: var(--t-label); letter-spacing: .03em;
                          text-transform: none; font-weight: 400; color: var(--muted);
                          margin-top: .3mm; }
  .headline .sum { flex: none; width: 56mm; background: var(--wash); border-right: 0;
                   padding: 2.8mm 4mm; }
  .headline .sum dd { font-size: var(--t-lead); color: var(--orange); line-height: 1.15; }
  .headline .sum .note { color: var(--muted); }

  /* --- the jobs, as a schedule ------------------------------------------ */
  .schedule { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .schedule thead th { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
                       color: var(--muted); font-weight: 700; text-align: left;
                       padding: 0 2.5mm 1.4mm; border-bottom: 1pt solid var(--indigo); }
  .schedule thead th.r { text-align: right; }
  .schedule td { padding: 2.2mm 2.5mm; vertical-align: top; font-size: var(--t-value);
                 color: var(--ink); border-bottom: 0.5pt solid var(--hair); }
  .schedule tr:last-child td { border-bottom: 0.5pt solid var(--hair); }
  .schedule .no { color: var(--indigo); font-size: var(--t-label); font-weight: 700;
                  padding-top: 2.7mm; width: 8mm; }
  .schedule .job { width: 62mm; }
  .schedule .job b { display: block; line-height: 1.25; }
  .schedule .print { width: 36mm; }
  .schedule .rate { width: 24mm; font-weight: 700; color: var(--indigo); }
  .schedule .amt { width: 26mm; font-weight: 700; }
  /* Every second line of a row is a smaller fact about the line above it, and
     each one carries its own unit — so a column stays readable without a
     second header. */
  .schedule .sub { display: block; font-size: var(--t-fine); color: var(--muted);
                   font-weight: 400; line-height: 1.35; margin-top: .4mm; }

  .settle { display: flex; gap: 8mm; align-items: flex-start; margin-top: 4mm; }
  .settle .due { width: 78mm; flex: none; }
  .settle .due .eyebrow { display: block; margin-bottom: 1.4mm; }
  /* The total sits at the top of this page, so the panel down here carries the
     one figure that has not been said yet: what is payable to start the job. */
  .due .row.total { border-top: 1.2pt solid var(--indigo); border-bottom: 0; padding-top: 2mm; }
  .due .row.total dt { flex: 1; width: auto; font-size: var(--t-value); color: var(--ink);
                       font-weight: 700; text-transform: none; letter-spacing: 0; }
  .due .row.total dd { flex: none; font-size: var(--t-lead); font-weight: 700;
                       color: var(--ink); line-height: 1.1; }
  .due .row.advance { border-bottom: 0; padding-top: 1.4mm; }
  .due .row.advance dt { flex: 1; width: auto; font-size: var(--t-fine); color: var(--muted);
                         font-weight: 400; text-transform: none; letter-spacing: 0;
                         line-height: 1.4; }
  .due .row.advance dd { display: none; }
</style></head>
<body>
<div class="sheet">
${letterhead()}
${docBand(quotation)}

  <dl class="headline">
    ${parts
      .map(
        ([label, value, note]) =>
          `<div class="part"><dt>${esc(label)}</dt><dd>${formatRs(value)}${
            note ? `<span class="note">${esc(note)}</span>` : ''
          }</dd></div>`,
      )
      .join('')}
    <div class="part sum">
      <dt>Total payable</dt>
      <dd>${formatRs(tier?.grandWithGst ?? 0)}<span class="note">including GST at ${gst}%</span></dd>
    </div>
  </dl>

  <div class="band-title">What that covers</div>
  <table class="schedule">
    <thead>
      <tr>
        <th></th><th>Job</th><th>Printing</th>
        <th class="r">Order</th><th class="r">Rate a kg</th><th class="r">Material</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="settle">
    ${terms(quotation)}
    <div class="due">
      <div class="eyebrow">Advance with order</div>
      <dl class="rows">
        <div class="row total"><dt>Payable now</dt><dd class="num">${formatRs(tier?.totalAdvance ?? 0)}</dd></div>
        <div class="row advance"><dt>${formatNumber(quotation.materialAdvancePercent)}% of the material${
          cylinders
            ? ` and ${formatNumber(quotation.cylinderAdvancePercent)}% of the cylinders`
            : ''
        }. The balance falls due on delivery.</dt><dd></dd></div>
      </dl>
    </div>
  </section>
${foot(quotation)}`;
}
