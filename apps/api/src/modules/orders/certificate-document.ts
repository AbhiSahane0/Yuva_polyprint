import { formatNumber } from '@yuva/shared';
/* The letterhead is the company's, not the quotation's — see job-card-document
   for the same note. Both certificates go out on the works' own paper. */
import { BASE_CSS, COMPANY, mark } from '../quotations/quotation-letterhead.js';
import { esc, longDate } from '../quotations/templates/shared.js';

/**
 * **The two certificates the office issues with a consignment.**
 *
 * A *certificate of analysis* states what the laminate is — layer by layer, in
 * microns — and a *food grade certificate* says the same thing as a sentence
 * and certifies the material is virgin and fit for food contact. The customer's
 * own auditor asks for both, usually by return of post, and the works has been
 * typing them into a spreadsheet one job at a time.
 *
 * Everything on them is read off the design and the order, so neither can
 * disagree with the job card the same design printed. Only the PO number is
 * the order's, and the date is the day it is issued.
 *
 * **Two corrections to the works' own sheet**, both deliberate:
 *
 *  - Their thickness row reads the V Notch column by mistake, one column off
 *    the one it wants, so every certificate they have issued states the
 *    thickness as "N/A Micron". This adds the plies up instead.
 *  - Their structure sentence prints every ply whether the laminate has it or
 *    not, so a two-ply job certifies "0 Micron METPET". A ply that is not
 *    there is left out.
 */

export type CertificateKind = 'coa' | 'food-grade';

export interface CertificateInput {
  kind: CertificateKind;
  /** The day it is issued. Everything else is a fact about the job. */
  issuedOn: string;
  /** The customer's own reference, off the order. Blank where they gave none. */
  poNumber: string;

  customerName: string;
  /** Address as it prints, already laid out in lines. */
  addressLines: string[];

  jobName: string;
  /** Pouch Form, Roll Form — the works' own column. */
  jobType: string;
  layers: number;
  petMicron: number;
  metPetMicron: number;
  polyMicron: number;
  /** "White LDPE", "Nat Metlocene" — the poly's grade, as the works names it. */
  polyType: string;
  /** One cylinder to a colour, which is how the works counts them. */
  colours: number;
  /** The design's own size, height first, as their sheet prints it. */
  designHeightMm: number;
  designOpenWidthMm: number;
}

/** A hairline of the four brand colours, as the letterhead's own rule. */
const BAND =
  '<div class="band"><i class="m"></i><i class="g"></i><i class="o"></i><i class="i"></i></div>';

/**
 * Every ply the laminate actually has, in the order it is built up.
 *
 * `grade` is the poly's — "White LDPE", "Nat Metlocene" — because that is the
 * ply a food auditor asks about by name. The other two are what they are.
 */
function plies(input: CertificateInput): { name: string; micron: number; grade: string }[] {
  return [
    { name: 'PET', micron: input.petMicron, grade: '' },
    { name: 'METPET', micron: input.metPetMicron, grade: '' },
    { name: 'POLY', micron: input.polyMicron, grade: input.polyType.trim() },
  ].filter((ply) => ply.micron > 0);
}

const micron = (value: number) => `${formatNumber(value, 0)} micron`;

/** "12 micron PET, 12 micron METPET and 45 micron Nat Metlocene". */
function structureSentence(input: CertificateInput): string {
  const parts = plies(input).map((ply) => `${micron(ply.micron)} ${ply.grade || ply.name}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One line of the specification table. A ply sits under the thickness. */
interface SpecRow {
  label: string;
  value: string;
  /** True for the plies, which the works lists under the thickness, unnumbered. */
  under?: boolean;
}

/** The specification table, which is the certificate of analysis itself. */
function analysisRows(input: CertificateInput): SpecRow[] {
  const total = input.petMicron + input.metPetMicron + input.polyMicron;

  return [
    { label: 'Product name', value: input.jobName },
    {
      label: 'Layers',
      value: `${formatNumber(input.layers, 0)} layer${input.layers === 1 ? '' : 's'}`,
    },
    { label: 'Thickness (\u00b1 2 micron)', value: total > 0 ? micron(total) : '' },
    /* Named as the works names them, with the poly's grade beside its micron
       — PET, METPET, POLY down the page and "55 micron White LDPE" against
       the one the auditor will ask about. */
    ...plies(input).map((ply) => ({
      label: ply.name,
      value: ply.grade ? `${micron(ply.micron)} ${ply.grade}` : micron(ply.micron),
      under: true,
    })),
    {
      label: 'Number of colours',
      value: input.colours > 0 ? `${formatNumber(input.colours, 0)} colours` : '',
    },
    { label: 'Material form', value: input.jobType },
    {
      label: 'Material size',
      value:
        input.designHeightMm > 0 && input.designOpenWidthMm > 0
          ? `${formatNumber(input.designHeightMm, 0)} x ${formatNumber(input.designOpenWidthMm, 0)} mm`
          : '',
    },
    /* Flexible laminates are not any one of the six numbered resins, which is
       what (7) Other is for. It is a fact about the structure, not a setting. */
    { label: 'Material category', value: '7 (Other)' },
    { label: 'PO number', value: input.poNumber },
  ];
}

/**
 * The food grade certificate's own wording, as the works wrote it.
 *
 * Kept close to their sentences on purpose: this is a document a customer's
 * auditor has already accepted, and rewriting it to read better would mean
 * asking them to accept it again.
 */
function foodGradeParagraphs(input: CertificateInput): string[] {
  const structure = structureSentence(input);

  return [
    `We hereby certify that the material used in the <b>${esc(input.jobName)}</b> is virgin, food-grade quality.${
      structure
        ? ` The structure of the pouch is composed of ${formatNumber(input.layers, 0)} layers: ${esc(structure)}.`
        : ''
    }`,
    'All materials used in the manufacturing process comply with relevant food safety and hygiene standards, ensuring their suitability for direct food contact applications. This structure falls under the (7) Other category of materials as per regulatory classification.',
    'The material has been manufactured under controlled conditions in accordance with our quality assurance protocols, ensuring product consistency and safety.',
  ];
}

export function certificateTitle(kind: CertificateKind): string {
  return kind === 'coa' ? 'Certificate of Analysis' : 'Food Grade Material Certificate';
}

export function renderCertificateHtml(input: CertificateInput): string {
  const title = certificateTitle(input.kind);

  const body =
    input.kind === 'coa'
      ? `
    <table class="spec">
      <thead>
        <tr><th class="no">Sr. no.</th><th>Specification</th><th>Standard</th></tr>
      </thead>
      <tbody>
        ${(() => {
          let numbered = 0;
          return analysisRows(input)
            .map((row) => {
              if (!row.under) numbered += 1;
              return `
          <tr>
            <td class="no num">${row.under ? '' : `${numbered}.0`}</td>
            <td class="what${row.under ? ' under' : ''}">${esc(row.label)}</td>
            <td class="std">${row.value ? esc(row.value) : '<span class="nil">—</span>'}</td>
          </tr>`;
            })
            .join('');
        })()}
      </tbody>
    </table>`
      : `
    <div class="prose">
      ${foodGradeParagraphs(input)
        .map((paragraph) => `<p>${paragraph}</p>`)
        .join('')}
    </div>
    <dl class="refs">
      ${input.poNumber ? `<div><dt>PO number</dt><dd>${esc(input.poNumber)}</dd></div>` : ''}
      <div><dt>Date of issue</dt><dd>${esc(longDate(input.issuedOn))}</dd></div>
    </dl>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)} — ${esc(input.jobName)}</title>
<style>
${BASE_CSS}

  @page { size: A4 portrait; margin: 12mm 13mm 10mm; }
  @media screen { .sheet { padding: 12mm 13mm 10mm; } }

  .top { display: flex; align-items: flex-start; gap: 6mm; }
  .top .who { flex: 1; font-size: var(--t-fine); color: var(--muted); line-height: 1.45; }
  .top .who b { display: block; font-size: 10.4pt; color: var(--ink); }
  .top .when { flex: none; text-align: right; font-size: var(--t-value); color: var(--body); }
  .top .when b { display: block; font-size: var(--t-label); letter-spacing: .1em;
                 text-transform: uppercase; color: var(--muted); }

  .band { display: flex; height: 1.1mm; margin: 2.6mm 0 6mm; }
  .band i { display: block; }
  .band .m { flex: 26; background: var(--magenta); }
  .band .g { flex: 13; background: var(--green); }
  .band .o { flex: 16; background: var(--orange); }
  .band .i { flex: 45; background: var(--indigo); }

  /* Who it is addressed to. A certificate is a letter before it is a record. */
  .to .label { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
               color: var(--muted); font-weight: 700; }
  .to .name { font-size: var(--t-name); color: var(--ink); font-weight: 700; margin-top: 1mm; }
  .to .line { font-size: var(--t-body); color: var(--body); line-height: 1.45; }

  h1 { font-size: var(--t-lead); letter-spacing: .06em; text-transform: uppercase;
       color: var(--indigo); text-align: center; font-weight: 700;
       margin: 8mm 0 6mm; padding-bottom: 2mm; border-bottom: 0.8pt solid var(--hair); }

  /* --- the certificate of analysis -------------------------------------- */
  .spec { width: 100%; border-collapse: collapse; }
  .spec th { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; text-align: left;
             padding: 0 2.5mm 1.4mm; border-bottom: 0.8pt solid var(--hair); }
  .spec td { padding: 2mm 2.5mm; font-size: var(--t-value); color: var(--ink);
             border-bottom: 0.5pt solid var(--hair); vertical-align: top; }
  .spec .no { width: 16mm; color: var(--muted); font-weight: 700; }
  .spec .what { width: 62mm; }
  /* A ply, listed under the thickness it is part of. */
  .spec .what.under { padding-left: 7mm; color: var(--body); }
  .spec .std { font-weight: 700; }
  .spec .nil { color: var(--hair); font-weight: 400; }

  /* --- the food grade certificate ---------------------------------------- */
  .prose p { margin: 0 0 4mm; font-size: var(--t-body); line-height: 1.65; color: var(--body);
             text-align: justify; }
  .refs { display: flex; gap: 10mm; margin: 6mm 0 0; padding-top: 3mm;
          border-top: 0.5pt solid var(--hair); }
  .refs dt { font-size: var(--t-label); letter-spacing: .1em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; }
  .refs dd { margin: .8mm 0 0; font-size: var(--t-value); color: var(--ink); font-weight: 700; }

  .mpcb { margin: 6mm 0 0; font-size: var(--t-body); color: var(--body); }

  /* Room for a signature and a stamp, which is what makes it a certificate. */
  .sign { margin-top: 10mm; }
  .sign .regards { font-size: var(--t-body); color: var(--body); }
  .sign .space { height: 20mm; }
  .sign .firm { font-size: var(--t-value); color: var(--ink); font-weight: 700; }
  .sign .place { font-size: var(--t-body); color: var(--muted); }
</style></head>
<body><div class="sheet">

  <div class="top">
    ${mark('logo', 12)}
    <div class="who">
      <b>${esc(COMPANY.name)}</b>
      ${esc(COMPANY.subtitle)}<br />
      ${esc(COMPANY.address)}<br />
      GSTIN ${esc(COMPANY.gst)}
    </div>
    <div class="when"><b>Date</b>${esc(longDate(input.issuedOn))}</div>
  </div>
  ${BAND}

  <div class="to">
    <div class="label">To,</div>
    <div class="name">${esc(input.customerName)}</div>
    ${input.addressLines.map((line) => `<div class="line">${esc(line)}</div>`).join('')}
  </div>

  <h1>${esc(title)}</h1>

  ${body}

  <p class="mpcb">Our MPCB number is ${esc(COMPANY.mpcb)}.</p>

  <div class="sign">
    <div class="regards">Thanks and regards,</div>
    <div class="space"></div>
    <div class="firm">${esc(COMPANY.name)} ${esc(COMPANY.subtitle)}</div>
    <div class="place">Sangamner</div>
  </div>

  <div class="running-foot">
    <span>${esc(COMPANY.name)} &nbsp;·&nbsp; ${esc(title)}</span>
    <span>${esc(input.jobName)}</span>
  </div>
</div></body></html>`;
}
