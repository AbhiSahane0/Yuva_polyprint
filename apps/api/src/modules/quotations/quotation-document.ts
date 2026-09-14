import {
  formatNumber,
  formatRs,
  resolveSelectedQuantity,
  type Quotation,
  type QuotationItem,
  type QuotationItemQuantity,
} from '@yuva/shared';
import { getQuotationAssets } from './quotation-assets.js';

/**
 * The printable quotation, as a single self-contained A4 HTML page.
 *
 * The same markup is used for the on-screen preview and for the PDF, so what
 * the user approves is exactly what the customer receives. Everything is
 * inline — no external CSS, fonts or images — because Puppeteer renders this
 * from a string with no network access.
 */

const COMPANY = {
  name: 'YUVA POLYPRINT',
  subtitle: '& PACKAGING INDUSTRIES',
  addressLine: '163A, Sangamner Co-Op. Industrial Estate Ltd.',
  phones: '+91 7720046002  ·  +91 7720046005',
  website: 'www.yuvapolyprint.com',
  emailAddress: 'info@yuvapolyprint.com',
  services: [
    'Rotogravure Printing',
    'Flexible Packaging Pouch',
    'Standup, Zipper & Spout Pouch',
    'Printed HDPE Bags',
  ],
  bank: {
    name: 'Bank of Maharashtra',
    account: 'Yuva polyprint and packaging industries',
    accountNo: '60325292340',
    accountType: 'CC Account',
    ifsc: 'MAHB0000420',
    branch: 'Sangamner',
    gst: '27AIGPH5992Q1ZD',
  },
  signatory: 'Anand K. Hase, Director',
  signatoryMobile: '+91 7720046002',
} as const;

/** Escapes user-supplied text — this string is rendered as HTML. */
function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hides the 'NA' placeholders the imported data is full of. */
function show(value: string): string {
  return !value || value === 'NA' ? '' : value;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

/** A4 content width once the 8mm side margins are taken off. */
const CONTENT_WIDTH_MM = 194;
/** Used when artwork exists but its dimensions could not be read. */
const FALLBACK_HEADER_MM = 32;
const FALLBACK_FOOTER_MM = 30;

export function renderQuotationHtml(quotation: Quotation): string {
  const assets = getQuotationAssets();

  // The bands are position:fixed, which Chrome repeats on every printed page.
  // Their exact height comes from the real image aspect ratio, so the page body
  // reserves precisely the space the artwork occupies — no clipping, no gap.
  const headerMm = assets.header
    ? CONTENT_WIDTH_MM * (assets.header.aspect ?? FALLBACK_HEADER_MM / CONTENT_WIDTH_MM)
    : 0;
  const footerMm = assets.footer
    ? CONTENT_WIDTH_MM * (assets.footer.aspect ?? FALLBACK_FOOTER_MM / CONTENT_WIDTH_MM)
    : 0;

  // Without artwork the CSS letterhead stands in, so nothing depends on the
  // files being present.
  // Only the top band needs space reserved: it is fixed so it can repeat on
  // every page. The bottom band sits in normal flow, so it takes its own room.
  const topPadMm = assets.header ? headerMm : 5;
  const addressLines = [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
    .map(show)
    .filter(Boolean);

  // Always draw at least four body rows so the table keeps its printed shape.
  const tiers = [...quotation.tiers].sort((a, b) => a.position - b.position);

  /*
   * **One quantity reaches the customer.**
   *
   * A job may be priced at two or three while the office is deciding what to
   * charge — the margin at 5,000 against the margin at 50,000 — but that is
   * working, not an offer. Printing all of them turns one price into a menu and
   * invites the customer to negotiate against the office's own arithmetic.
   *
   * Which one is `quotation.selectedQuantity`, chosen on the Jobs step and
   * resolved here against the tiers that actually exist, so a quotation trimmed
   * from three quantities to one still prints rather than pointing at a column
   * that has gone.
   */
  const chosen = resolveSelectedQuantity(quotation.selectedQuantity, tiers.length);
  const columns = tiers.length > 0 ? [tiers[chosen - 1] ?? tiers[0]] : [null];

  /** Which line to read for a job at a given quantity. */
  const quantityAt = (item: QuotationItem, position: number): QuotationItemQuantity | null =>
    item.quantities.find((q) => q.position === position) ?? item.quantities[0] ?? null;

  const rowsPerItem = columns.length;
  const bodyRows = quotation.items.length * rowsPerItem;
  const blankRows = Math.max(0, 4 - bodyRows);

  const itemRows = quotation.items
    .map((item, index) =>
      columns
        .map((tier, tierIndex) => {
          const q = quantityAt(item, tier?.position ?? 1);
          const first = tierIndex === 0;
          // Everything that describes the job rather than the order, spanned
          // down the quantity rows so it is stated once.
          const span = rowsPerItem > 1 ? ` rowspan="${rowsPerItem}"` : '';

          return `
      <tr>
        ${
          first
            ? `<td class="c"${span}>${index + 1}</td>
        <td class="job"${span}>${esc(item.jobName)}</td>
        <td class="c"${span}>${item.layers.length}</td>
        <td class="r"${span}>${formatNumber(item.filmWidthMm)}</td>
        <td class="r"${span}>${formatNumber(item.filmHeightMm)}</td>
        <td class="r"${span}>${formatNumber(item.micron)}</td>
        <td class="r"${span}>${
          /*
           * Two decimals, because this is a multiplier the customer checks
           * against the total. Rounded to a whole number it stops reconciling:
           * 29.67 prints as 30, and 30 x 100 kg suggests 3,000 pouches where
           * the line correctly reads 2,967.
           */
          // A roll has no pouches. A dash says that; 0.00 reads as a count.
          item.jobKind === 'ROLL' ? '—' : formatNumber(item.pouchesPerKg, 2)
        }</td>`
            : ''
        }
        <td class="r">${
          // Order quantity in the unit the line was quoted in: pouches for a
          // standup quoted per piece, kilograms for everything else.
          item.pricingBasis === 'PER_POUCH'
            ? formatNumber(q?.quantityPouches ?? 0)
            : formatNumber(q?.quantityKg ?? 0)
        }</td>
        <td class="r">${item.jobKind === 'ROLL' ? '—' : formatNumber(q?.totalPouches ?? 0)}</td>
        <td class="r">${(() => {
          /*
           * The rate, and on a pouch job the rate each underneath it.
           *
           * A line priced per kilogram used to print only the per-kilogram
           * figure, which is the one the works quotes in and NOT the one the
           * customer reads: they buy pouches, and "what does one cost" is the
           * first question back. It is not a second price — it is this one
           * divided by the pouches in a kilogram, which the column beside it
           * already gives — so printing it saves the customer the arithmetic
           * rather than inviting them to do it and get a different answer.
           *
           * `costPerPouch` is the total over the count, so it is exactly what
           * the order works out to per piece whichever way the line was priced.
           */
          if (item.pricingBasis === 'PER_POUCH') {
            return `${formatNumber(q?.ratePerPouch ?? 0, 2)} /pc`;
          }
          const perKg = formatNumber(q?.ratePerKg ?? 0, 2);
          const each = q?.costPerPouch ?? 0;
          return item.jobKind === 'ROLL' || each <= 0
            ? perKg
            : `${perKg}<br/><span class="sub">${formatNumber(each, 2)} /pc</span>`;
        })()}</td>
        <td class="r">${formatRs(q?.totalAmount ?? 0)}</td>
        ${
          first
            ? `<td class="r"${span}>${formatNumber(item.cylinderWidth)}</td>
        <td class="r"${span}>${formatNumber(item.cylinderCircumference)}</td>
        <td class="c"${span}>${item.cylinderCount}</td>
        <td class="r"${span}>${formatRs(item.costPerCylinder)}</td>
        <td class="r"${span}>${formatRs(item.totalCylinderCost)}</td>`
            : ''
        }
      </tr>`;
        })
        .join(''),
    )
    .join('');

  const emptyRows = Array.from({ length: blankRows })
    .map(
      (_, index) => `
      <tr class="empty">
        <td class="c">${quotation.items.length + index + 1}</td>
        ${'<td></td>'.repeat(15)}
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Quotation ${quotation.number}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 8.5pt;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Height comes from the real image ratio, so the page does not reflow when
     the artwork finishes decoding — the row-filling measurement depends on the
     layout already being final. */
  .band-top { height: ${headerMm.toFixed(2)}mm; }
  .band-bottom { height: ${footerMm.toFixed(2)}mm; }
  .band img { display: block; width: 100%; height: 100%; object-fit: fill; }
  /*
   * Everything on the page flows tight, top to bottom: customer, table,
   * totals, terms, bank details, then the footer artwork immediately after.
   * Whatever space is left over on a short quotation falls BELOW the artwork,
   * at the very foot of the paper — never as a hole inside the document.
   */
  .sheet { width: ${CONTENT_WIDTH_MM}mm; margin: 0 auto; padding: 3mm 0; }


  /* ---------------------------------------------------------------------
     Screen and print need genuinely different letterhead behaviour.

     On screen this is one continuous A4 sheet that scrolls: the header sits
     at the very top of the paper and scrolls away, the footer sits at the
     very bottom and is reached by scrolling down. Pinning either to the
     viewport would float it over the table, which is not what a document
     looks like.

     In print the bands become fixed, which is how Chrome repeats an element
     on every page — required so a two-page quotation carries the letterhead
     and contact strip on both sheets.
     --------------------------------------------------------------------- */
  @media screen {
    body { background: #52565e; padding: 24px 12px; }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 2px 18px rgba(0, 0, 0, 0.35);
    }
  }

  @media print {
    body { padding: ${topPadMm}mm 8mm 6mm; background: #fff; }
    .page { display: block; width: auto; min-height: 0; box-shadow: none; }
    /* The letterhead repeats on every page; the contact strip belongs once, at
       the end of the document, directly under the sign-off. */
    .band-top { position: fixed; top: 0; left: 0; right: 0; width: 210mm; }
    .band-bottom { width: 210mm; margin: 0 -8mm; }
  }

  /* ---- Letterhead ---- */
  .head { display: flex; align-items: center; justify-content: space-between;
          border-bottom: 2px solid #111; padding-bottom: 6px; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .logo { display: flex; gap: 3px; }
  .logo span { width: 26px; height: 30px; display: flex; align-items: center;
               justify-content: center; color: #fff; font-weight: 800; font-size: 15pt; }
  .wordmark .n { font-size: 15pt; font-weight: 800; letter-spacing: 5px; line-height: 1; }
  .wordmark .s { font-size: 8pt; font-weight: 700; letter-spacing: 1.4px; }
  .iso { text-align: center; font-size: 7pt; font-weight: 700; line-height: 1.2; }
  .iso .ring { border: 2px solid #1a3d8f; color: #1a3d8f; border-radius: 50%;
               width: 34px; height: 34px; margin: 0 auto 2px;
               display: flex; align-items: center; justify-content: center; font-size: 8pt; }

  /* ---- Customer block ---- */
  .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; }
  .meta .who { font-size: 8.5pt; line-height: 1.45; }
  .meta .who .name { font-weight: 700; font-size: 9.5pt; }
  .title { font-size: 13pt; font-weight: 800; letter-spacing: 1px; align-self: flex-start;
           padding-top: 2px; }
  .meta .doc { font-size: 8.5pt; text-align: right; line-height: 1.6; white-space: nowrap; }
  .meta .doc b { display: inline-block; min-width: 74px; text-align: left; }

  .intro { margin: 8px 0 6px; line-height: 1.42; }
  .intro h3 { margin: 0 0 3px; font-size: 9pt; }

  /* ---- Items table ---- */
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 0.6px solid #333; padding: 3px 3px; }
  thead th { background: #f1f3f7; font-size: 7.2pt; font-weight: 700; text-align: center;
             line-height: 1.15; }
  tbody td { font-size: 7.6pt; height: 17px; }
  td.c { text-align: center; }
  /* Money and measurements must never wrap — a split "Rs. 8,625" reads as two
     different numbers on a customer-facing document. */
  td.r { text-align: right; white-space: nowrap; }
  /* The per-piece rate under the per-kilogram one. Smaller and grey, because
     it is the same price read the other way round and not a second charge. */
  td.r .sub { font-size: 6.6pt; color: #666; }
  /* The job name needs room, but this cannot key on child position: a line
     priced at several quantities spans its description down the extra rows, so
     those rows begin at the order-quantity column and position two is a
     different column entirely. As nth-child(2) it forced 26mm onto Total
     Pouches and pushed the table 10mm past the page. */
  tbody td.job { min-width: 26mm; }
  tr.empty td { height: 17px; }
  tfoot td { font-weight: 700; background: #f8f9fb; font-size: 7.6pt; white-space: nowrap; }

  /* ---- Summary ---- */
  /* These blocks read as units — never split one across a page break. */
  .summary, .terms, .foot { break-inside: avoid; page-break-inside: avoid; }
  .summary { margin-top: 8px; width: 100%; }
  .summary td { padding: 4px 6px; font-size: 8.2pt; }
  .summary .lbl { text-align: right; }
  .summary .amt { text-align: right; white-space: nowrap; }
  .summary .grand td { font-weight: 800; font-size: 9.5pt; }
  .summary .grand .red { color: #c00; }
  /* Priced at several quantities: a real grid, so it gets rules and headings. */
  .summary.tiered { border-collapse: collapse; }
  .summary.tiered th {
    padding: 4px 6px; font-size: 8.2pt; font-weight: 700; text-align: right;
    background: #f2f2f2; border: 0.4pt solid #999; white-space: nowrap;
  }
  .summary.tiered td { border: 0.4pt solid #999; }
  .summary.tiered .lbl { text-align: left; background: #fafafa; }

  .closing { margin: 6px 0 4px; }
  .terms { margin: 0; }
  .terms h4 { margin: 0 0 3px; font-size: 8.6pt; }
  .terms ol { margin: 0; padding-left: 16px; line-height: 1.42; }

  /* ---- Bank + sign-off ---- */
  .foot { display: flex; justify-content: space-between; gap: 16px;
          margin-top: 7px; padding-top: 6px; border-top: 1px solid #999; }
  .bank { line-height: 1.38; }
  .bank h4 { margin: 0 0 2px; font-size: 8.6pt; }
  .payqr { text-align: center; }
  .payqr h4 { margin: 0 0 3px; font-size: 8.6pt; }
  .payqr img { width: 26mm; height: 26mm; display: block; margin: 0 auto; }
  .signoff { text-align: right; line-height: 1.38; }
  .signoff .who { font-weight: 700; margin-top: 14px; }

  .strip { margin-top: 8px; padding-top: 6px; border-top: 2px solid #111;
           display: flex; justify-content: space-between; gap: 14px; font-size: 7.4pt;
           line-height: 1.5; }
  .strip ul { margin: 0; padding-left: 12px; }
</style>
</head>
<body>
<div class="page">

  ${
    assets.header
      ? `<div class="band band-top"><img src="${assets.header.dataUri}" alt="" /></div>`
      : ''
  }

<div class="sheet">

  ${
    assets.header
      ? ''
      : `<header class="head">
    <div class="brand">
      <div class="logo">
        <span style="background:#7b2d8e">Y</span>
        <span style="background:#2e8b3d">U</span>
        <span style="background:#d1491f">V</span>
        <span style="background:#3b2f8f">A</span>
      </div>
      <div class="wordmark">
        <div class="n">POLYPRINT</div>
        <div class="s">&amp; PACKAGING INDUSTRIES</div>
      </div>
    </div>
    <div class="iso">
      <div class="ring">ISO</div>
      9001:2015
    </div>
  </header>`
  }

  <section class="meta">
    <div class="who">
      <div class="name">${esc(quotation.customerName)}</div>
      ${addressLines.map((line) => `<div>${esc(line)}</div>`).join('')}
      ${show(quotation.mobile) ? `<div>Mobile: ${esc(quotation.mobile)}</div>` : ''}
      ${
        // The customer's GSTIN belongs on a B2B quotation — their accounts team
        // needs it to claim input credit. Omitted when unknown rather than
        // printing an empty label.
        show(quotation.gstNumber) ? `<div>GST No.: ${esc(quotation.gstNumber)}</div>` : ''
      }
      ${show(quotation.email) ? `<div>Email: ${esc(quotation.email)}</div>` : ''}
    </div>
    <div class="title">QUOTATION</div>
    <div class="doc">
      <div><b>Date</b> ${esc(formatDate(quotation.date))}</div>
      <div><b>Quotation No.</b> ${quotation.number}</div>
    </div>
  </section>

  <section class="intro">
    <h3>Quotation &ndash; Printing and Cylinder Material Quotation</h3>
    <div>We are pleased to offer our best rates for premium packaging materials from Yuva Polyprint &amp; Packaging Industries.</div>
    <div>We value your trust and look forward to building a long-term partnership through quality, service, and commitment.</div>
  </section>

  <table>
    <thead>
      <tr>
        <th rowspan="2">Sr.<br/>No.</th>
        <th rowspan="2">Job Name</th>
        <th rowspan="2">Layer</th>
        <th colspan="2">Job Size in mm</th>
        <th rowspan="2">Micron</th>
        <th rowspan="2">No. of<br/>Pouch<br/>Per kg</th>
        <th rowspan="2">Order<br/>Qty</th>
        <th rowspan="2">Total<br/>Pouches</th>
        <th rowspan="2">Rate<br/>/Kg</th>
        <th rowspan="2">Total<br/>Rs.</th>
        <th colspan="2">Cylinder Size in mm</th>
        <th rowspan="2">No. of<br/>Cylinder</th>
        <th rowspan="2">Cost Per<br/>Cylinder</th>
        <th rowspan="2">Total<br/>Cylinder Cost</th>
      </tr>
      <tr>
        <th>Width</th><th>Height</th>
        <th>Width</th><th>Circum</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${emptyRows}
    </tbody>
    <tfoot>
      ${columns
        .map((tier, tierIndex) => {
          const position = tier?.position ?? 1;
          const first = tierIndex === 0;
          /*
           * The cylinders are the same figure at every quantity — they do not
           * scale with the order. Printed once and spanned, rather than
           * repeated down the column where it would read as being charged
           * three times.
           */
          const span = columns.length > 1 ? ` rowspan="${columns.length}"` : '';

          return `
      <tr>
        <td colspan="7" class="c">${
          columns.length > 1 ? `Total &mdash; quantity ${position}` : 'Total'
        }</td>
        <td class="r">${(() => {
          /*
           * Only total this column when every line is quoted in the same unit.
           * A document mixing kilograms and pouches has no meaningful sum here,
           * and printing one would invite the customer to check it and find it
           * wrong. The money totals below are unaffected — they are always
           * rupees.
           */
          const bases = new Set(quotation.items.map((i) => i.pricingBasis));
          if (bases.size !== 1) return '&mdash;';
          const perPouch = bases.has('PER_POUCH');
          return formatNumber(
            quotation.items.reduce((sum, item) => {
              const q = quantityAt(item, position);
              return sum + (perPouch ? (q?.quantityPouches ?? 0) : (q?.quantityKg ?? 0));
            }, 0),
          );
        })()}</td>
        <td></td>
        <td></td>
        <td class="r">${formatRs(tier?.materialSubtotal ?? 0)}</td>
        ${
          first
            ? `<td${span}></td>
        <td${span}></td>
        <td class="c"${span}>${quotation.items.reduce((sum, i) => sum + i.cylinderCount, 0)}</td>
        <td${span}></td>
        <td class="r"${span}>${formatRs(tier?.cylinderSubtotal ?? 0)}</td>`
            : ''
        }
      </tr>`;
        })
        .join('')}
    </tfoot>
  </table>

  ${
    columns.length > 1
      ? /*
         * Priced at more than one quantity, so the summary is transposed: one
         * column per quantity, with the cylinders sitting on a single row
         * because they cost the same in all of them. That is the comparison the
         * customer is being asked to make, and it only works side by side.
         */
        `<table class="summary tiered">
    <tr>
      <td class="lbl"></td>
      ${columns
        .map((tier) => {
          const position = tier?.position ?? 1;
          const bases = new Set(quotation.items.map((i) => i.pricingBasis));
          const single = bases.size === 1;
          const perPouch = single && bases.has('PER_POUCH');
          const quantity = quotation.items.reduce((sum, item) => {
            const q = quantityAt(item, position);
            return sum + (perPouch ? (q?.quantityPouches ?? 0) : (q?.quantityKg ?? 0));
          }, 0);
          const heading = single
            ? `${formatNumber(quantity)} ${perPouch ? 'pouches' : 'kg'}`
            : `Quantity ${position}`;
          return `<th class="c">${heading}</th>`;
        })
        .join('')}
    </tr>
    <tr>
      <td class="lbl">Packaging material</td>
      ${columns.map((t) => `<td class="amt">${formatRs(t?.materialSubtotal ?? 0)}</td>`).join('')}
    </tr>
    <tr>
      <td class="lbl">Material incl. GST ${formatNumber(quotation.gstPercent)}%</td>
      ${columns.map((t) => `<td class="amt"><b>${formatRs(t?.materialWithGst ?? 0)}</b></td>`).join('')}
    </tr>
    <tr>
      <td class="lbl">Cylinders (one-time)</td>
      ${columns.map((t) => `<td class="amt">${formatRs(t?.cylinderSubtotal ?? 0)}</td>`).join('')}
    </tr>
    <tr>
      <td class="lbl">Cylinders incl. GST ${formatNumber(quotation.gstPercent)}%</td>
      ${columns.map((t) => `<td class="amt"><b>${formatRs(t?.cylinderWithGst ?? 0)}</b></td>`).join('')}
    </tr>
    <tr class="grand">
      <td class="lbl">Grand Total incl. GST</td>
      ${columns.map((t) => `<td class="amt red">${formatRs(t?.grandWithGst ?? 0)}</td>`).join('')}
    </tr>
    <tr>
      <td class="lbl">Advance</td>
      ${columns.map((t) => `<td class="amt red">${formatRs(t?.totalAdvance ?? 0)}</td>`).join('')}
    </tr>
  </table>`
      : `<table class="summary">
    <tr>
      <td class="lbl">Total Costing of Packaging Material</td>
      <td class="amt">${formatRs(columns[0]?.materialSubtotal ?? 0)}</td>
      <td class="c">GST ${formatNumber(quotation.gstPercent)}%</td>
      <td class="amt"><b>${formatRs(columns[0]?.materialWithGst ?? 0)}</b></td>
      <td class="lbl">${formatNumber(quotation.materialAdvancePercent)}% Material Payment Advance</td>
      <td class="amt">${formatRs(columns[0]?.materialAdvance ?? 0)}</td>
    </tr>
    <tr>
      <td class="lbl">Total Costing of Cylinder</td>
      <td class="amt">${formatRs(columns[0]?.cylinderSubtotal ?? 0)}</td>
      <td class="c">GST ${formatNumber(quotation.gstPercent)}%</td>
      <td class="amt"><b>${formatRs(columns[0]?.cylinderWithGst ?? 0)}</b></td>
      <td class="lbl">${formatNumber(quotation.cylinderAdvancePercent)}% Cylinder Payment Advance</td>
      <td class="amt">${formatRs(columns[0]?.cylinderAdvance ?? 0)}</td>
    </tr>
    <tr class="grand">
      <td class="lbl">Grand Total</td>
      <td class="amt">${formatRs(columns[0]?.grandSubtotal ?? 0)}</td>
      <td class="c">GST ${formatNumber(quotation.gstPercent)}%</td>
      <td class="amt red">${formatRs(columns[0]?.grandWithGst ?? 0)}</td>
      <td class="lbl">Advance</td>
      <td class="amt red">${formatRs(columns[0]?.totalAdvance ?? 0)}</td>
    </tr>
  </table>`
  }

  ${(() => {
    /*
     * The cylinder total includes transport, so a customer checking it as
     * cylinders x cost-per-cylinder lands short by exactly the transport and
     * concludes the quotation is wrong. Say so — but only when transport was
     * actually charged, so a document that carries none is not cluttered by a
     * note about it.
     */
    const transport = quotation.items.reduce((sum, item) => sum + item.transportCost, 0);
    if (transport <= 0) return '';
    return `<div class="closing">Cylinder cost includes ${esc(
      formatRs(transport),
    )} transport.</div>`;
  })()}

  <div class="closing">We look forward to your valued order and assure you of our best quality and service at all times.</div>

  ${show(quotation.notes) ? `<div class="closing"><b>Note:</b> ${esc(quotation.notes)}</div>` : ''}

  <section class="terms">
    <h4>Terms and Condition:</h4>
    <ol>${quotation.terms.map((term) => `<li>${esc(term)}</li>`).join('')}</ol>
  </section>

  <section class="foot">
    <div class="bank">
      <h4>Bank Details: ${COMPANY.bank.name}</h4>
      <div>Acc. Name: ${COMPANY.bank.account}</div>
      <div>Acc. No.: ${COMPANY.bank.accountNo}</div>
      <div>Acc. Type: ${COMPANY.bank.accountType}</div>
      <div>IFSC No.: ${COMPANY.bank.ifsc}</div>
      <div>Branch Name: ${COMPANY.bank.branch}</div>
      <div>GST No.: ${COMPANY.bank.gst}</div>
    </div>
    ${
      assets.paymentQr
        ? `<div class="payqr">
             <h4>QR Code For Payment</h4>
             <img src="${assets.paymentQr.dataUri}" alt="Payment QR code" />
           </div>`
        : ''
    }
    <div class="signoff">
      <div>Thanks and Regards,</div>
      <div class="who">${COMPANY.signatory}</div>
      <div>Yuva Polyprint and Packaging Industries</div>
      <div>Mob. ${COMPANY.signatoryMobile}</div>
    </div>
  </section>

  ${
    assets.footer
      ? ''
      : `<section class="strip">
    <div>
      <div>${COMPANY.addressLine}</div>
      <div>${COMPANY.phones}</div>
      <div>${COMPANY.website} &nbsp;·&nbsp; ${COMPANY.emailAddress}</div>
    </div>
    <ul>${COMPANY.services.map((service) => `<li>${service}</li>`).join('')}</ul>
  </section>`
  }

</div>

  ${
    assets.footer
      ? `<div class="band band-bottom"><img src="${assets.footer.dataUri}" alt="" /></div>`
      : ''
  }

</div>
</body>
</html>`;
}
