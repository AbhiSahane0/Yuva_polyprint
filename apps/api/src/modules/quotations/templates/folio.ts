import { formatRs, type Quotation } from '@yuva/shared';
import { BASE_CSS } from '../quotation-letterhead.js';
import { bill, docBand, FAMILY_CSS, foot, letterhead, specPanels, terms } from './family.js';
import { esc, quantityOf, quotedTier, styleOf } from './shared.js';

/**
 * **Folio** — the quotation as a proposal, one card a job.
 *
 * It reads the way somebody explains a job across a desk: this is what it is,
 * this is what it is made of, this is what you get for your money, this is what
 * it comes to. Each card is a complete answer, so a customer with three jobs
 * can cut the page into three and give one to each person who asked.
 *
 * The card is a fixed shape and that is deliberate. A title strip naming the
 * job and its style; two panels below it, specification on the left and the
 * order on the right, divided by a rule; and a foot carrying the one figure the
 * card is worth. Every row in both panels starts and ends on the same two
 * lines, so a buyer comparing two cards runs an eye straight down.
 *
 * It suits one to three jobs — past that the cards run onto a second page, and
 * *Statement* is the document for that.
 */
export function renderFolio(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const many = quotation.items.length > 1;

  const cards = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      return `
      <article class="card">
        <header>
          <div class="ident">
            ${many ? `<span class="no num">${String(index + 1).padStart(2, '0')}</span>` : ''}
            <h3>${esc(item.jobName)}</h3>
          </div>
          <div class="style">${esc(styleOf(item))}</div>
        </header>
        ${specPanels(item, position)}
        <footer>
          <span>Material for this job, before GST</span>
          <span class="amount num">${formatRs(q?.totalAmount ?? 0)}</span>
        </footer>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}
${FAMILY_CSS}

  /* --- one card a job --------------------------------------------------- */
  .card { border: 0.5pt solid var(--hair); border-radius: 2mm; overflow: hidden;
          margin-bottom: 4mm; break-inside: avoid; }

  .card > header { display: flex; align-items: baseline; justify-content: space-between;
                   gap: 5mm; padding: 2.6mm 4mm; background: var(--wash);
                   border-bottom: 0.5pt solid var(--hair); }
  .card .ident { display: flex; align-items: baseline; gap: 3mm; min-width: 0; }
  /* The index is a marker, not a display figure: it stays the size of a label. */
  .card .no { font-size: var(--t-label); font-weight: 700; color: var(--indigo);
              letter-spacing: .08em; }
  .card h3 { margin: 0; font-size: var(--t-name); color: var(--ink); font-weight: 700;
             line-height: 1.25; }
  .card .style { flex: none; font-size: var(--t-label); letter-spacing: .1em;
                 text-transform: uppercase; color: var(--muted); font-weight: 700; }

  .card > footer { display: flex; align-items: baseline; justify-content: space-between;
                   padding: 2.2mm 4mm; border-top: 0.5pt solid var(--hair);
                   background: var(--wash); font-size: var(--t-fine); color: var(--muted); }
  .card > footer .amount { font-size: var(--t-value); font-weight: 700; color: var(--ink); }

  /* --- terms beside the money ------------------------------------------- */
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
