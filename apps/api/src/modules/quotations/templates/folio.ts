import { formatNumber, formatRs, type Quotation, type QuotationItem } from '@yuva/shared';
import { BASE_CSS, COMPANY, mark, paymentQr } from '../quotation-letterhead.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  longDate,
  quantityOf,
  quotedTier,
  show,
  structureOf,
  transportTotal,
} from './shared.js';

/**
 * **Folio** — the quotation as a proposal.
 *
 * Where *Brief* compresses each job to a line, this gives it a card: the
 * specification as labelled pairs on the left, the commercial terms on the
 * right, and the rate large enough to be the thing you see first. It reads the
 * way somebody explains a job across a desk — this is the size, this is what it
 * is made of, this is what it prints in, and this is what it comes to.
 *
 * It suits one to three jobs. Past that the cards run past a page and *Brief*
 * or *Ledger* is the better document — which is a real limit and the reason
 * there are three of these rather than one.
 *
 * Every figure the office knows is on the page. Nothing is abbreviated away,
 * because the point of this one is that the customer can check it without
 * asking: a buyer holding three quotations wants to compare structures and
 * piece counts, and a document that makes that easy wins work on its own.
 */
export function renderFolio(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);

  const address = [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
    .map(show)
    .filter(Boolean);

  /** One labelled figure in a card's specification grid. */
  const fact = (label: string, value: string, wide = false): string =>
    value
      ? `<div class="fact${wide ? ' wide' : ''}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`
      : '';

  const cards = quotation.items
    .map((item: QuotationItem, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';

      return `
      <article class="card">
        <header>
          <div>
            <div class="eyebrow">Job ${index + 1} of ${quotation.items.length}</div>
            <h3>${esc(item.jobName)}</h3>
          </div>
          <div class="card-rate">
            <div class="rate num">${formatRs(q?.ratePerKg ?? 0, 2)}<span>/kg</span></div>
            ${
              pouches && (q?.costPerPouch ?? 0) > 0
                ? `<div class="rate-alt num">${formatRs(q?.costPerPouch ?? 0, 2)} a pouch</div>`
                : ''
            }
          </div>
        </header>

        <dl class="facts">
          ${fact('Size', `${formatNumber(item.widthMm, 0)} × ${formatNumber(item.heightMm, 0)} mm`)}
          ${fact('Thickness', `${formatNumber(item.micron, 0)} micron`)}
          ${fact('Structure', esc(structureOf(item)), true)}
          ${fact(
            'Printing',
            esc(coloursOf(item)) ||
              `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`,
            true,
          )}
          ${pouches ? fact('Pouches a kg', formatNumber(item.pouchesPerKg, 2)) : ''}
          ${fact('Order', `${formatNumber(q?.quantityKg ?? 0, 2)} kg`)}
          ${pouches ? fact('You receive', `${formatNumber(q?.totalPouches ?? 0)} pouches`) : ''}
          ${
            item.chargeCylinders && item.totalCylinderCost > 0
              ? fact('Cylinders', `${item.cylinderCount} &times; ${formatRs(item.costPerCylinder)}`)
              : fact('Cylinders', 'already with us')
          }
        </dl>

        <footer>
          <span>Material for this job</span>
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

  /* --- masthead ------------------------------------------------------- */
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm;
         padding-bottom: 3.5mm; border-bottom: 2pt solid var(--indigo); }
  .top .who { text-align: right; font-size: 8pt; color: var(--muted); }
  .top .who b { display: block; font-size: 10pt; margin-bottom: .8mm; }
  .marks { display: flex; align-items: flex-end; gap: 3mm; margin-top: 2mm;
           justify-content: flex-end; }

  .band { display: flex; justify-content: space-between; align-items: flex-end;
          gap: 8mm; margin: 4mm 0 5mm; }
  .band h1 { margin: 0; font-size: 20pt; font-weight: 300; letter-spacing: .14em;
             text-transform: uppercase; color: var(--indigo); line-height: 1; }
  .band .for { font-size: 8.6pt; margin-top: 2mm; }
  .band .for .name { font-size: 13pt; color: var(--ink); font-weight: 700; }
  .band .doc { text-align: right; font-size: 8.6pt; }
  .band .doc b { color: var(--ink); }

  /* --- one card per job ------------------------------------------------ */
  .card { border: 0.6pt solid var(--hair); border-radius: 2mm;
          margin-bottom: 4mm; break-inside: avoid; overflow: hidden; }
  .card > header { display: flex; justify-content: space-between; align-items: flex-start;
                   gap: 6mm; padding: 3mm 4mm 2.6mm; background: var(--wash);
                   border-bottom: 0.6pt solid var(--hair); }
  .card h3 { margin: .6mm 0 0; font-size: 13pt; color: var(--ink); font-weight: 700;
             line-height: 1.15; }
  .card-rate { text-align: right; flex: none; }
  .card-rate .rate { font-size: 15pt; font-weight: 700; color: var(--indigo); line-height: 1; }
  .card-rate .rate span { font-size: 9pt; font-weight: 400; color: var(--muted); }
  .card-rate .rate-alt { font-size: 8.4pt; color: var(--muted); margin-top: 1mm; }

  /* Four across, so a label and its figure stay on one line at this size. */
  .facts { display: grid; grid-template-columns: repeat(4, 1fr);
           gap: 2.6mm 4mm; margin: 0; padding: 3.2mm 4mm; }
  .fact.wide { grid-column: span 2; }
  .fact dt { font-size: 7.2pt; letter-spacing: .08em; text-transform: uppercase;
             color: var(--muted); }
  .fact dd { margin: .4mm 0 0; font-size: 9.4pt; color: var(--ink); }

  .card > footer { display: flex; justify-content: space-between; align-items: baseline;
                   padding: 2.4mm 4mm; border-top: 0.6pt solid var(--hair);
                   font-size: 9pt; color: var(--muted); }
  .card > footer .amount { font-size: 12.5pt; font-weight: 700; color: var(--ink); }

  /* --- the money ------------------------------------------------------- */
  .settle { display: flex; gap: 6mm; align-items: stretch; margin-top: 5mm; }
  .terms { flex: 1; font-size: 8.2pt; color: var(--muted); }
  .terms ul { margin: 1.6mm 0 0; padding-left: 3.6mm; }
  .terms li { margin-bottom: 1.2mm; }

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

  /* --- foot ------------------------------------------------------------ */
  .foot { display: flex; gap: 8mm; margin-top: 6mm; padding-top: 3mm;
          border-top: 0.5pt solid var(--hair); }
  .bank { flex: 1; font-size: 8pt; }
  .bank dl { display: grid; grid-template-columns: 24mm 1fr; gap: .5mm 2mm; margin: 1.6mm 0 0; }
  .bank dt { color: var(--muted); }
  .bank dd { margin: 0; color: var(--ink); }
  .sign { width: 54mm; flex: none; text-align: right; }
  .sign .space { height: 13mm; }
  .sign .who { font-size: 9.5pt; color: var(--ink); font-weight: 700;
               border-top: 0.5pt solid var(--hair); padding-top: 1.3mm; }
  .sign .role { font-size: 8pt; color: var(--muted); }
  .pay-qr { display: block; margin-top: 1.8mm; }
</style></head>
<body>
<div class="sheet">

  <header class="top">
    ${mark('logo', 14)}
    <div class="who">
      <b>${COMPANY.name} ${esc(COMPANY.subtitle)}</b>
      ${esc(COMPANY.address)}<br />
      ${COMPANY.phones.join(' &nbsp;·&nbsp; ')}<br />
      ${esc(COMPANY.email)} &nbsp;·&nbsp; GSTIN ${COMPANY.gst}
      <div class="marks">${mark('iso', 9)}${mark('qr', 9)}</div>
    </div>
  </header>

  <section class="band">
    <div>
      <h1>Quotation</h1>
      <div class="for">
        <div class="eyebrow">Prepared for</div>
        <div class="name">${esc(quotation.customerName)}</div>
        ${address.map((line) => `<div>${esc(line)}</div>`).join('')}
        ${show(quotation.gstNumber) ? `<div>GSTIN ${esc(quotation.gstNumber)}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <div>No. <b>${quotation.number}</b></div>
      <div>Date <b>${esc(longDate(quotation.date))}</b></div>
      ${show(quotation.mobile) ? `<div>${esc(quotation.mobile)}</div>` : ''}
    </div>
  </section>

  ${cards}

  <section class="settle">
    <div class="terms">
      <div class="eyebrow">Terms</div>
      <ul>
        ${
          cylinders
            ? `<li><b>Cylinders are charged once.</b> They stay with us, and a repeat order of the same design carries no cylinder charge at all.${
                transport > 0 ? ` The figure includes ${esc(formatRs(transport))} transport.` : ''
              }</li>`
            : `<li><b>No cylinder charge.</b> The cylinders for this design are already with us from an earlier order.</li>`
        }
        ${quotation.terms.map((term) => `<li>${esc(term)}</li>`).join('')}
      </ul>
    </div>

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

  <footer class="foot">
    <div class="bank">
      <div class="eyebrow">Payment</div>
      <dl>
        <dt>Bank</dt><dd>${esc(COMPANY.bank.name)}, ${esc(COMPANY.bank.branch)}</dd>
        <dt>Account</dt><dd>${esc(COMPANY.bank.accountNo)} &nbsp;(${esc(COMPANY.bank.accountType)})</dd>
        <dt>IFSC</dt><dd>${esc(COMPANY.bank.ifsc)}</dd>
        <dt>Name</dt><dd>${esc(COMPANY.bank.account)}</dd>
      </dl>
      ${paymentQr(18)}
    </div>
    <div class="sign">
      <div style="font-size:8pt;color:var(--muted)">For ${COMPANY.name} ${esc(COMPANY.subtitle)}</div>
      <div class="space"></div>
      <div class="who">${esc(COMPANY.signatory)}</div>
      <div class="role">${esc(COMPANY.signatoryRole)} &nbsp;·&nbsp; ${COMPANY.signatoryMobile}</div>
    </div>
  </footer>
</div>

<div class="running-foot">
  <span>${COMPANY.name} ${esc(COMPANY.subtitle)} &nbsp;·&nbsp; ${esc(COMPANY.website)}</span>
  <span>Quotation ${quotation.number} &nbsp;·&nbsp; ${esc(longDate(quotation.date))}</span>
</div>
</body></html>`;
}
