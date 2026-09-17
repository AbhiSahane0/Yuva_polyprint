import { formatNumber, formatRs, type Quotation } from '@yuva/shared';
import { BASE_CSS } from '../quotation-letterhead.js';
import { bill, docBand, FAMILY_CSS, foot, letterhead, specRows, terms } from './family.js';
import { esc, quantityOf, quotedTier, styleOf } from './shared.js';

/**
 * **Dossier** — the specification on one side, the commerce on the other.
 *
 * *Folio* puts both halves of a job in matched panels, which reads evenly and
 * says the two are equally important. For a works whose customers are technical
 * buyers they are not: the film, the gauge and the colour count are what the
 * enquiry was about, and the price is the consequence. So here the
 * specification takes the width of the page and the money sits in a tinted rail
 * down the right, close enough to read across to and far enough to be read
 * past.
 *
 * The rail is a ladder of small figures, not a headline. What a rail like this
 * is for is comparison down the page — three jobs, three rates, aligned on the
 * same right edge — and a large figure would break that alignment the moment a
 * number ran to six digits.
 */
export function renderDossier(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const many = quotation.items.length > 1;

  const cards = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const perPouch = q?.costPerPouch ?? 0;

      return `
      <article class="card">
        <div class="spec">
          <header>
            <div class="ident">
              ${many ? `<span class="no num">${String(index + 1).padStart(2, '0')}</span>` : ''}
              <h3>${esc(item.jobName)}</h3>
            </div>
            <div class="style">${esc(styleOf(item))}</div>
          </header>
          <dl class="rows">${specRows(item)}</dl>
        </div>

        <aside class="rail">
          <header><span class="eyebrow">This order</span></header>
          <dl class="rows">
            <div class="row"><dt>Rate</dt><dd class="num strong">${formatRs(q?.ratePerKg ?? 0, 2)} <span class="unit">/kg</span></dd></div>
            ${
              pouches && perPouch > 0
                ? `<div class="row"><dt>Each pouch</dt><dd class="num">${formatRs(perPouch, 2)}</dd></div>`
                : ''
            }
            <div class="row"><dt>Quantity</dt><dd class="num">${formatNumber(q?.quantityKg ?? 0, 2)} kg</dd></div>
            ${
              pouches
                ? `<div class="row"><dt>You receive</dt><dd class="num">${formatNumber(q?.totalPouches ?? 0)}</dd></div>
            <div class="row"><dt>Pouches a kg</dt><dd class="num">${formatNumber(item.pouchesPerKg, 2)}</dd></div>`
                : ''
            }
            <div class="row amount"><dt>Material</dt><dd class="num">${formatRs(q?.totalAmount ?? 0)}</dd></div>
          </dl>
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

  /* --- specification left, commerce right -------------------------------- */
  .card { display: flex; align-items: stretch; border: 0.5pt solid var(--hair);
          border-radius: 2mm; overflow: hidden; margin-bottom: 4mm; break-inside: avoid; }

  .spec { flex: 1; min-width: 0; padding: 0 0 3mm; }
  .spec > header { display: flex; align-items: baseline; justify-content: space-between;
                   gap: 5mm; padding: 2.6mm 4.5mm; background: var(--wash);
                   border-bottom: 0.5pt solid var(--hair); margin-bottom: 1.6mm; }
  .spec .ident { display: flex; align-items: baseline; gap: 3mm; min-width: 0; }
  .spec .no { font-size: var(--t-label); font-weight: 700; color: var(--indigo);
              letter-spacing: .08em; }
  .spec h3 { margin: 0; font-size: var(--t-name); color: var(--ink); font-weight: 700;
             line-height: 1.25; }
  .spec .style { flex: none; font-size: var(--t-label); letter-spacing: .1em;
                 text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .spec .rows { padding: 0 4.5mm; }
  /* The label gutter is wider here: the list has the page to itself. */
  .spec .row dt { width: 30mm; }

  /* The rail carries the same header strip as the specification beside it —
     without one its first figure sat level with the job's name and every row
     below was half a line out of step with the row it belongs against. */
  .rail { width: 62mm; flex: none; background: var(--wash);
          border-left: 0.5pt solid var(--hair); padding: 0 4.5mm 3.2mm; }
  .rail > header { margin: 0 -4.5mm 1.6mm; padding: 2.6mm 4.5mm;
                   border-bottom: 0.5pt solid var(--hair); }
  .rail .row { border-bottom-color: #D2CFDE; }
  .rail .row dt { width: 24mm; }
  .rail .strong { font-weight: 700; color: var(--indigo); }
  .rail .row.amount { border-bottom: 0; border-top: 1pt solid var(--indigo);
                      margin-top: 1.4mm; padding-top: 1.8mm; }
  .rail .row.amount dt { color: var(--ink); }
  .rail .row.amount dd { font-weight: 700; }

  .settle { display: flex; gap: 8mm; align-items: flex-start; margin-top: 5mm; }
</style></head>
<body>
<div class="sheet">
${letterhead()}
${docBand(quotation)}
${cards}

  <section class="settle">
    ${terms(quotation)}
    ${bill(quotation)}
  </section>
${foot(quotation)}`;
}
