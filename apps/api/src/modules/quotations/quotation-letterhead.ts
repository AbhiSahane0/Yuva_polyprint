import { getQuotationAssets } from './quotation-assets.js';

/**
 * The letterhead, rebuilt in type around the company's own marks.
 *
 * The printed original is two full-width artwork bands — 42.6mm at the top,
 * 32.1mm at the bottom — which is **75mm of every page** spent on a logo, four
 * support icons, a contact strip and a photograph of finished packs. On a
 * one-job quotation that is most of the page.
 *
 * So the marks that cannot be redrawn stay as artwork and everything else
 * becomes text: the logo, the ISO mark and the QR are lifted out of
 * `header.png` by CSS crop, and the address, telephones, website and services
 * are set in type. Nothing is fabricated — the crops are windows onto the
 * works' own file — and the page gets about 30mm back.
 *
 * ### Why the marks are cropped rather than supplied separately
 *
 * A logo is a brand asset; redrawing one in CSS produces something that is
 * nearly right, which is worse than not trying. Cropping shows the real
 * artwork, needs no new files for the office to maintain, and needs no image
 * library in the API. The windows below were measured off the file itself:
 *
 *     header.png   1556 x 342
 *     logo         x   23- 526   y 14-314
 *     ISO          x 1166-1293   y 32-160
 *     QR           x 1350-1543   y 30-225
 */

/**
 * The four tiles of the YUVA mark, sampled from the logo rather than guessed.
 *
 * They are the whole palette. A premium document does not need a fifth colour
 * invented for it — it needs the four the company already owns, used with
 * restraint: the indigo carries structure, the orange marks the one figure the
 * customer is looking for, and the other two appear as accents or not at all.
 */
export const BRAND = {
  magenta: '#882878',
  green: '#409848',
  orange: '#C04828',
  indigo: '#503888',
  /* Neutrals chosen against the indigo rather than pure grey, so the page reads
     as one family under a printer's colour cast. */
  ink: '#1D1B2A',
  body: '#3E3B4F',
  muted: '#78748C',
  hair: '#DEDCE6',
  wash: '#F6F5F9',
} as const;

/** One CSS-cropped window onto the letterhead artwork. */
interface Crop {
  /** background-size, as a percentage pair. */
  size: string;
  /** background-position, as a percentage pair. */
  position: string;
  /** width / height of the window, so a caller can set one and get the other. */
  aspect: number;
}

const CROPS: Record<'logo' | 'iso' | 'qr', Crop> = {
  logo: { size: '309.34% 114.00%', position: '2.18% 33.33%', aspect: 1.677 },
  iso: { size: '1225.20% 267.19%', position: '81.60% 14.95%', aspect: 0.992 },
  qr: { size: '806.22% 175.38%', position: '99.05% 20.41%', aspect: 0.99 },
};

/**
 * A mark cut out of the letterhead, or nothing when there is no artwork.
 *
 * Returns an empty string rather than a placeholder: a document missing its
 * logo should look like a document with no logo, not like one with a broken
 * image in it.
 */
export function mark(which: keyof typeof CROPS, heightMm: number, className = ''): string {
  const { header } = getQuotationAssets();
  if (!header) return '';

  const crop = CROPS[which];
  const widthMm = (heightMm * crop.aspect).toFixed(2);

  return `<div class="mark ${className}" style="
    width:${widthMm}mm; height:${heightMm}mm;
    background-image:url('${header.dataUri}');
    background-size:${crop.size};
    background-position:${crop.position};
  "></div>`;
}

/** Whether the artwork is there at all — templates fall back to type without it. */
export function hasArtwork(): boolean {
  return getQuotationAssets().header !== null;
}

/** The payment QR, which has to be the real file: a wrong one takes money elsewhere. */
export function paymentQr(sizeMm: number): string {
  const { paymentQr: qr } = getQuotationAssets();
  if (!qr) return '';
  return `<img class="pay-qr" src="${qr.dataUri}" alt="" style="width:${sizeMm}mm;height:${sizeMm}mm" />`;
}

/**
 * The stylesheet every template shares.
 *
 * Page geometry, the palette as custom properties, and the handful of
 * primitives all three use — the marks, tabular figures, and the rule that
 * money never wraps. Everything else belongs to the template.
 */
export const BASE_CSS = `
  @page { size: A4 portrait; margin: 12mm 11mm 10mm; }
  * { box-sizing: border-box; }

  :root {
    --magenta: ${BRAND.magenta};
    --green: ${BRAND.green};
    --orange: ${BRAND.orange};
    --indigo: ${BRAND.indigo};
    --ink: ${BRAND.ink};
    --body: ${BRAND.body};
    --muted: ${BRAND.muted};
    --hair: ${BRAND.hair};
    --wash: ${BRAND.wash};

    /*
     * The scale, and the ceiling.
     *
     * A quotation is read at arm's length on a desk, not across a room, so
     * nothing on it needs to be large — and a figure set large reads as a
     * sales pitch rather than a price. The whole document sits inside 6.6pt
     * to 12.4pt: six steps, and --t-lead is the biggest thing allowed on the
     * page. Emphasis comes from weight, colour and the rule above a figure,
     * which is quieter and holds up better in print than size does.
     */
    --t-label: 6.6pt;   /* uppercase, letterspaced: the name of a figure */
    --t-fine: 7.8pt;    /* addresses, notes, the small print */
    --t-body: 8.6pt;    /* terms, running text */
    --t-value: 9.2pt;   /* every figure in a labelled pair */
    --t-name: 11pt;     /* a job name, a customer name */
    --t-lead: 12.4pt;   /* the total, and nothing else */

    --gutter: 5mm;
  }

  /*
   * At-page margins apply only when printing, so the on-screen preview would
   * otherwise run to the edge of the window and look nothing like the PDF the
   * customer receives. The office approves this preview; it has to be the same
   * document.
   */
  @media screen {
    body { background: #ECEAF2; padding: 12mm 0; }
    .sheet {
      width: 210mm; min-height: 297mm; margin: 0 auto;
      padding: 12mm 11mm 10mm; background: #fff;
      box-shadow: 0 2px 14px rgb(29 27 42 / 0.13);
    }
  }

  body {
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: var(--t-body);
    line-height: 1.5;
    color: var(--body);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .mark { background-repeat: no-repeat; flex: none; }

  /* Money and measurements line up in columns and must never wrap: a split
     "Rs. 8,625" reads as two different numbers on a customer's desk. */
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .r { text-align: right; }
  .c { text-align: center; }

  strong, b { color: var(--ink); font-weight: 700; }

  .eyebrow {
    font-size: var(--t-label); letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
  }

  /* A section's name, with a hairline carrying it to the edge of the block.
     Cheaper than a heading and it says the same thing: a new part starts here. */
  .band-title {
    display: flex; align-items: center; gap: 3mm;
    font-size: var(--t-label); letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; margin-bottom: 2.2mm;
  }
  .band-title::after {
    content: ''; flex: 1; height: 0; border-top: 0.5pt solid var(--hair);
  }

  /* Repeated on every page by Chromium, which is what the letterhead is for. */
  .running-foot {
    position: fixed; bottom: 0; left: 0; right: 0;
    border-top: 0.5pt solid var(--hair);
    padding-top: 1.6mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: var(--t-label); color: var(--muted);
  }

  /*
   * And hidden on screen — after the rule that shows it, not before.
   *
   * The hide used to live in the @media screen block above, which sets the page
   * geometry. Equal specificity, so the later plain rule's display:flex won
   * and the foot was fixed to the bottom of the browser window, printing the
   * company name across the middle of the bank details. In the PDF it was
   * correct, which is the kind of difference nobody looks for.
   */
  @media screen {
    .running-foot { display: none; }
  }
`;

/** The company, as it prints. Held here so three templates cannot disagree. */
export const COMPANY = {
  name: 'YUVA POLYPRINT',
  subtitle: '& Packaging Industries',
  address: '163A, Sangamner Co-Op. Industrial Estate Ltd.',
  phones: ['+91 77200 46002', '+91 77200 46005'],
  website: 'www.yuvapolyprint.com',
  email: 'info@yuvapolyprint.com',
  gst: '27AIGPH5992Q1ZD',
  services: [
    'Rotogravure Printing',
    'Flexible Packaging Pouch',
    'Standup, Zipper & Spout Pouch',
    'Printed HDPE Bags',
  ],
  bank: {
    name: 'Bank of Maharashtra',
    account: 'Yuva Polyprint and Packaging Industries',
    accountNo: '60325292340',
    accountType: 'CC Account',
    ifsc: 'MAHB0000420',
    branch: 'Sangamner',
  },
  signatory: 'Anand K. Hase',
  signatoryRole: 'Director',
  signatoryMobile: '+91 77200 46002',
} as const;
