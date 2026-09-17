import { formatNumber, formatRs, type Quotation, type QuotationItem } from '@yuva/shared';
import { COMPANY, mark, paymentQr } from '../quotation-letterhead.js';
import { esc, longDate, quantityOf, show } from './shared.js';

/**
 * The pieces the card-based templates share.
 *
 * *Folio* worked because every figure carries its own label — a customer reads
 * "SIZE 600 × 440 mm", not a number under a heading three rows up — so the
 * templates built alongside it keep that and change the arrangement instead.
 * What differs between them is which question the page answers first.
 *
 * Holding the masthead, the foot and the labelled-fact primitive here means
 * three documents cannot drift into three slightly different letterheads,
 * which is exactly what happens when a template is copied to start the next.
 */

/** One labelled figure. The whole reason this family reads. */
export function fact(label: string, value: string): string {
  return value ? `<div class="fact"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : '';
}

/** Every fact a job has, in the order a customer asks for them. */
export function factsFor(
  item: QuotationItem,
  quotation: Quotation,
  position: number,
  structure: string,
  colours: string,
): string[] {
  const q = quantityOf(item, position);
  const pouches = item.jobKind !== 'ROLL';
  const charged = item.chargeCylinders && item.totalCylinderCost > 0;

  return [
    fact('Size', `${formatNumber(item.widthMm, 0)} × ${formatNumber(item.heightMm, 0)} mm`),
    fact('Structure', esc(structure)),
    fact('Thickness', `${formatNumber(item.micron, 0)} micron`),
    fact(
      'Printing',
      esc(colours) || `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`,
    ),
    pouches ? fact('Pouches a kg', formatNumber(item.pouchesPerKg, 2)) : '',
    fact('Order', `${formatNumber(q?.quantityKg ?? 0, 2)} kg`),
    pouches ? fact('You receive', `${formatNumber(q?.totalPouches ?? 0)} pouches`) : '',
    charged
      ? fact('Cylinders', `${item.cylinderCount} × ${formatRs(item.costPerCylinder)}`)
      : fact('Cylinders', 'already with us'),
  ].filter(Boolean);
}

/** The masthead every card template opens with. */
export function masthead(quotation: Quotation, heading = 'Quotation'): string {
  return `
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
  <div class="hair"></div>
  <section class="band">
    <div>
      <div class="eyebrow">Prepared for</div>
      <div class="name">${esc(quotation.customerName)}</div>
      <div class="lines">
        ${[quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
          .map(show)
          .filter(Boolean)
          .map((line) => `<div>${esc(line)}</div>`)
          .join('')}
        ${show(quotation.gstNumber) ? `<div>GSTIN ${esc(quotation.gstNumber)}</div>` : ''}
        ${show(quotation.mobile) ? `<div>${esc(quotation.mobile)}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <h1>${esc(heading)}</h1>
      <div>No. <b>${quotation.number}</b></div>
      <div>${esc(longDate(quotation.date))}</div>
    </div>
  </section>`;
}

/** Bank, signature and the running foot — identical on every card template. */
export function foot(quotation: Quotation): string {
  return `
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

/** The terms list, with the cylinder sentence the customer actually needs. */
export function terms(quotation: Quotation, cylinders: boolean, transport: number): string {
  return `
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
      </ul>`;
}

/** The shared look: masthead, band, facts, terms, foot. */
export const FAMILY_CSS = `
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; }
  .top .who { text-align: right; font-size: 8pt; color: var(--muted); }
  .top .who b { display: block; font-size: 10pt; margin-bottom: .8mm; }
  .marks { display: flex; align-items: flex-end; gap: 3mm; margin-top: 2mm;
           justify-content: flex-end; }

  .hair { height: 1.1mm; margin: 3.5mm 0 4.5mm; display: flex;
          background: linear-gradient(to right,
            var(--magenta) 0 25%, var(--green) 25% 50%,
            var(--orange) 50% 75%, var(--indigo) 75% 100%); }

  .band { display: flex; justify-content: space-between; align-items: flex-start;
          gap: 8mm; margin-bottom: 5mm; }
  .band .name { font-size: 13pt; color: var(--ink); font-weight: 700; line-height: 1.2; }
  .band .lines { font-size: 8.6pt; margin-top: .8mm; }
  .band .doc { text-align: right; font-size: 8.8pt; flex: none; }
  .band .doc h1 { margin: 0 0 1.4mm; font-size: 19pt; font-weight: 300;
                  letter-spacing: .14em; text-transform: uppercase;
                  color: var(--indigo); line-height: 1; }
  .band .doc b { color: var(--ink); }

  .fact dt { font-size: 7.2pt; letter-spacing: .08em; text-transform: uppercase;
             color: var(--muted); }
  .fact dd { margin: .4mm 0 0; font-size: 9.6pt; color: var(--ink); }

  .terms { font-size: 8.2pt; color: var(--muted); }
  .terms ul { margin: 1.6mm 0 0; padding-left: 3.6mm; }
  .terms li { margin-bottom: 1.2mm; }

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
`;
