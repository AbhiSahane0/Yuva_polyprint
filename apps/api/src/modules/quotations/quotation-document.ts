import { formatNumber, formatRs, type Quotation } from '@yuva/shared';
import { BASE_CSS, COMPANY, mark, paymentQr } from './quotation-letterhead.js';
import {
  chargesCylinders,
  coloursOf,
  esc,
  longDate,
  phone,
  quantityOf,
  quotedTier,
  structureOf,
  styleOf,
  termLines,
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
 * in. A customer opens a quotation to find out what it costs: the four figures
 * come first, the jobs follow as a schedule saying what that buys, and the
 * terms and the bank close it. The total is the only thing on the page allowed
 * to be large, and it is in the company's orange.
 *
 * **Nothing is padded to a shape.** The old document drew a four-row table
 * whatever it had to put in it, so a one-job quotation went out with three
 * ruled empty rows on it, and a footer pinned to the bottom of a fixed sheet
 * left a hand's width of white above it. Every block here is as tall as its
 * content and no taller; a quotation with one job is short and one with ten
 * runs onto a second A4 page, which is what A4 is for.
 */

/** A hairline of the four brand colours, as the letterhead's own rule. */
const BAND =
  '<div class="band"><i class="m"></i><i class="g"></i><i class="o"></i><i class="i"></i></div>';

export function renderQuotationHtml(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);
  const jobs = quotation.items.length;

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

  const rows = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const pouches = item.jobKind !== 'ROLL';
      const perPouch = q?.costPerPouch ?? 0;
      const colours =
        coloursOf(item) || `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`;

      return `
        <tr>
          <td class="no num">${String(index + 1).padStart(2, '0')}</td>
          <td class="job">
            <b>${esc(item.jobName)}</b>
            <span class="sub">${esc(styleOf(item))} &nbsp;·&nbsp; ${formatNumber(
              item.widthMm,
              0,
            )} x ${formatNumber(item.heightMm, 0)} mm &nbsp;·&nbsp; ${esc(
              structureOf(item),
            )} &nbsp;·&nbsp; ${formatNumber(item.micron, 0)} micron</span>
          </td>
          <td class="print">${esc(colours)}<span class="sub">${item.cylinderCount} cylinder${
            item.cylinderCount === 1 ? '' : 's'
          }${
            item.chargeCylinders && item.totalCylinderCost > 0
              ? ` at ${formatRs(item.costPerCylinder)}`
              : ', already with us'
          }</span></td>
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

  const terms = termLines(quotation, cylinders);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
${BASE_CSS}

  /* --- letterhead ------------------------------------------------------- */
  .top { display: flex; align-items: flex-start; gap: 6mm; }
  .top .who { flex: 1; text-align: right; font-size: var(--t-fine); color: var(--muted);
              line-height: 1.5; }
  .top .who b { display: block; font-size: 10.4pt; color: var(--ink); margin-bottom: .4mm; }
  .top .marks { flex: none; padding-top: 1mm; }

  /*
   * The four tiles of the mark, in the widths they are printed at. Unequal on
   * purpose — an even quarter each reads as a chart rather than a letterhead.
   */
  .band { display: flex; height: 1.1mm; margin: 3mm 0 4.2mm; }
  .band i { display: block; }
  .band .m { flex: 26; background: var(--magenta); }
  .band .g { flex: 13; background: var(--green); }
  .band .o { flex: 16; background: var(--orange); }
  .band .i { flex: 45; background: var(--indigo); }

  /* --- who it is for, and which document -------------------------------- */
  .to-band { display: flex; align-items: flex-start; gap: 8mm; margin-bottom: 4.2mm; }
  .to-band .to { flex: 1; min-width: 0; }
  .to-band .label { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
                    color: var(--muted); font-weight: 700; margin-top: 2.6mm; }
  .to-band .label:first-of-type { margin-top: 1.6mm; }
  .to-band .name { font-size: 14pt; color: var(--ink); font-weight: 700; line-height: 1.2;
                   margin-top: .6mm; }
  .to-band .job-name { font-size: var(--t-name); color: var(--ink); font-weight: 700;
                       line-height: 1.25; margin-top: .6mm; }
  .to-band .fine { font-size: var(--t-body); color: var(--body); margin-top: .4mm; }

  .meta { flex: none; display: flex; align-self: flex-start;
          border: 0.5pt solid var(--hair); border-radius: 1.5mm; overflow: hidden; }
  .meta .cell { padding: 2.2mm 7mm; text-align: center; }
  .meta .cell + .cell { border-left: 0.5pt solid var(--hair); }
  .meta dt { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; }
  .meta dd { margin: .8mm 0 0; font-size: var(--t-name); color: var(--ink); font-weight: 700; }

  /* --- the four figures -------------------------------------------------- */
  .figures { display: flex; align-items: stretch; border: 0.5pt solid var(--hair);
             border-radius: 2mm; overflow: hidden; margin-bottom: 4.2mm; }
  .figures .part { flex: 1; padding: 3mm 4mm; border-right: 0.5pt solid var(--hair);
                   min-width: 0; }
  .figures .part:last-child { border-right: 0; }
  .figures dt { font-size: var(--t-label); letter-spacing: .09em; text-transform: uppercase;
                color: var(--muted); font-weight: 700; white-space: nowrap; }
  .figures dd { margin: 1mm 0 0; font-size: var(--t-lead); color: var(--ink); font-weight: 700;
                font-variant-numeric: tabular-nums; line-height: 1.15; }
  .figures .note { display: block; font-size: var(--t-fine); letter-spacing: 0;
                   text-transform: none; font-weight: 400; color: var(--muted);
                   font-style: italic; margin-top: .8mm; }
  /* The one figure allowed to be loud, and it is loud by colour, not by size. */
  .figures .sum { background: var(--wash); }
  .figures .sum dd { color: var(--orange); }

  /* --- the jobs, as a schedule ------------------------------------------- */
  .schedule { width: 100%; border-collapse: collapse; margin-bottom: 4.2mm; }
  .schedule thead th { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
                       color: var(--muted); font-weight: 700; text-align: left;
                       padding: 0 2.5mm 1.3mm; border-bottom: 0.8pt solid var(--hair); }
  .schedule td { padding: 2.1mm 2.5mm; vertical-align: top; font-size: var(--t-value);
                 color: var(--ink); border-bottom: 0.5pt solid var(--hair); }
  .schedule .no { color: var(--indigo); font-size: var(--t-label); font-weight: 700;
                  padding-top: 2.7mm; width: 8mm; }
  .schedule .job { width: 56mm; }
  .schedule .job b { display: block; line-height: 1.3; }
  .schedule .print { width: 32mm; }
  .schedule .order { width: 26mm; }
  .schedule .rate { width: 25mm; font-weight: 700; color: var(--indigo); }
  .schedule .amt { width: 24mm; font-weight: 700; }
  /* Every second line is a smaller fact about the one above it, each carrying
     its own unit — so a column stays readable without a second header. */
  .schedule .sub { display: block; font-size: var(--t-fine); color: var(--muted);
                   font-weight: 400; line-height: 1.35; margin-top: .5mm; }

  /* --- terms, and what is payable now ------------------------------------ */
  .settle { display: flex; gap: 7mm; align-items: flex-start; margin-bottom: 3.5mm; }
  .settle .terms { flex: 1; min-width: 0; }
  .settle .terms ul { list-style: none; margin: 0; padding: 0; }
  .settle .terms li { position: relative; padding-left: 4.4mm; margin-bottom: 1.2mm;
                      font-size: var(--t-body); color: var(--body); line-height: 1.4; }
  .settle .terms li::before { content: '\\25C6'; position: absolute; left: .4mm; top: 0;
                              color: var(--indigo); font-size: 6.4pt; line-height: 1.75; }
  /* Narrower than it looks like it wants to be, so the terms beside it keep
     their lines whole. Six terms that each wrap to a second line cost more
     height than this panel ever saves. */
  .settle .due { width: 76mm; flex: none; }
  .due .box { border: 0.5pt solid var(--hair); border-radius: 2mm; padding: 3mm 4mm;
              margin-top: 2.2mm; }
  .due .line { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
  .due .line dt { font-size: var(--t-value); color: var(--ink); font-weight: 700; }
  .due .line dd { margin: 0; font-size: var(--t-lead); color: var(--ink); font-weight: 700;
                  font-variant-numeric: tabular-nums; }
  .due .note { font-size: var(--t-fine); color: var(--muted); line-height: 1.45;
               margin-top: 1.4mm; }

  /* --- bank, scan and signature ------------------------------------------ */
  /*
   * Nothing here refuses to break.
   *
   * Every attempt to hold a block whole cost a page: a block that will not
   * split jumps to the next sheet the moment it is a few millimetres too tall,
   * and on a quotation that nearly fills its first page that left a hand's
   * width of white at the foot of one sheet and almost nothing on the next.
   * Letting it flow fills the page it is on, which is the whole point of
   * saying the length should follow the content.
   */
  .pay { display: flex; gap: 8mm; align-items: flex-start;
         border-top: 0.5pt solid var(--hair); padding-top: 2mm; }
  .pay .bank { flex: 1; min-width: 0; }
  .pay .rows { margin: 1.8mm 0 0; }
  .pay .row { display: flex; gap: 3mm; margin-bottom: 1mm; }
  .pay .row dt { flex: none; width: 24mm; font-size: var(--t-fine); color: var(--muted); }
  .pay .row dd { margin: 0; font-size: var(--t-fine); color: var(--ink); font-weight: 700; }
  .pay .scan { flex: none; text-align: center; }
  .pay .scan span { display: block; font-size: 5.4pt; letter-spacing: .1em;
                    text-transform: uppercase; color: var(--muted); margin-top: .8mm; }
  .pay .sign { flex: none; width: 56mm; text-align: center; }
  .pay .sign .role { font-size: var(--t-value); color: var(--ink); font-weight: 700; }
  .pay .sign .firm { font-size: var(--t-fine); color: var(--body); margin-top: .8mm; }

  /* --- the close ---------------------------------------------------------- */
  /*
   * Deliberately NOT break-inside: avoid.
   *
   * Holding it whole cost a page. On a quotation that fills its first sheet
   * the close is the last twenty millimetres, and refusing to split it sent
   * the whole block to a second sheet that then carried nothing else — while
   * twenty-two millimetres of the first sat empty under the bank details.
   * Allowed to flow, it fills that space, and the worst a break can now do is
   * put the thank-you under the motto on the next page.
   */
  .close { text-align: center; margin-top: 2.5mm; }
  .close .motto { font-size: var(--t-name); color: var(--magenta); font-weight: 700; }
  .close .thanks { font-size: var(--t-fine); color: var(--muted); line-height: 1.45;
                   margin-top: 1.2mm; }
  /*
   * And a gap under it the height of the running foot.
   *
   * The foot is position:fixed, so in paged media Chromium paints it at the
   * bottom of every page INSIDE the margin box — over whatever content has
   * reached that far. On a page that fills, the closing rule and the company
   * line were printed on top of each other. Content has to stop short of it.
   */
  .close .band { margin: 2mm 0 0; }
  .sheet { padding-bottom: 7mm; }
  @media screen { .sheet { padding: 12mm 11mm 10mm; } }
</style></head>
<body>
<div class="sheet">

  <header class="top">
    ${mark('logo', 15)}
    <div class="who">
      <b>${COMPANY.name} ${esc(COMPANY.subtitle)}</b>
      ${esc(COMPANY.address)}<br />
      ${COMPANY.phones.join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; ${esc(COMPANY.email)}<br />
      GSTIN ${COMPANY.gst}
    </div>
    <div class="marks">${mark('iso', 11)}</div>
  </header>
  ${BAND}

  <section class="to-band">
    <div class="to">
      <div class="eyebrow">Quotation prepared for</div>
      <div class="label">Company name</div>
      <div class="name">${esc(quotation.customerName)}</div>
      ${
        quotation.title.trim()
          ? `<div class="label">Job name</div>
      <div class="job-name">${esc(quotation.title)}</div>`
          : ''
      }
      ${
        phone(quotation.mobile)
          ? `<div class="label">Phone</div>
      <div class="fine">${esc(phone(quotation.mobile))}</div>`
          : ''
      }
    </div>
    <dl class="meta">
      <div class="cell"><dt>Number</dt><dd>${quotation.number}</dd></div>
      <div class="cell"><dt>Date</dt><dd>${esc(longDate(quotation.date))}</dd></div>
    </dl>
  </section>

  <dl class="figures">
    ${summary
      .map(
        ([label, value, note, isSum]) =>
          `<div class="part${isSum ? ' sum' : ''}"><dt>${esc(label)}</dt><dd>${formatRs(
            value,
          )}<span class="note">${esc(note)}</span></dd></div>`,
      )
      .join('')}
  </dl>

  <div class="band-title">What that covers</div>
  <table class="schedule">
    <thead>
      <tr>
        <th></th><th>Job</th><th>Printing</th><th>Order</th><th>Rate a kg</th><th>Material</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="settle">
    <div class="terms">
      <div class="eyebrow">Terms</div>
      <ul>${terms.map((line) => `<li>${line}</li>`).join('')}</ul>
    </div>
    <div class="due">
      <div class="eyebrow">Advance with order</div>
      <div class="box">
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

  <section class="pay">
    <div class="bank">
      <div class="eyebrow">Payment to</div>
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
    <div class="scan">${paymentQr(16)}<span>Scan to pay</span></div>
    <div class="sign">
      <div class="role">Proprietor</div>
      <div class="firm">${esc(COMPANY.bank.account)}</div>
    </div>
  </section>

  <div class="close">
    <div class="motto">&ldquo;Your Trust. Our Commitment. Together, We Grow.&rdquo;</div>
    <div class="thanks">
      Thank you for choosing Yuva Polyprint.<br />
      We look forward to growing together and delivering excellence in every package.
    </div>
    ${BAND}
  </div>
</div>

<div class="running-foot">
  <span>${COMPANY.name} ${esc(COMPANY.subtitle)} &nbsp;·&nbsp; ${esc(COMPANY.website)}</span>
  <span>Quotation ${quotation.number} &nbsp;·&nbsp; ${esc(longDate(quotation.date))}</span>
</div>
</body></html>`;
}
