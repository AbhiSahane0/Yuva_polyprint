import { formatNumber, formatRs, type Quotation, type QuotationItem } from '@yuva/shared';
import { COMPANY, mark, paymentQr } from '../quotation-letterhead.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  longDate,
  phone,
  quantityOf,
  quotedTier,
  show,
  structureOf,
  termLines,
  transportTotal,
} from './shared.js';

/**
 * The pieces every template in the family is built from.
 *
 * *Folio* worked because every figure carries its own label — a customer reads
 * "SIZE 600 × 440 mm", not a number under a heading three rows up. What it did
 * not have was a grid. The facts were laid in four columns with some of them
 * spanning two, so the rows came out ragged, half a row ended in white space,
 * and the eye had no column to follow. Three templates each did that slightly
 * differently.
 *
 * So the arrangement is settled here, once:
 *
 * - **A pair is a row, not a cell.** Label on the left at a fixed width, figure
 *   on the right against a fixed edge. Every row in a panel starts and ends at
 *   the same two x positions, which is what makes a block of figures scannable.
 * - **Panels sit side by side with a hairline between them,** so the structure
 *   is visible rather than implied by white space.
 * - **Nothing is set large.** The scale tops out at `--t-lead`, and the total is
 *   the only thing that uses it. Emphasis is weight, colour and a rule.
 *
 * What still differs between templates is the arrangement of those panels, and
 * that is the whole of the difference — which is the point.
 */

/** One labelled row: name on the left, figure hard against the right edge. */
export function row(label: string, value: string, className = ''): string {
  return value ? `<div class="row ${className}"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : '';
}

/** What the job is made of, in the order a buyer asks. */
export function specRows(item: QuotationItem): string {
  return [
    row('Size', `${formatNumber(item.widthMm, 0)} × ${formatNumber(item.heightMm, 0)} mm`),
    row('Structure', esc(structureOf(item))),
    row('Thickness', `${formatNumber(item.micron, 0)} micron`),
    row(
      'Printing',
      esc(coloursOf(item)) || `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`,
    ),
    row(
      'Cylinders',
      item.chargeCylinders && item.totalCylinderCost > 0
        ? `${item.cylinderCount} × ${formatRs(item.costPerCylinder)}`
        : `${item.cylinderCount} — already with us`,
    ),
  ]
    .filter(Boolean)
    .join('');
}

/** What the customer gets for the quantity this document is priced at. */
export function orderRows(item: QuotationItem, position: number): string {
  const q = quantityOf(item, position);
  const pouches = item.jobKind !== 'ROLL';
  const perPouch = q?.costPerPouch ?? 0;

  return [
    row('Quantity', `${formatNumber(q?.quantityKg ?? 0, 2)} kg`),
    pouches ? row('You receive', `${formatNumber(q?.totalPouches ?? 0)} pouches`) : '',
    pouches ? row('Pouches a kg', formatNumber(item.pouchesPerKg, 2)) : '',
    row('Rate', `${formatRs(q?.ratePerKg ?? 0, 2)} <span class="unit">/kg</span>`, 'lead'),
    pouches && perPouch > 0
      ? row('Each pouch', `${formatRs(perPouch, 2)} <span class="unit">/pouch</span>`)
      : '',
  ]
    .filter(Boolean)
    .join('');
}

/** The two panels a job is described by, side by side with a rule between. */
export function specPanels(item: QuotationItem, position: number): string {
  return `
        <div class="panels">
          <section class="panel">
            <div class="eyebrow">Specification</div>
            <dl class="rows">${specRows(item)}</dl>
          </section>
          <section class="panel">
            <div class="eyebrow">This order</div>
            <dl class="rows">${orderRows(item, position)}</dl>
          </section>
        </div>`;
}

/** The masthead: the marks, the company in type, and the four-tile rule. */
export function letterhead(): string {
  return `
  <header class="top">
    ${mark('logo', 13)}
    <div class="who">
      <b>${COMPANY.name} ${esc(COMPANY.subtitle)}</b>
      ${esc(COMPANY.address)}<br />
      ${COMPANY.phones.join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; ${esc(COMPANY.email)}<br />
      GSTIN ${COMPANY.gst}
    </div>
    <div class="marks">${mark('iso', 9)}${mark('qr', 9)}</div>
  </header>
  <div class="hair"></div>`;
}

/**
 * Who it is for and which document it is, as one band of aligned cells.
 *
 * The word QUOTATION used to be set at 20pt across a third of the page, which
 * is the one thing on a quotation nobody needs told twice — the customer asked
 * for it. Here it is a label like any other, and the space goes to the facts
 * that identify the document: number, date, and the quantity the price is for.
 */
export function docBand(quotation: Quotation, heading = 'Quotation'): string {
  const tier = quotedTier(quotation);
  const address = [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
    .map(show)
    .filter(Boolean);
  const contact = [
    show(quotation.gstNumber) ? `GSTIN ${esc(quotation.gstNumber)}` : '',
    phone(quotation.mobile) ? esc(phone(quotation.mobile)) : '',
  ].filter(Boolean);

  const jobs = quotation.items.length;

  return `
  <section class="doc-band">
    <div class="to">
      <div class="eyebrow">${esc(heading)} prepared for</div>
      <div class="name">${esc(quotation.customerName)}</div>
      <div class="fine">
        ${address.map((line) => esc(line)).join('<br />')}
        ${address.length && contact.length ? '<br />' : ''}
        ${contact.join(' &nbsp;·&nbsp; ')}
      </div>
    </div>
    <div class="meta">
      <div class="cell"><dt>Number</dt><dd>${quotation.number}</dd></div>
      <div class="cell"><dt>Date</dt><dd>${esc(longDate(quotation.date))}</dd></div>
      <div class="cell"><dt>${jobs === 1 ? 'Job' : 'Jobs'}</dt><dd>${jobs}</dd></div>
      <div class="cell"><dt>Quoted for</dt><dd>${formatNumber(tier?.totalQuantityKg ?? 0, 0)} kg</dd></div>
    </div>
  </section>`;
}

/**
 * The money, as a statement of account rather than a headline.
 *
 * Transport moved in here from the terms. It is part of what the cylinder line
 * charges, so it belongs under that figure where a customer checking the
 * arithmetic will look for it — not in a sentence six lines away.
 */
export function bill(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);

  const materialGst = (tier?.materialWithGst ?? 0) - (tier?.materialSubtotal ?? 0);
  const cylinderGst = (tier?.cylinderWithGst ?? 0) - (tier?.cylinderSubtotal ?? 0);

  return `
    <div class="bill">
      <div class="eyebrow">Amount payable</div>
      <dl class="rows">
        <div class="row"><dt>Packaging material</dt><dd class="num">${formatRs(tier?.materialSubtotal ?? 0)}</dd></div>
        <div class="row"><dt>GST ${gst}%</dt><dd class="num">${formatRs(materialGst)}</dd></div>
        ${
          cylinders
            ? `<div class="row sep"><dt>Cylinders, charged once${
                transport > 0
                  ? `<span class="note">includes ${esc(formatRs(transport))} transport</span>`
                  : ''
              }</dt><dd class="num">${formatRs(tier?.cylinderSubtotal ?? 0)}</dd></div>
        <div class="row"><dt>GST ${gst}%</dt><dd class="num">${formatRs(cylinderGst)}</dd></div>`
            : ''
        }
        <div class="row total"><dt>Total</dt><dd class="num">${formatRs(tier?.grandWithGst ?? 0)}</dd></div>
        <div class="row advance"><dt>Advance with order<span class="note">${formatNumber(
          quotation.materialAdvancePercent,
        )}% of material${
          cylinders ? `, ${formatNumber(quotation.cylinderAdvancePercent)}% of cylinders` : ''
        }</span></dt><dd class="num">${formatRs(tier?.totalAdvance ?? 0)}</dd></div>
      </dl>
    </div>`;
}

/** The terms, already de-duplicated against the office's own list. */
export function terms(quotation: Quotation): string {
  const lines = termLines(quotation, chargesCylinders(quotation));
  return `
    <div class="terms">
      <div class="eyebrow">Terms</div>
      <ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>
    </div>`;
}

/** Bank, signature and the running foot — identical on every template. */
export function foot(quotation: Quotation): string {
  return `
  <footer class="foot">
    <div class="bank">
      <div class="eyebrow">Payment to</div>
      <dl class="rows">
        <div class="row"><dt>Bank</dt><dd>${esc(COMPANY.bank.name)}, ${esc(COMPANY.bank.branch)}</dd></div>
        <div class="row"><dt>Account</dt><dd>${esc(COMPANY.bank.accountNo)} (${esc(COMPANY.bank.accountType)})</dd></div>
        <div class="row"><dt>IFSC</dt><dd>${esc(COMPANY.bank.ifsc)}</dd></div>
        <div class="row"><dt>In the name of</dt><dd>${esc(COMPANY.bank.account)}</dd></div>
      </dl>
    </div>
    <div class="scan">${paymentQr(16)}<span>Scan to pay</span></div>
    <div class="sign">
      <div class="for">For ${COMPANY.name} ${esc(COMPANY.subtitle)}</div>
      <div class="space"></div>
      <div class="who">${esc(COMPANY.signatory)}</div>
      <div class="role">${esc(COMPANY.signatoryRole)} &nbsp;·&nbsp; ${COMPANY.signatoryMobile}</div>
    </div>
  </footer>
  <div class="colophon">${COMPANY.services.join(' &nbsp;·&nbsp; ')}</div>
</div>

<div class="running-foot">
  <span>${COMPANY.name} ${esc(COMPANY.subtitle)} &nbsp;·&nbsp; ${esc(COMPANY.website)}</span>
  <span>Quotation ${quotation.number} &nbsp;·&nbsp; ${esc(longDate(quotation.date))}</span>
</div>
</body></html>`;
}

/** Everything the family looks like. Templates add only their own arrangement. */
export const FAMILY_CSS = `
  /* --- letterhead ------------------------------------------------------ */
  .top { display: flex; align-items: flex-start; gap: 6mm; }
  .top .who { flex: 1; text-align: right; font-size: var(--t-fine); color: var(--muted);
              line-height: 1.45; }
  .top .who b { display: block; font-size: 9.6pt; letter-spacing: .01em; margin-bottom: .6mm; }
  .marks { display: flex; align-items: center; gap: 2.6mm; flex: none; padding-top: .6mm; }

  /* The four tiles of the mark, as the rule that carries the letterhead. */
  .hair { height: 1mm; margin: 3mm 0 4.5mm;
          background: linear-gradient(to right,
            var(--magenta) 0 25%, var(--green) 25% 50%,
            var(--orange) 50% 75%, var(--indigo) 75% 100%); }

  /* --- who it is for, and which document ------------------------------- */
  .doc-band { display: flex; align-items: stretch; gap: 6mm; margin-bottom: 5mm; }
  .doc-band .to { flex: 1; min-width: 0; }
  .doc-band .name { font-size: var(--t-name); color: var(--ink); font-weight: 700;
                    line-height: 1.25; margin: .8mm 0 .8mm; }
  .doc-band .fine { font-size: var(--t-fine); color: var(--muted); line-height: 1.45; }

  /* Four cells on one baseline, divided by hairlines: the document's own
     facts, all the same shape, none of them shouting. */
  .meta { flex: none; display: flex; align-self: flex-start;
          border: 0.5pt solid var(--hair); border-radius: 1.5mm; overflow: hidden; }
  .meta .cell { padding: 2mm 4mm; text-align: center; }
  .meta .cell + .cell { border-left: 0.5pt solid var(--hair); }
  .meta dt { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; }
  .meta dd { margin: .5mm 0 0; font-size: var(--t-value); color: var(--ink); font-weight: 700;
             font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* --- the labelled row, everywhere ------------------------------------ */
  .rows { margin: 0; }
  .row { display: flex; align-items: baseline; gap: 3mm;
         padding: 1.15mm 0; border-bottom: 0.5pt solid var(--hair); }
  .row:last-child { border-bottom: 0; }
  .row dt { flex: none; width: 24mm; font-size: var(--t-label); letter-spacing: .07em;
            text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .row dd { flex: 1; margin: 0; text-align: right; font-size: var(--t-value);
            color: var(--ink); line-height: 1.3; }
  .row .unit { font-size: var(--t-fine); color: var(--muted); font-weight: 400; }
  .row.lead dd { font-weight: 700; color: var(--indigo); }
  .row .note { display: block; font-size: var(--t-label); letter-spacing: .04em;
               text-transform: none; font-weight: 400; color: var(--muted); margin-top: .2mm; }

  /* --- a job's two panels ---------------------------------------------- */
  .panels { display: flex; }
  .panels .panel { flex: 1; min-width: 0; padding: 3mm 4mm 3.2mm; }
  .panels .panel + .panel { border-left: 0.5pt solid var(--hair); }
  .panels .eyebrow { display: block; margin-bottom: 1.4mm; }

  /* --- the money ------------------------------------------------------- */
  .bill { width: 78mm; flex: none; }
  .bill .eyebrow { display: block; margin-bottom: 1.4mm; }
  /*
   * These are sentences, not field names.
   *
   * The labelled row is set in small caps everywhere else because there it
   * names a figure — SIZE, THICKNESS — and the eye skips it once it knows the
   * shape. Here each one is something the customer is being told they are
   * paying for, and a wall of small caps down a money column reads as a form to
   * be endured rather than a bill to be read.
   */
  .bill .row dt { width: auto; flex: 1; font-size: var(--t-body); color: var(--body);
                  text-transform: none; letter-spacing: 0; font-weight: 400; }
  .bill .row dd { flex: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bill .row.sep { border-top: 0.5pt solid var(--hair); margin-top: 1.4mm; padding-top: 1.9mm; }
  .bill .row.total { border-top: 1.2pt solid var(--indigo); border-bottom: 0;
                     margin-top: 1.6mm; padding-top: 2mm; }
  .bill .row.total dt { font-size: var(--t-value); color: var(--ink); font-weight: 700;
                        text-transform: none; letter-spacing: 0; }
  .bill .row.total dd { font-size: var(--t-lead); font-weight: 700; color: var(--orange);
                        line-height: 1.1; }
  .bill .row.advance { border-top: 0.5pt dashed var(--hair); border-bottom: 0;
                       margin-top: 1.4mm; padding-top: 1.8mm; }
  .bill .row.advance dt { font-size: var(--t-fine); text-transform: none; letter-spacing: 0;
                          font-weight: 400; color: var(--body); }
  .bill .row.advance dd { font-weight: 700; }

  /* --- terms ------------------------------------------------------------ */
  .terms { flex: 1; min-width: 0; font-size: var(--t-body); color: var(--muted); }
  .terms .eyebrow { display: block; margin-bottom: 1.4mm; }
  .terms ul { margin: 0; padding-left: 3.4mm; }
  .terms li { margin-bottom: .9mm; line-height: 1.42; }

  /* --- foot -------------------------------------------------------------- */
  .foot { display: flex; align-items: flex-start; gap: 6mm; margin-top: 6mm; padding-top: 3mm;
          border-top: 0.5pt solid var(--hair); }
  .bank { flex: 1; min-width: 0; }
  .bank .eyebrow { display: block; margin-bottom: 1.2mm; }
  .bank .row { padding: .85mm 0; }
  .bank .row dt { width: 26mm; font-size: var(--t-fine); text-transform: none;
                  letter-spacing: 0; font-weight: 400; }
  .bank .row dd { font-size: var(--t-fine); }
  .scan { flex: none; text-align: center; }
  .scan span { display: block; font-size: var(--t-label); letter-spacing: .08em;
               text-transform: uppercase; color: var(--muted); margin-top: 1mm; }
  .sign { width: 52mm; flex: none; text-align: right; }
  .sign .for { font-size: var(--t-fine); color: var(--muted); }
  .sign .space { height: 12mm; }
  .sign .who { font-size: var(--t-value); color: var(--ink); font-weight: 700;
               border-top: 0.5pt solid var(--hair); padding-top: 1.2mm; }
  .sign .role { font-size: var(--t-fine); color: var(--muted); }
  .pay-qr { display: block; }

  /* What the works does, in one quiet line. It is the last thing on the page
     and the only part of the letterhead artwork that was words to begin with. */
  .colophon { margin-top: 5mm; padding-top: 2.4mm; border-top: 0.5pt solid var(--hair);
              text-align: center; font-size: var(--t-label); letter-spacing: .1em;
              text-transform: uppercase; color: var(--muted); }
`;
