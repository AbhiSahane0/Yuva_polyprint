import { formatNumber, formatRs, type Quotation, type QuotationItem } from '@yuva/shared';
import { getInterFontFaces, getQuotationAssets } from './quotation-assets.js';
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
 * The layout follows the reference the works' customer signed off: who it is
 * for, the four figures, the jobs with a total line, the terms beside the
 * advance due now, then the bank, the QR and the two signatures.
 *
 * **One page for a typical quotation.** The space between sections tightens as
 * jobs are added (see `spacingFor`), and a short script at the foot of the
 * page scales the sheet down slightly if it would otherwise overrun by a few
 * millimetres — so the bank, QR and signatures never drop to a second page on
 * their own. A quotation too long for that runs onto a second page, which is
 * what A4 is for.
 *
 * Styling here is the quotation's own. `BASE_CSS` is shared with the job card
 * and the certificate, so everything this document changes about it — page
 * margins, typeface, rule colour — is overridden below rather than edited there.
 */

/** A hairline of the four brand colours, as the letterhead's own rule. */
const BAND =
  '<div class="band"><i class="m"></i><i class="g"></i><i class="o"></i><i class="i"></i></div>';

/** Printable height of the page: A4 less the top and bottom margins below. */
const PRINTABLE_MM = 297 - 9 - 8;

/**
 * How far the sheet may be scaled to stay on one page. Below this the type
 * gets too small to read comfortably, and a second page is the better answer.
 */
const MIN_FIT_SCALE = 0.86;

/**
 * How airy the page is, by the number of jobs on it.
 *
 * Generous when there is room and tighter as rows are added — the space
 * between sections first, then the padding inside each row — so a short
 * quotation does not look sparse and a longer one still closes on its first
 * page.
 */
export interface Spacing {
  /** Between major sections, in CSS px. */
  gap: number;
  /** Above and below the text of a job row, in mm. */
  rowPad: number;
}

export function spacingFor(jobs: number): Spacing {
  if (jobs <= 1) return { gap: 30, rowPad: 2.6 };
  if (jobs === 2) return { gap: 26, rowPad: 2.6 };
  if (jobs === 3) return { gap: 20, rowPad: 2.2 };
  return { gap: 14, rowPad: 1.6 };
}

/** `20-11-26` — every date on the quotation prints as DD-MM-YY. */
export function quotationDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.slice(0, 10).split('-');
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year.slice(-2)}`;
}

/**
 * The styles the trade sells by the piece. On the quotation these lines read
 * in pouches and a rate per pouch first, with the kilograms underneath.
 */
const SOLD_BY_THE_POUCH = new Set<string>([
  'STANDUP',
  'STANDUP_ZIPPER',
  'STANDUP_NO_ZIPPER',
  'SPOUT',
  'ZIPPER',
  'THREE_SIDE_SEAL_ZIPPER',
]);

export function soldByThePouch(item: Pick<QuotationItem, 'jobKind' | 'pouchType'>): boolean {
  return (
    item.jobKind !== 'ROLL' && item.pouchType !== null && SOLD_BY_THE_POUCH.has(item.pouchType)
  );
}

/**
 * The rate per pouch, to as few decimals as still multiply back to the line.
 *
 * Two places where that is exact (a rate the office typed per pouch), up to
 * four where it is not — "Rs. 5.69" against 21,000 pouches is Rs. 97 away from
 * the line total, and a customer who checks the sum should find it adds up.
 */
export function pouchRate(total: number, pouches: number): string {
  if (!(pouches > 0) || !(total > 0)) return '';
  const exact = total / pouches;
  for (const places of [2, 3, 4]) {
    const shown = Number(exact.toFixed(places));
    if (Math.abs(shown * pouches - total) < 1) return formatRs(shown, places);
  }
  return formatRs(exact, 4);
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
    : '';

  return `<div class="client card" data-signature-slot="client">
      <div class="eyebrow">Client e-signature</div>
      <div class="slot">${body}</div>
      <div class="hint">${note}</div>
    </div>`;
}

/**
 * Scales the sheet down just enough to stay on one page when it would overrun.
 *
 * Runs in the renderer, because only the renderer knows how tall the text set
 * — a long address or job name wraps where nobody can predict it. Measured
 * once the fonts are in (Puppeteer waits for the same before printing) and
 * again on load, so a measurement taken against a fallback font is replaced.
 * Beyond `MIN_FIT_SCALE` it leaves the sheet alone and lets it run on.
 */
const FIT_TO_PAGE = `<script>
(function () {
  var mm = 96 / 25.4;
  var limit = ${PRINTABLE_MM} * mm - 2;
  function fit() {
    var sheet = document.querySelector('.sheet');
    if (!sheet || !sheet.firstElementChild) return;
    sheet.style.zoom = '';
    var top = sheet.firstElementChild.getBoundingClientRect().top;
    var bottom = sheet.lastElementChild.getBoundingClientRect().bottom;
    var height = bottom - top;
    if (height <= limit) return;
    var scale = Math.floor((limit / height) * 1000) / 1000;
    if (scale >= ${MIN_FIT_SCALE}) sheet.style.zoom = String(scale);
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('load', fit);
})();
</script>`;

export function renderQuotationHtml(quotation: Quotation): string {
  const tier = quotedTier(quotation);
  const position = tier?.position ?? 1;
  const gst = formatNumber(quotation.gstPercent);
  const cylinders = chargesCylinders(quotation);
  const transport = transportTotal(quotation);
  const jobs = quotation.items.length;
  const spacing = spacingFor(jobs);
  /* Four jobs or more: the tighter layout at the foot of the stylesheet. */
  const compact = jobs >= 4;
  const anyByPouch = quotation.items.some(soldByThePouch);
  const signature = getQuotationAssets().proprietorSignature;

  /*
   * The build-up, in the order the reference reads: the material, the
   * cylinders, the tax, and what that comes to. The cylinder cell is absent
   * rather than zero on a repeat order — a nought against a heading invites
   * the question the line exists to answer.
   */
  const summary: [string, number, string, boolean][] = [
    ['Material', tier?.materialSubtotal ?? 0, 'before GST', false],
    ...(cylinders
      ? ([
          [
            'Cylinder',
            tier?.cylinderSubtotal ?? 0,
            transport > 0
              ? `Making charges, incl. ${formatRs(transport)} transport`
              : 'Making charges',
            false,
          ],
        ] as [string, number, string, boolean][])
      : []),
    [
      `GST ${gst}%`,
      (tier?.grandWithGst ?? 0) - (tier?.materialSubtotal ?? 0) - (tier?.cylinderSubtotal ?? 0),
      cylinders ? 'on material & cylinders' : 'on the material',
      false,
    ],
    ['Total payable', tier?.grandWithGst ?? 0, `including GST at ${gst}%`, true],
  ];

  /* Who it is for. Anything not on file is left out rather than dashed. */
  const address = [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
    .map((line) => show(line).trim())
    .filter(Boolean)
    .join(', ');
  const contacts: [string, string][] = (
    [
      ['GST No.', show(quotation.gstNumber).trim()],
      ['Phone', phone(quotation.mobile)],
      ['Email', show(quotation.email).trim()],
    ] as [string, string][]
  ).filter(([, value]) => value !== '');

  let totalKg = 0;
  const rows = quotation.items
    .map((item, index) => {
      const q = quantityOf(item, position);
      const isPouch = item.jobKind !== 'ROLL';
      const byPouch = soldByThePouch(item);
      const kg = q?.quantityKg ?? 0;
      const count = q?.totalPouches ?? 0;
      const amount = q?.totalAmount ?? 0;
      /* Exact enough to multiply back where it is the price; a guide where it is not. */
      const each =
        !isPouch || count <= 0 || amount <= 0
          ? ''
          : byPouch
            ? pouchRate(amount, count)
            : formatRs(q?.costPerPouch ?? amount / count, 2);
      totalKg += kg;

      const colours =
        coloursOf(item) || `${item.cylinderCount} colour${item.cylinderCount === 1 ? '' : 's'}`;
      const cylinderNote =
        item.chargeCylinders && item.totalCylinderCost > 0
          ? `${item.cylinderCount} cylinder${item.cylinderCount === 1 ? '' : 's'} at ${formatRs(
              item.costPerCylinder,
            )}`
          : 'Cylinder in house';

      /* A pouch sold by the piece leads with the pieces; anything else with the weight. */
      const order =
        byPouch && count > 0
          ? `${formatNumber(count)} pouches<span class="sub">${formatNumber(kg, 2)} kg</span>`
          : `${formatNumber(kg, 2)} kg${
              isPouch ? `<span class="sub">${formatNumber(count)} pouches</span>` : ''
            }`;
      const perKg = formatRs(q?.ratePerKg ?? 0, 2);
      const rate =
        byPouch && each
          ? `${each}<span class="unit">/pouch</span><span class="sub">${perKg} a kg</span>`
          : `${perKg}${anyByPouch ? '<span class="unit">/kg</span>' : ''}${
              each ? `<span class="sub">${each} a pouch</span>` : ''
            }`;

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
          <td class="order num">${order}</td>
          <td class="rate num">${rate}</td>
          <td class="amt num">${formatRs(amount)}</td>
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
    /* Labels the customer needs to read at arm's length: darker, and bold. */
    --label-strong: #4A4E63;
    --pill: #EEF0F5;
    --radius: 6px;
    --highlight: #FFF3EC;
    --gap: ${spacing.gap}px;
    --row-pad: ${spacing.rowPad}mm;
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
  body, .num, .figures dd, .due dd {
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
  .top .iso { flex: none; padding-left: 5mm; }

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
  .to-band .for { margin: 0; font-size: 10pt; font-weight: 800; color: #000;
                  letter-spacing: .01em; text-transform: uppercase; line-height: 1.3; }
  .to-band .name { margin-top: 1.6mm; font-size: 13pt; font-weight: 500; color: var(--ink);
                   line-height: 1.25; overflow-wrap: anywhere; }
  .to-band .addr { margin-top: 1.2mm; font-size: 7.6pt; font-weight: 700; color: var(--body);
                   line-height: 1.45; overflow-wrap: anywhere; }
  .to-band .contacts { display: flex; flex-wrap: wrap; gap: 1.5mm 9mm; margin-top: 3mm; }
  .to-band .contacts dl { margin: 0; min-width: 0; }
  .to-band .contacts dt { font-size: 6pt; letter-spacing: .08em; text-transform: uppercase;
                          color: var(--label); font-weight: 600; }
  .to-band .contacts dd { margin: .5mm 0 0; font-size: 7.8pt; color: var(--ink); font-weight: 700;
                          overflow-wrap: anywhere; }

  .meta { flex: none; width: 40mm; display: flex; margin: 0; overflow: hidden; }
  .meta .cell { flex: 1; padding: 1.6mm 1.5mm 1.8mm; text-align: center; }
  .meta .cell + .cell { border-left: 1px solid var(--rule); }
  .meta dt { font-size: 5.6pt; letter-spacing: .08em; text-transform: uppercase;
             color: var(--label-strong); font-weight: 700; }
  .meta dd { margin: .8mm 0 0; font-size: 9.6pt; color: var(--ink); font-weight: 700; }

  /* --- the figures ------------------------------------------------------- */
  .figures { display: flex; align-items: stretch; margin: var(--gap) 0 0; overflow: hidden; }
  .figures .part { flex: 1; padding: 3.8mm 4mm 4mm; border-right: 1px solid var(--rule);
                   min-width: 0; }
  .figures .part:last-child { border-right: 0; }
  .figures dt { font-size: 6.4pt; letter-spacing: .08em; text-transform: uppercase;
                color: var(--label-strong); font-weight: 700; white-space: nowrap; }
  .figures dd { margin: 1.6mm 0 0; font-size: 12.6pt; color: var(--ink); font-weight: 700;
                line-height: 1.15; }
  .figures .note { display: block; font-size: 6.6pt; font-weight: 400; color: var(--label);
                   font-style: italic; margin-top: 1.2mm; }
  /* The one figure allowed to be loud, and it is loud by colour, not by size. */
  .figures .sum { background: var(--highlight); border-left: 3px solid var(--orange); }
  .figures .sum dd { color: var(--orange); }

  /* --- the jobs, as a schedule ------------------------------------------- */
  .band-title { color: var(--label-strong); font-size: 6.6pt; letter-spacing: .08em; font-weight: 700;
                margin-bottom: 2.4mm; }
  .band-title::after { border-top: 1px solid var(--rule); }
  .schedule { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .schedule thead th { font-size: 6.4pt; letter-spacing: .08em; text-transform: uppercase;
                       color: var(--label-strong); font-weight: 700; text-align: left;
                       padding: 0 2.5mm 2mm; border-bottom: 1px solid var(--rule); }
  .schedule tr { break-inside: avoid; }
  .schedule td { padding: var(--row-pad) 2.5mm calc(var(--row-pad) + .2mm); vertical-align: top;
                 font-size: 7.8pt; color: var(--ink); border-bottom: 1px solid var(--rule);
                 line-height: 1.35; }
  .schedule .c-no { width: 6%; }
  .schedule .c-job { width: 32%; }
  .schedule .c-print { width: 20%; }
  .schedule .c-order { width: 13%; }
  .schedule .c-rate { width: 15%; }
  .schedule .c-amt { width: 14%; }
  .schedule .no span { display: inline-block; background: var(--pill); border-radius: 3px;
                       padding: .5mm 1.6mm; font-size: 6.4pt; font-weight: 600;
                       color: var(--body); }
  .schedule .job b { display: block; font-size: 8.2pt; line-height: 1.3; }
  .schedule .rate { font-weight: 700; color: var(--ink); }
  .schedule .rate .unit { font-size: 6.4pt; font-weight: 600; }
  .schedule .amt { font-weight: 700; }
  /* Every second line is a smaller fact about the one above it, in the same
     quiet grey as the notes. */
  .schedule .sub { display: block; font-size: 6.8pt; color: var(--label);
                   font-weight: 400; line-height: 1.3; margin-top: .5mm; }
  /* The total line: the weight ordered and the material it comes to. */
  .schedule tfoot td { border-bottom: 1px solid var(--rule); padding-top: 1.8mm;
                       padding-bottom: 1.8mm; font-size: 8.6pt; }
  .schedule tfoot .amt { font-size: 9.4pt; }

  /* --- terms, and what is payable now ------------------------------------ */
  .settle { display: flex; gap: 8mm; align-items: flex-start; }
  .settle .terms { flex: 1; min-width: 0; }
  .settle ul { list-style: none; margin: 2.4mm 0 0; padding: 0; }
  .settle li { position: relative; padding-left: 4mm; margin-bottom: 1.3mm;
               font-size: 7.4pt; color: var(--body); line-height: 1.4; }
  .settle li::before { content: ''; position: absolute; left: .6mm; top: 1.2mm;
                       width: 1.3mm; height: 1.3mm; border-radius: 50%; background: var(--ink); }
  /* The advance, highlighted: the one figure the customer acts on today. */
  .due { flex: none; width: 58mm; margin: 2.4mm 0 0; padding: 3mm 4mm 3.2mm;
         background: var(--highlight); border-left: 3px solid var(--orange);
         border-radius: var(--radius); }
  .due dt { font-size: 6.8pt; letter-spacing: .04em; color: var(--label-strong); font-weight: 700; }
  .due dd { margin: 0; }
  .due .amount { margin-top: 1.2mm; font-size: 12.6pt; color: var(--orange); font-weight: 700;
                 line-height: 1.15; }
  .due .note { margin-top: 1.4mm; font-size: 6.6pt; color: var(--label); font-style: italic;
               line-height: 1.45; }

  /* --- bank, scan and the two signatures --------------------------------- */
  /*
   * The payment row and the close travel together: if they do not both fit
   * under the terms, both go over, so the close never sits alone on a page.
   */
  .pay { display: flex; gap: 4.5mm; align-items: flex-start; break-inside: avoid;
         border-top: 1px solid var(--rule); padding-top: 2.4mm; }
  .pay .bank { flex: 1; min-width: 0; }
  .pay .rows { margin: 2.4mm 0 0; }
  .pay .row { display: flex; gap: 2.5mm; margin-bottom: 1.3mm; }
  .pay .row dt { flex: none; width: 19mm; font-size: 7pt; color: var(--label); }
  .pay .row dd { margin: 0; font-size: 7pt; color: var(--ink); font-weight: 400; }

  .pay .scan { flex: none; text-align: center; }
  .pay .scan .card { padding: 2.4mm; line-height: 0; }
  .pay .scan .pay-qr { display: block; }
  .pay .scan .caption { display: block; font-size: 5.8pt; letter-spacing: .1em;
                        text-transform: uppercase; color: var(--label); margin-top: 1.2mm; }

  .pay .client { flex: none; width: 44mm; padding: 2.4mm 3mm 2.2mm;
                 display: flex; flex-direction: column; }
  .pay .client .eyebrow { color: var(--body); font-weight: 600; }
  .pay .client .slot { height: 14mm; display: flex; align-items: center;
                       justify-content: center; }
  .pay .client .client-sig { max-width: 100%; max-height: 100%; }
  .pay .client .hint { border-top: 1px dashed var(--rule); padding-top: 1mm;
                       font-size: 6.4pt; color: var(--label); font-style: italic;
                       text-align: center; }

  .pay .sign { flex: none; width: 40mm; text-align: center; padding-top: 0; }
  /* The proprietor's signature when it is on file, else room to sign by hand. */
  .pay .sign .space { height: 12mm; display: flex; align-items: flex-end; justify-content: center; }
  .pay .sign .space img { max-height: 100%; max-width: 100%; }
  .pay .sign .line { border-top: 0.75pt solid var(--ink); margin: 1mm 0 1.4mm; }
  .pay .sign .firm { font-size: 6.8pt; color: var(--body); line-height: 1.35; }

  /* --- the close ---------------------------------------------------------- */
  .close { text-align: center; break-inside: avoid; break-before: avoid; }
  .close .motto { font-size: 10.2pt; color: var(--magenta); font-weight: 700; }
  .close .thanks { font-size: 7.2pt; color: var(--body); line-height: 1.55; margin-top: 2mm; }
  .close .band { margin-top: 4mm; }

  /*
   * --- four jobs or more ---------------------------------------------------
   *
   * Trims the furniture around the schedule — never the figures — so a long
   * quotation still closes on its first page.
   */
  .compact .top .who { font-size: 7pt; line-height: 1.75; }
  .compact .top .who b { font-size: 9.8pt; margin-bottom: .3mm; }
  .compact .to-band .name { font-size: 12pt; margin-top: 1mm; }
  .compact .to-band .contacts { margin-top: 2mm; }
  .compact .figures .part { padding: 2.6mm 4mm 2.8mm; }
  .compact .figures dd { font-size: 11.6pt; margin-top: 1mm; }
  .compact .schedule .job b { font-size: 8pt; }
  .compact .settle li { margin-bottom: 1mm; }
  .compact .due { padding: 2.4mm 4mm 2.6mm; }
  .compact .close .motto { font-size: 9.8pt; }
  .compact .close .thanks { margin-top: 1.2mm; }
  .compact .close .band { margin-top: 2.6mm; }
</style></head>
<body${compact ? ' class="compact"' : ''}>
<div class="sheet">

  <header class="top">
    ${mark('logo', compact ? 22 : 24)}
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
      <div class="name">${esc(quotation.customerName)}</div>
      ${address ? `<div class="addr">${esc(address)}</div>` : ''}
      ${
        contacts.length > 0
          ? `<div class="contacts">${contacts
              .map(([label, value]) => `<dl><dt>${esc(label)}</dt><dd>${esc(value)}</dd></dl>`)
              .join('')}</div>`
          : ''
      }
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
          <th>#</th><th>Job</th><th>Printing</th><th>Order</th><th>${
            anyByPouch ? 'Rate' : 'Rate a kg'
          }</th><th>Material</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td></td><td></td><td></td>
          <td class="order num">${formatNumber(totalKg, Number.isInteger(totalKg) ? 0 : 2)} kg</td>
          <td></td>
          <td class="amt num">${formatRs(tier?.materialSubtotal ?? 0)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <section class="settle section">
    <div class="terms">
      <div class="eyebrow">TERMS</div>
      <ul>${terms.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    </div>
    <dl class="due">
      <dt>Advance Payable Now</dt>
      <dd class="amount num">${formatRs(tier?.totalAdvance ?? 0)}</dd>
      <dd class="note">${formatNumber(quotation.materialAdvancePercent)}% of the material${
        cylinders ? ` and ${formatNumber(quotation.cylinderAdvancePercent)}% of the cylinders` : ''
      }.<br />The balance falls due on delivery.</dd>
    </dl>
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
      <div class="space">${signature ? `<img src="${signature.dataUri}" alt="" />` : ''}</div>
      <div class="line"></div>
      <div class="firm">For ${esc(COMPANY.bank.account)}</div>
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
${FIT_TO_PAGE}
</body></html>`;
}
