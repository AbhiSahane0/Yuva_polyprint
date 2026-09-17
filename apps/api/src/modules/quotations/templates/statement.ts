import { formatNumber, formatRs, type Quotation } from '@yuva/shared';
import { BASE_CSS } from '../quotation-letterhead.js';
import { FAMILY_CSS, factsFor, foot, masthead, terms } from './family.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  quantityOf,
  quotedTier,
  structureOf,
  transportTotal,
} from './shared.js';

/**
 * **Statement** — the answer first, the jobs underneath as evidence.
 *
 * Every other layout here builds to the total: jobs, then arithmetic, then the
 * figure at the bottom. That is how the quotation was *calculated*, and it is
 * the reverse of how it is *read*. The customer opens it to find out what this
 * costs, scrolls past everything to the bottom right, and only then goes back
 * up to see what they are getting.
 *
 * So this puts the number where the eye already goes — first, alone, in the
 * company's orange — with the build-up laid out beside it as four plain chips
 * rather than a table to decode. The jobs follow as cards, because once the
 * price is known the next question is "for what", and each answers it with the
 * same labelled facts *Folio* uses.
 *
 * It is the least confusing of the family and the least conventional. A works
 * whose customers query prices will like it; one whose customers expect an
 * invoice-shaped document may not, which is why it is a choice and not the
 * only template.
 */
export function renderStatement(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);

  const materialGst = (tier?.materialWithGst ?? 0) - (tier?.materialSubtotal ?? 0);
  const cylinderGst = (tier?.cylinderWithGst ?? 0) - (tier?.cylinderSubtotal ?? 0);

  const chips = [
    ['Packaging material', tier?.materialSubtotal ?? 0],
    [`GST ${gst}%`, materialGst],
    ...(cylinders
      ? ([
          ['Cylinders, one time', tier?.cylinderSubtotal ?? 0],
          [`GST ${gst}%`, cylinderGst],
        ] as [string, number][])
      : []),
  ] as [string, number][];

  const cards = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const facts = factsFor(item, quotation, position, structureOf(item), coloursOf(item));

      return `
      <article class="card">
        <header>
          <div>
            <div class="eyebrow">Job ${index + 1} of ${quotation.items.length}</div>
            <h3>${esc(item.jobName)}</h3>
          </div>
          <div class="money">
            <div class="amt num">${formatRs(q?.totalAmount ?? 0)}</div>
            <div class="rate num">${formatRs(q?.ratePerKg ?? 0, 2)}/kg${
              pouches && (q?.costPerPouch ?? 0) > 0
                ? ` &nbsp;·&nbsp; ${formatRs(q?.costPerPouch ?? 0, 2)}/pouch`
                : ''
            }</div>
          </div>
        </header>
        <dl class="facts">${facts.join('')}</dl>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}
${FAMILY_CSS}

  /* --- the answer, first ---------------------------------------------- */
  .headline { display: flex; gap: 8mm; align-items: flex-start;
              border: 0.6pt solid var(--hair); border-radius: 2.5mm;
              padding: 5mm 5.5mm; margin-bottom: 5mm; }
  .headline .total { flex: none; }
  .headline .total .big { font-size: 30pt; font-weight: 700; color: var(--orange);
                          line-height: .95; letter-spacing: -.015em;
                          font-variant-numeric: tabular-nums; }
  .headline .total .under { font-size: 8.8pt; color: var(--muted); margin-top: 1.6mm; }
  .headline .total .under b { color: var(--ink); }

  /* The build-up as four plain chips, not a table to decode. */
  .breakdown { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr);
               gap: 2.4mm 5mm; align-content: start; padding-left: 6mm;
               border-left: 0.5pt solid var(--hair); }
  .breakdown .chip dt { font-size: 7.4pt; letter-spacing: .07em;
                        text-transform: uppercase; color: var(--muted); }
  .breakdown .chip dd { margin: .3mm 0 0; font-size: 10.5pt; color: var(--ink);
                        font-weight: 700; font-variant-numeric: tabular-nums; }

  /* --- the jobs, as evidence ------------------------------------------- */
  .what { margin-bottom: 2.4mm; }
  .card { border: 0.6pt solid var(--hair); border-radius: 2mm;
          margin-bottom: 3.5mm; break-inside: avoid; overflow: hidden; }
  .card > header { display: flex; justify-content: space-between; align-items: flex-start;
                   gap: 6mm; padding: 3mm 4mm 2.6mm; background: var(--wash);
                   border-bottom: 0.6pt solid var(--hair); }
  .card h3 { margin: .6mm 0 0; font-size: 13pt; color: var(--ink);
             font-weight: 700; line-height: 1.15; }
  .card .money { text-align: right; flex: none; }
  .card .money .amt { font-size: 14pt; font-weight: 700; color: var(--ink); line-height: 1; }
  .card .money .rate { font-size: 8.6pt; color: var(--muted); margin-top: 1mm; }

  .facts { display: grid; grid-template-columns: repeat(4, 1fr);
           gap: 2.6mm 4mm; margin: 0; padding: 3.2mm 4mm; }

  .settle { margin-top: 5mm; display: flex; gap: 8mm; align-items: flex-start; }
  .settle .terms { flex: 1; }
  .settle .due { width: 70mm; flex: none; border: 0.6pt solid var(--hair);
                 border-radius: 2mm; padding: 3.4mm 4mm; }
  .settle .due .eyebrow { margin-bottom: 1mm; }
  .settle .due .fig { font-size: 15pt; font-weight: 700; color: var(--ink);
                      font-variant-numeric: tabular-nums; }
  .settle .due .note { font-size: 8.2pt; color: var(--muted); margin-top: 1mm; }
</style></head>
<body>
<div class="sheet">
${masthead(quotation)}

  <section class="headline">
    <div class="total">
      <div class="eyebrow">Total payable</div>
      <div class="big">${formatRs(tier?.grandWithGst ?? 0)}</div>
      <div class="under">including GST at ${gst}%</div>
    </div>
    <dl class="breakdown">
      ${chips
        .map(
          ([label, value]) =>
            `<div class="chip"><dt>${esc(label)}</dt><dd>${formatRs(value)}</dd></div>`,
        )
        .join('')}
    </dl>
  </section>

  <div class="eyebrow what">What that covers</div>
  ${cards}

  <section class="settle">
    <div class="terms">${terms(quotation, cylinders, transportTotal(quotation))}</div>
    <div class="due">
      <div class="eyebrow">Advance with order</div>
      <div class="fig">${formatRs(tier?.totalAdvance ?? 0)}</div>
      <div class="note">
        ${formatNumber(quotation.materialAdvancePercent)}% of the material${
          cylinders
            ? ` and ${formatNumber(quotation.cylinderAdvancePercent)}% of the cylinders`
            : ''
        }. The balance falls due on delivery.
      </div>
    </div>
  </section>
${foot(quotation)}`;
}
