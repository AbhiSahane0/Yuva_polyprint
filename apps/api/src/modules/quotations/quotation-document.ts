import { formatNumber, formatRs, type Quotation } from '@yuva/shared';
import { getInterFontFaces } from './quotation-assets.js';
import { BASE_CSS, COMPANY, mark, paymentQr } from './quotation-letterhead.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  phone,
  quantityOf,
  quotedTier,
  show,
  structureOf,
  styleOf,
  transportTotal,
} from './templates/shared.js';

/**
 * **The printed quotation.**
 *
 * The same markup serves the on-screen preview and the PDF, so what the office
 * approves is exactly what the customer receives. Everything is inline — no
 * external CSS, fonts or images — because Puppeteer renders this from a string
 * with no network access.
 *
 * The order is the order it is READ in, not the order the price was worked out
 * in. A customer opens a quotation to find out what it costs: the figures come
 * first, the jobs follow as a schedule saying what that buys, and the terms,
 * the bank and the signatures close it.
 *
 * **Nothing is padded to a shape.** Every block is as tall as its content, the
 * close follows the last section rather than being pinned to the foot of the
 * sheet, and the space between sections tightens as jobs are added (see
 * `sectionGap`) so a typical one-to-four job quotation stays on one A4 page.
 * Anything longer runs onto a second page, which is what A4 is for.
 *
 * Styling here is the quotation's own. `BASE_CSS` is shared with the job card
 * and the certificate, so everything this document changes about it — page
 * margins, typeface, rule colour — is overridden below rather than edited there.
 */

/** A hairline of the four brand colours, as the letterhead's own rule. */
const BAND =
  '<div class="band"><i class="m"></i><i class="g"></i><i class="o"></i><i class="i"></i></div>';

/**
 * How airy the page is, by the number of jobs on it.
 *
 * Generous when there is room and tighter as rows are added — the space
 * between sections first, then the padding inside each row and between the
 * customer's fields — so a short quotation does not look sparse and a one-to-
 * four job quotation still closes on its first page.
 */
export interface Spacing {
  /** Between major sections, in CSS px. */
  gap: number;
  /** Above and below the text of a job row, in mm. */
  rowPad: number;
  /** Between the customer's fields, in mm. */
  field: number;
}

export function spacingFor(jobs: number): Spacing {
  if (jobs <= 1) return { gap: 38, rowPad: 2.4, field: 1.5 };
  if (jobs === 2) return { gap: 32, rowPad: 2.4, field: 1.5 };
  if (jobs === 3) return { gap: 26, rowPad: 2.1, field: 1.3 };
  if (jobs === 4) return { gap: 16, rowPad: 1.5, field: 0.8 };
  if (jobs <= 6) return { gap: 14, rowPad: 1.5, field: 0.8 };
  return { gap: 12, rowPad: 1.4, field: 0.8 };
}

/** `20-11-26` — every date on the quotation prints as DD-MM-YY. */
export function quotationDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.slice(0, 10).split('-');
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year.slice(-2)}`;
}

/**
 * The terms as the document prints them.
 *
 * The cylinder policy lines are left off the document — whether a line carries
 * a cylinder charge is already stated against the job in the schedule, as its
 * cost or as "Cylinder in house". The stored terms themselves are untouched;
 * this only decides what prints.
 */
const CYLINDER_POLICY = [/cylinder charges?\b.*\bone[- ]time/i, /requires? a separate cylinder/i];

export function documentTerms(quotation: Quotation): string[] {
  return quotation.terms
    .map((term) => term.trim())
    .filter((term) => term && !CYLINDER_POLICY.some((rule) => rule.test(term)));
}

/**
 * A future client signature, once the quotation can be signed.
 *
 * Nothing supplies one yet — the box prints as a placeholder. When signing is
 * built, pass the captured image here and it lands in the same box, so the
 * layout does not have to change.
 */
export interface ClientSignature {
  /** A PNG/SVG data URI of the drawn signature. */
  imageDataUri: string;
  signedBy?: string;
  /** ISO date. */
  signedOn?: string;
}

function clientSignatureBox(signature: ClientSignature | null = null): string {
  const body = signature
    ? `<img class="client-sig" src="${esc(signature.imageDataUri)}" alt="" />`
    : '';
  const note = signature
    ? [signature.signedBy, signature.signedOn ? quotationDate(signature.signedOn) : '']
        .filter(Boolean)
        .map((part) => esc(part))
        .join(' · ')
    : 'Signature will be collected digitally';

  return `<div class="client card" data-signature-slot="client">
      <div class="eyebrow">Client e-signature</div>
      <div class="slot">${body}</div>
      <div class="hint">${note}</div>
    </div>`;
}

export function renderQuotationHtml(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);
  const jobs = quotation.items.length;
  const spacing = spacingFor(jobs);

  /*
   * The build-up, in the order a buyer checks it: what the cylinders cost,
   * what the material costs, the tax on both, and what that comes to. The
   * cylinder cell is absent rather than zero on a repeat order — a nought
   * against a heading invites the question the line exists to answer.
   */
  const summary: [string, number, string, boolean][] = [
    ...(cylinders
      ? ([
          [
            'Cylinders',
            tier?.cylinderSubtotal ?? 0,
            transport > 0
              ? `charged once, includes ${formatRs(transport)} transport`
              : `charged once, ${jobs} job${jobs === 1 ? '' : 's'}`,
            false,
          ],
        ] as [string, number, string, boolean][])
      : []),
    ['Material', tier?.materialSubtotal ?? 0, 'before GST', false],
    [
      `GST ${gst}%`,
      (tier?.grandWithGst ?? 0) - (tier?.materialSubtotal ?? 0) - (tier?.cylinderSubtotal ?? 0),
      cylinders ? 'on material & cylinders' : 'on the material',
      false,
    ],
    ['Total payable', tier?.grandWithGst ?? 0, `including GST at ${gst}%`, true],
  ];

  /* Who it is for, one field to a row. Anything not on file is left out. */
  const address = [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
    .map((line) => show(line).trim())
    .filter(Boolean)
    .join(', ');
  const customer: [string, string][] = (
    [
      ['Address', address],
      ['GST No.', show(quotation.gstNumber).trim()],
      ['Phone', phone(quotation.mobile)],
      ['Email', show(quotation.email).trim()],
    ] as [string, string][]
  ).filter(([, value]) => value !== '');

  const rows = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const perPouch = q?.costPerPouch ?? 0;
      const colours =
        coloursOf(item) || `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`;
      const cylinderNote =
        item.chargeCylinders && item.totalCylinderCost > 0
          ? `${item.cylinderCount} cylinder${item.cylinderCount === 1 ? '' : 's'} at ${formatRs(
              item.costPerCylinder,
            )}`
          : 'Cylinder in house';

      return `
        <tr>
          <td class="no"><span class="num">${String(index + 1).padStart(2, '0')}</span></td>
          <td class="job">
            <b>${esc(item.jobName)}</b>
            <span class="sub">${esc(styleOf(item))} · ${formatNumber(
              item.widthMm,
              0,
            )} x ${formatNumber(item.heightMm, 0)} mm · ${esc(
              structureOf(item),
            )} · ${formatNumber(item.micron, 0)} micron</span>
          </td>
          <td class="print">${esc(colours)}<span class="sub">${esc(cylinderNote)}</span></td>
          <td class="order num">${formatNumber(q?.quantityKg ?? 0, 2)} kg${
            pouches ? `<span class="sub">${formatNumber(q?.totalPouches ?? 0)} pouches</span>` : ''
          }</td>
          <td class="rate num">${formatRs(q?.ratePerKg ?? 0, 2)}${
            pouches && perPouch > 0
              ? `<span class="sub">${formatRs(perPouch, 2)} a pouch</span>`
              : ''
          }</td>
          <td class="amt num">${formatRs(q?.totalAmount ?? 0)}</td>
        </tr>`;
    })
    .join('');

  const terms = documentTerms(quotation);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}
${getInterFontFaces()}

  /* --- the quotation's own page, type and colours ------------------------ */
  @page { size: A4 portrait; margin: 9mm 8mm 8mm; }
  :root {
    --rule: #C9CCDA;
    --label: #8A8EA3;
    --pill: #EEF0F5;
    --radius: 6px;
    --gap: ${spacing.gap}px;
    --row-pad: ${spacing.rowPad}mm;
    --field: ${spacing.field}mm;
  }
  @media screen { .sheet { padding: 9mm 8mm; } }

  body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
         font-size: 7.8pt; line-height: 1.45; color: var(--ink); }
  /*
   * Inter's substituted glyphs — contextual alternates (the raised hyphen in
   * "20-11-26", the "+" in "+91") and tabular digits — carry no text mapping
   * in Chromium's embedded subset, so the PDF printed correctly but copied and
   * searched as "201126" and "Rs ". Default glyphs only, so the text a
   * customer copies is the text they see.
   */
  body, .num, .figures dd, .due .line dd {
    font-variant-numeric: normal; font-feature-settings: 'calt' 0, 'tnum' 0;
  }
  .eyebrow { font-size: 6.4pt; letter-spacing: .08em; color: var(--label); font-weight: 700; }
  .card { border: 1px solid var(--rule); border-radius: var(--radius); }
  .section { margin-top: var(--gap); }

  /* --- letterhead -------------------------------------------------------- */
  .top { display: flex; align-items: center; gap: 6mm; }
  .top .who { flex: 1; text-align: right; font-size: 7.2pt; color: var(--body);
              line-height: 1.9; }
  .top .who b { display: block; font-size: 10.2pt; color: var(--ink); font-weight: 700;
                line-height: 1.5; margin-bottom: .6mm; }
  .top .who span { display: block; }
  /* Clear of the contact block on its left, however long a line runs. */
  .top .iso { flex: none; padding-left: 4mm; }

  /* The four tiles of the mark, in the widths they are printed at. */
  .band { display: flex; height: 1mm; margin-top: 3.5mm; }
  .band i { display: block; }
  .band .m { flex: 24; background: var(--magenta); }
  .band .g { flex: 14; background: var(--green); }
  .band .o { flex: 18; background: var(--orange); }
  .band .i { flex: 44; background: var(--indigo); }

  /* --- who it is for, and which document -------------------------------- */
  .to-band { display: flex; align-items: flex-start; gap: 8mm; }
  .to-band .to { flex: 1; min-width: 0; }
  .to-band .for { margin: 0 0 1.2mm; font-size: 10.4pt; font-weight: 900; color: #000;
                  letter-spacing: .01em; text-transform: uppercase; line-height: 1.3; }
  .to-band .field { margin: var(--field) 0 0; }
  .to-band .field dt { font-size: 6.2pt; letter-spacing: .06em; text-transform: uppercase;
                       color: var(--label); font-weight: 700; line-height: 1.35; }
  .to-band .field dd { margin: .2mm 0 0; font-size: 8pt; line-height: 1.35; color: var(--body); font-weight: 700;
                       overflow-wrap: anywhere; }
  .to-band .field dd.name { font-size: 12.6pt; color: var(--ink); line-height: 1.25; }

  .meta { flex: none; width: 81mm; display: flex; margin: 0; overflow: hidden; }
  .meta .cell { flex: 1; padding: 2.4mm 3mm 2.6mm; text-align: center; }
  .meta .cell + .cell { border-left: 1px solid var(--rule); }
  .meta dt { font-size: 6.2pt; letter-spacing: .06em; text-transform: uppercase;
             color: var(--label); font-weight: 700; }
  .meta dd { margin: .8mm 0 0; font-size: 10.8pt; color: var(--ink); font-weight: 700; }

  /* --- the figures ------------------------------------------------------- */
  .figures { display: flex; align-items: stretch; margin: var(--gap) 0 0; overflow: hidden; }
  .figures .part { flex: 1; padding: 3.4mm 4mm 3.6mm; border-right: 1px solid var(--rule);
                   min-width: 0; }
  .figures .part:last-child { border-right: 0; }
  .figures dt { font-size: 6.2pt; letter-spacing: .06em; text-transform: uppercase;
                color: var(--label); font-weight: 700; white-space: nowrap; }
  .figures dd { margin: 1.2mm 0 0; font-size: 12.2pt; color: var(--ink); font-weight: 700;
                font-variant-numeric: tabular-nums; line-height: 1.15; }
  .figures .note { display: block; font-size: 6.8pt; font-weight: 400; color: var(--label);
                   font-style: italic; margin-top: 1mm; }
  /* The one figure allowed to be loud, and it is loud by colour, not by size. */
  .figures .sum { background: var(--wash); border-left: 3px solid var(--orange); }
  .figures .sum dd { color: var(--orange); }

  /* --- the jobs, as a schedule ------------------------------------------- */
  .band-title { color: var(--label); font-size: 6.4pt; letter-spacing: .08em;
                margin-bottom: 2.4mm; }
  .band-title::after { border-top: 1px solid var(--rule); }
  .schedule { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .schedule thead th { font-size: 6.2pt; letter-spacing: .06em; text-transform: uppercase;
                       color: var(--label); font-weight: 700; text-align: left;
                       padding: 0 2.5mm 2mm; border-bottom: 1px solid var(--rule); }
  .schedule tr { break-inside: avoid; }
  .schedule td { padding: var(--row-pad) 2.5mm calc(var(--row-pad) + .2mm); vertical-align: top; font-size: 7.8pt;
                 color: var(--ink); border-bottom: 1px solid var(--rule); line-height: 1.35; }
  .schedule .c-no { width: 7%; }
  .schedule .c-job { width: 33%; }
  .schedule .c-print { width: 21%; }
  .schedule .c-order { width: 12%; }
  .schedule .c-rate { width: 13%; }
  .schedule .c-amt { width: 14%; }
  .schedule .no span { display: inline-block; background: var(--pill); border-radius: 3px;
                       padding: .5mm 1.6mm; font-size: 6.4pt; font-weight: 600;
                       color: var(--body); }
  .schedule .job b { display: block; font-size: 8.4pt; line-height: 1.3; }
  .schedule .rate { font-weight: 700; color: var(--indigo); }
  .schedule .amt { font-weight: 700; }
  /* Every second line is a smaller fact about the one above it. */
  .schedule .sub { display: block; font-size: 6.8pt; color: var(--label);
                   font-weight: 400; line-height: 1.3; margin-top: .5mm; }

  /* --- terms, and what is payable now ------------------------------------ */
  .settle { display: flex; gap: 6mm; align-items: flex-start; }
  .settle > div { flex: 1; min-width: 0; }
  .settle ul { list-style: none; margin: 2.4mm 0 0; padding: 0; }
  .settle li { position: relative; padding-left: 4mm; margin-bottom: 1.3mm;
               font-size: 7.4pt; color: var(--body); line-height: 1.4; }
  .settle li::before { content: ''; position: absolute; left: .6mm; top: 1.2mm;
                       width: 1.3mm; height: 1.3mm; border-radius: 50%; background: var(--ink); }
  .due .box { margin-top: 2.4mm; padding: 3mm 4mm 3.2mm;
              border-left: 3px solid var(--orange); }
  .due .line { display: flex; align-items: baseline; justify-content: space-between;
               gap: 4mm; margin: 0; }
  .due .line dt { font-size: 8pt; color: var(--ink); font-weight: 700; }
  .due .line dd { margin: 0; font-size: 11.4pt; color: var(--ink); font-weight: 700;
                  font-variant-numeric: tabular-nums; }
  .due .note { font-size: 6.8pt; color: var(--label); line-height: 1.45; margin-top: 1.4mm; }

  /* --- bank, scan and the two signatures --------------------------------- */
  /*
   * The payment row and the close travel together: if they do not both fit
   * under the terms, both go over, so the close never sits alone on a page.
   */
  .pay { display: flex; gap: 4.5mm; align-items: flex-start; break-inside: avoid;
         border-top: 1px solid var(--rule); padding-top: 2.2mm; }
  .pay .bank { flex: 1; min-width: 0; }
  .pay .rows { margin: 2.2mm 0 0; }
  .pay .row { display: flex; gap: 2.5mm; margin-bottom: 1.2mm; }
  .pay .row dt { flex: none; width: 19mm; font-size: 7pt; color: var(--label); }
  .pay .row dd { margin: 0; font-size: 7pt; color: var(--ink); font-weight: 700; }

  .pay .scan { flex: none; text-align: center; }
  .pay .scan .card { padding: 2.4mm; line-height: 0; }
  .pay .scan .pay-qr { display: block; }
  .pay .scan .caption { display: block; font-size: 5.8pt; letter-spacing: .1em;
                        text-transform: uppercase; color: var(--label); margin-top: 1.2mm; }

  .pay .client { flex: none; width: 44mm; padding: 2.4mm 3mm 2.2mm;
                 display: flex; flex-direction: column; }
  .pay .client .eyebrow { color: var(--body); }
  .pay .client .slot { height: 13mm; display: flex; align-items: center;
                       justify-content: center; }
  .pay .client .client-sig { max-width: 100%; max-height: 100%; }
  .pay .client .hint { border-top: 1px dashed var(--rule); padding-top: 1mm;
                       font-size: 6.4pt; color: var(--label); font-style: italic;
                       text-align: center; }

  .pay .sign { flex: none; width: 42mm; text-align: center; padding-top: 1mm; }
  /* Blank space above the line, left for the proprietor to sign by hand. */
  .pay .sign .space { height: 6.5mm; }
  .pay .sign .line { border-top: 0.75pt solid var(--ink); margin: 1.2mm 3mm 1.4mm; }
  .pay .sign .role { font-size: 8pt; color: var(--ink); font-weight: 700; }
  .pay .sign .firm { font-size: 6.8pt; color: var(--body); margin-top: .5mm; line-height: 1.35; }

  /* --- the close ---------------------------------------------------------- */
  .close { text-align: center; break-inside: avoid; break-before: avoid; }
  .close .motto { font-size: 10.2pt; color: var(--magenta); font-weight: 700; }
  .close .thanks { font-size: 7.2pt; color: var(--body); line-height: 1.55; margin-top: 2mm; }
  .close .band { margin-top: 3.5mm; }
</style></head>
<body>
<div class="sheet">

  <header class="top">
    ${mark('logo', 24)}
    <div class="who">
      <b>${COMPANY.name} ${esc(COMPANY.subtitle)}</b>
      <span>${esc(COMPANY.address)}</span>
      <span>${COMPANY.phones.map(esc).join(' &nbsp;·&nbsp; ')}</span>
      <span>${esc(COMPANY.email)} &nbsp;·&nbsp; ${esc(COMPANY.website)}</span>
      <span>GSTIN ${esc(COMPANY.gst)}</span>
    </div>
    <div class="iso">${mark('iso', 14)}</div>
  </header>
  ${BAND}

  <section class="to-band section">
    <div class="to">
      <h2 class="for">Quotation prepared for</h2>
      <dl class="field"><dt>Company name</dt><dd class="name">${esc(
        quotation.customerName,
      )}</dd></dl>
      ${customer
        .map(
          ([label, value]) => `<dl class="field"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></dl>`,
        )
        .join('\n      ')}
    </div>
    <dl class="meta card">
      <div class="cell"><dt>Number</dt><dd>${quotation.number}</dd></div>
      <div class="cell"><dt>Date</dt><dd>${esc(quotationDate(quotation.date))}</dd></div>
    </dl>
  </section>

  <dl class="figures card section">
    ${summary
      .map(
        ([label, value, note, isSum]) =>
          `<div class="part${isSum ? ' sum' : ''}"><dt>${esc(label)}</dt><dd>${formatRs(
            value,
          )}<span class="note">${esc(note)}</span></dd></div>`,
      )
      .join('')}
  </dl>

  <div class="section">
    <div class="band-title">What that covers</div>
    <table class="schedule">
      <colgroup>
        <col class="c-no" /><col class="c-job" /><col class="c-print" />
        <col class="c-order" /><col class="c-rate" /><col class="c-amt" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th><th>Job</th><th>Printing</th><th>Order</th><th>Rate a kg</th><th>Material</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <section class="settle section">
    <div class="terms">
      <div class="eyebrow">TERMS</div>
      <ul>${terms.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    </div>
    <div class="due">
      <div class="eyebrow">ADVANCE WITH ORDER</div>
      <div class="box card">
        <dl class="line">
          <dt>Payable now</dt>
          <dd class="num">${formatRs(tier?.totalAdvance ?? 0)}</dd>
        </dl>
        <div class="note">${formatNumber(quotation.materialAdvancePercent)}% of the material${
          cylinders
            ? ` and ${formatNumber(quotation.cylinderAdvancePercent)}% of the cylinders`
            : ''
        }. The balance falls due on delivery.</div>
      </div>
    </div>
  </section>

  <section class="pay section">
    <div class="bank">
      <div class="eyebrow">PAYMENT TO</div>
      <dl class="rows">
        <div class="row"><dt>Bank</dt><dd>${esc(COMPANY.bank.name)}, ${esc(
          COMPANY.bank.branch,
        )}</dd></div>
        <div class="row"><dt>Account</dt><dd>${esc(COMPANY.bank.accountNo)} (${esc(
          COMPANY.bank.accountType,
        )})</dd></div>
        <div class="row"><dt>IFSC</dt><dd>${esc(COMPANY.bank.ifsc)}</dd></div>
        <div class="row"><dt>In the name of</dt><dd>${esc(COMPANY.bank.account)}</dd></div>
      </dl>
    </div>
    <div class="scan">
      <div class="card">${paymentQr(21)}</div>
      <span class="caption">Scan to pay</span>
    </div>
    ${clientSignatureBox()}
    <div class="sign">
      <div class="space"></div>
      <div class="line"></div>
      <div class="role">Proprietor</div>
      <div class="firm">${esc(COMPANY.bank.account)}</div>
    </div>
  </section>

  <div class="close section">
    <div class="motto">&ldquo;Your Trust. Our Commitment. Together, We Grow.&rdquo;</div>
    <div class="thanks">
      Thank you for choosing Yuva Polyprint.<br />
      We look forward to growing together and delivering excellence in every package.
    </div>
    ${BAND}
  </div>
</div>
</body></html>`;
}
