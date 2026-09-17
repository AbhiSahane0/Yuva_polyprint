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
 * **Dossier** — the specification on one side, the money on the other.
 *
 * *Folio* puts a job's facts in a grid and its price in the header, which reads
 * well but mixes two different kinds of question in one block: what is this
 * made of, and what does it cost. Here they are separated down the middle —
 * engineering on the left, commerce in a tinted panel on the right — so a buyer
 * comparing three suppliers can run an eye down one column without the prices
 * interrupting, then look across when they are ready to.
 *
 * The specification is a plain two-column list rather than a grid. A grid packs
 * more into less height; a list is read faster, because every label starts at
 * the same x and the eye has one column to follow instead of four.
 */
export function renderDossier(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);

  const cards = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const facts = factsFor(item, quotation, position, structureOf(item), coloursOf(item));

      return `
      <article class="card">
        <div class="spec">
          <div class="eyebrow">Job ${index + 1} of ${quotation.items.length}</div>
          <h3>${esc(item.jobName)}</h3>
          <dl class="list">${facts.join('')}</dl>
        </div>

        <aside class="price">
          <div class="block">
            <div class="eyebrow">Rate</div>
            <div class="big num">${formatRs(q?.ratePerKg ?? 0, 2)}<span>/kg</span></div>
            ${
              pouches && (q?.costPerPouch ?? 0) > 0
                ? `<div class="alt num">${formatRs(q?.costPerPouch ?? 0, 2)} a pouch</div>`
                : ''
            }
          </div>
          <div class="block">
            <div class="eyebrow">This order</div>
            <div class="mid num">${formatNumber(q?.quantityKg ?? 0, 2)} kg</div>
            ${pouches ? `<div class="alt num">${formatNumber(q?.totalPouches ?? 0)} pouches</div>` : ''}
          </div>
          <div class="block amount">
            <div class="eyebrow">Material for this job</div>
            <div class="big num">${formatRs(q?.totalAmount ?? 0)}</div>
          </div>
        </aside>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}
${FAMILY_CSS}

  .card { display: flex; gap: 0; border: 0.6pt solid var(--hair); border-radius: 2mm;
          overflow: hidden; margin-bottom: 4mm; break-inside: avoid; }

  .spec { flex: 1; padding: 3.4mm 4.5mm 4mm; min-width: 0; }
  .spec h3 { margin: .8mm 0 3mm; font-size: 14pt; color: var(--ink);
             font-weight: 700; line-height: 1.15; }

  /* A list, not a grid: every label starts at the same x, so the eye has one
     column to follow rather than four. */
  .list { margin: 0; display: grid; grid-template-columns: 30mm 1fr;
          gap: 1.9mm 4mm; align-items: baseline; }
  .list .fact { display: contents; }
  .list dt { text-align: left; }
  .list dd { margin: 0; }

  .price { width: 58mm; flex: none; background: var(--wash);
           border-left: 0.6pt solid var(--hair); padding: 3.4mm 4.5mm 4mm; }
  .price .block + .block { margin-top: 3.4mm; padding-top: 3.4mm;
                           border-top: 0.5pt solid var(--hair); }
  .price .big { font-size: 15pt; font-weight: 700; color: var(--indigo);
                line-height: 1.05; margin-top: .8mm; }
  .price .big span { font-size: 9pt; font-weight: 400; color: var(--muted); }
  .price .mid { font-size: 11.5pt; font-weight: 700; color: var(--ink); margin-top: .8mm; }
  .price .alt { font-size: 8.6pt; color: var(--muted); margin-top: .6mm; }
  .price .amount .big { color: var(--ink); }

  .settle { display: flex; gap: 6mm; align-items: flex-start; margin-top: 5mm; }
  .settle .terms { flex: 1; }
  .bill { width: 84mm; flex: none; border: 0.6pt solid var(--hair);
          border-radius: 2mm; padding: 3.5mm 4mm; }
  .bill table { width: 100%; border-collapse: collapse; }
  .bill td { padding: 1.5mm 0; font-size: 9.2pt; }
  .bill td.v { text-align: right; font-variant-numeric: tabular-nums;
               white-space: nowrap; color: var(--ink); }
  .bill tr.rule td { border-top: 0.5pt solid var(--hair); }
  .bill tr.total td { border-top: 1.4pt solid var(--indigo); padding-top: 2.6mm; }
  .bill tr.total td.k { font-size: 10pt; color: var(--ink); font-weight: 700; }
  .bill tr.total td.v { font-size: 18pt; font-weight: 700; color: var(--orange); line-height: 1.05; }
  .bill .due { margin-top: 2.4mm; padding-top: 2mm; border-top: 0.5pt dashed var(--hair);
               display: flex; justify-content: space-between; font-size: 9.2pt; }
  .bill .due b { color: var(--ink); }
</style></head>
<body>
<div class="sheet">
${masthead(quotation)}
${cards}

  <section class="settle">
    <div class="terms">${terms(quotation, cylinders, transportTotal(quotation))}</div>
    <div class="bill">
      <table>
        <tr><td class="k">Packaging material</td><td class="v">${formatRs(tier?.materialSubtotal ?? 0)}</td></tr>
        <tr><td class="k">GST ${gst}%</td><td class="v">${formatRs((tier?.materialWithGst ?? 0) - (tier?.materialSubtotal ?? 0))}</td></tr>
        ${
          cylinders
            ? `<tr class="rule"><td class="k">Cylinders &mdash; one time</td><td class="v">${formatRs(tier?.cylinderSubtotal ?? 0)}</td></tr>
        <tr><td class="k">GST ${gst}%</td><td class="v">${formatRs((tier?.cylinderWithGst ?? 0) - (tier?.cylinderSubtotal ?? 0))}</td></tr>`
            : ''
        }
        <tr class="total"><td class="k">Total payable</td><td class="v">${formatRs(tier?.grandWithGst ?? 0)}</td></tr>
      </table>
      <div class="due"><span>Advance with order</span><b class="num">${formatRs(tier?.totalAdvance ?? 0)}</b></div>
    </div>
  </section>
${foot(quotation)}`;
}
