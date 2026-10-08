import {
  asHoursMinutes,
  formatNumber,
  type JobCardWorking,
  type JobSheet,
  type JobSpecification,
} from '@yuva/shared';
/*
 * The letterhead is the company's, not the quotation's — it lives beside the
 * quotation because that is the document that needed it first. A job card
 * carries the same marks and the same palette for the same reason a letter
 * does: it goes out of the office with the works' name on it.
 */
import { BASE_CSS, COMPANY, mark } from '../quotations/quotation-letterhead.js';
import { esc, longDate } from '../quotations/templates/shared.js';

/**
 * **The job card, as the office prints it.**
 *
 * This is the paper the operator is handed and the three signatures are taken
 * on. Everything about it is decided by that: it is ruled rather than styled,
 * it is dense enough to be one sheet for an ordinary job, and every figure
 * carries its unit, because it is read beside a running machine by somebody
 * who will not be able to ask.
 *
 * **A blank is a box, not a dash.** On screen an empty figure reads "—"; on
 * paper it has to be somewhere to write. So a field the floor fills in prints
 * as a ruled line when the office has not typed it, and the operator completes
 * the card in pen — which is what the works does with its own sheet today.
 *
 * The screen card and this one are worked out by the same `computeJobCard`, so
 * they cannot disagree about a figure. What differs is only what paper needs:
 * the signatures, the ruled blanks, and the instruction that it is a plan.
 */

export interface JobCardDocumentInput {
  sheet: JobSheet;
  spec: JobSpecification;
  /** Worked out by `computeJobCard` — the same call the screen makes. */
  card: JobCardWorking;
  /** The works' figures this card was worked out on, for the notes. */
  rates: { plyAllowancePercent: number };
}

/** A hairline of the four brand colours, as the letterhead's own rule. */
const BAND =
  '<div class="band"><i class="m"></i><i class="g"></i><i class="o"></i><i class="i"></i></div>';

/** One labelled figure. `fill` marks a box the floor completes in pen. */
function cell(label: string, value: string, options?: { fill?: boolean; wide?: boolean }): string {
  const written = value.trim();
  const classes = ['cell', options?.wide ? 'wide' : '', options?.fill ? 'fill' : '']
    .filter(Boolean)
    .join(' ');

  return `<div class="${classes}">
    <dt>${esc(label)}</dt>
    <dd>${written ? esc(written) : options?.fill ? '<i class="rule"></i>' : '<span class="nil">—</span>'}</dd>
  </div>`;
}

/**
 * A department: its name, an optional note, and the figures under it.
 *
 * Four to a row, and the last row is completed with empty cells. A ruled
 * block that stops halfway along its bottom edge reads as a form that was cut
 * short — and on paper somebody will wonder what was meant to be there.
 */
function section(title: string, note: string, cells: string[]): string {
  const width = cells.reduce((total, cell) => total + (cell.includes('wide') ? 2 : 1), 0);
  const short = (4 - (width % 4)) % 4;
  const padding = '<div class="cell pad"></div>'.repeat(short);

  return `
  <section class="dept">
    <h2>${esc(title)}${note ? `<span class="note">${esc(note)}</span>` : ''}</h2>
    <dl class="grid">${cells.join('')}${padding}</dl>
  </section>`;
}

export function renderJobCardHtml(input: JobCardDocumentInput): string {
  const { sheet, spec, card, rates } = input;

  const mm = (value: number) => (value > 0 ? `${formatNumber(value, 0)} mm` : '');
  const kg = (value: number) => (value > 0 ? `${formatNumber(value, 2)} kg` : '');
  const micron = (value: number) => (value > 0 ? `${formatNumber(value, 0)} micron` : '');
  const count = (value: number) => (value > 0 ? formatNumber(value, 0) : '');
  const date = (value: string | null) => (value ? longDate(value) : '');

  /* The floor's figure where it has corrected the arithmetic, exactly as the
     screen card does — a metreage somebody measured beats one worked out. */
  const metres = sheet.printMetersOverride ?? card.printMeters;
  const printMinutes = sheet.printSpeedMPerMin > 0 ? metres / sheet.printSpeedMPerMin : null;
  const finalMinutes =
    card.cylinderChangeoverMinutes +
    card.rubberChangeMinutes +
    sheet.otherSettingMinutes +
    (printMinutes ?? 0);

  /* Roll Form against Pouch Form, which is the works' own column. A reel is
     printed, laminated and slit, and then it is finished — and the works'
     sheet guards every pouch cell on the pouch type being N/A. */
  const makesPouches = !/roll/i.test(spec.jobType);

  const header = section('The job', '', [
    cell('Customer', spec.customerName ?? sheet.customerName),
    cell('Design', spec.jobName, { wide: true }),
    cell('Material type', spec.jobType),
    cell('Work order no.', sheet.workOrderNo, { fill: true }),
    cell('PO date', date(sheet.poDate), { fill: true }),
    cell('Date of despatch', date(sheet.dispatchDate), { fill: true }),
    cell('Transport', sheet.transport, { fill: true }),
    cell('Job received by', sheet.jobReceivedBy, { fill: true }),
    cell('Quantity', kg(sheet.quantityKg), { fill: true }),
    cell('Total micron', micron(card.totalMicron)),
    cell('No. of cylinders', count(spec.totalCylinders)),
    cell('Cylinder size', mm(spec.cylinderCellMm)),
    cell('Circumference', mm(spec.cylinderDiaMm)),
    cell('Lami. rubber size', mm(spec.rubberSizeMm)),
    cell('Pouch plate size', spec.pouchPlateSize),
  ]);

  const printing = section(
    'Printing department',
    `Film to draw includes the works' ${formatNumber(rates.plyAllowancePercent, 0)}% allowance`,
    [
      cell('Material size', mm(card.materialSizeMm)),
      cell('Job colours', spec.jobColours, { wide: true }),
      cell('Printing style', spec.printingType),
      cell('Printing type', sheet.printingNote, { fill: true }),
      cell('PET micron', micron(spec.petMicron)),
      cell('PET to draw', kg(card.pet.kg)),
      cell('Metres', metres > 0 ? `${formatNumber(metres, 0)} m` : '', { fill: true }),
      cell(
        'Printing speed',
        sheet.printSpeedMPerMin > 0 ? `${formatNumber(sheet.printSpeedMPerMin, 0)} m/min` : '',
        { fill: true },
      ),
      cell('Printing time', printMinutes === null ? '' : asHoursMinutes(printMinutes), {
        fill: true,
      }),
    ],
  );

  const lamination = section('Lamination department', '', [
    cell('Layers', count(spec.layer)),
    cell('Viscosity', spec.viscosity),
    cell('Poly film', spec.polyType, { wide: true }),
    cell('Met Pet size', mm(card.metPet.sizeMm)),
    cell('Met Pet micron', micron(spec.metPetMicron)),
    cell('Met Pet to draw', kg(card.metPet.kg)),
    cell(
      'Met Pet coating',
      sheet.metPetCoatingGsm > 0 ? `${formatNumber(sheet.metPetCoatingGsm, 2)} gsm` : '',
      { fill: true },
    ),
    cell('Poly size', mm(card.poly.sizeMm)),
    cell('Poly micron', micron(spec.polyMicron)),
    cell('Poly to draw', kg(card.poly.kg)),
    cell(
      'Poly coating',
      sheet.polyCoatingGsm > 0 ? `${formatNumber(sheet.polyCoatingGsm, 2)} gsm` : '',
      { fill: true },
    ),
  ]);

  const slitting = section('Slitting department', '', [
    cell('Single roll width', mm(spec.singleRollWidthMm)),
    cell('Job direction', spec.jobFinalDirection),
    cell('No. of ups', count(spec.ups)),
    cell('Single roll weight', sheet.singleRollWeight || spec.singleRollWeight, { fill: true }),
  ]);

  const pouching = makesPouches
    ? section('Pouching department', '', [
        cell('Pouch type', spec.pouchSubType, { wide: true }),
        cell('Open width', mm(spec.pouchOpenWidthMm)),
        cell('Height', mm(spec.pouchHeightMm)),
        cell('Total pouches', count(card.totalPouches)),
        cell('D punch top', spec.dPunchTopSize),
        cell('Side gusset', [spec.gusset, spec.gussetSize].filter(Boolean).join(' · ')),
        cell('V notch', spec.vNotch),
        cell(
          'Pouching speed',
          sheet.pouchingSpeedPerMin > 0 ? `${formatNumber(sheet.pouchingSpeedPerMin, 0)} /min` : '',
          { fill: true },
        ),
        cell(
          'Pouching time',
          card.pouchingMinutes === null ? '' : asHoursMinutes(card.pouchingMinutes),
          {
            fill: true,
          },
        ),
        cell('Pouch sorting', sheet.pouchSorting, { fill: true }),
      ])
    : `
  <section class="dept">
    <h2>Pouching department</h2>
    <p class="reel">This job runs as a reel &mdash; nothing is pouched.</p>
  </section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Job card ${sheet.number}</title>
<style>
${BASE_CSS}

  /* A card is filled in on a machine, so it is given back the margin the
     letterhead spends on a customer's document. */
  @page { size: A4 portrait; margin: 9mm 9mm 8mm; }
  @media screen {
    .sheet { padding: 9mm 9mm 8mm; }
  }

  /* --- the head of the card --------------------------------------------- */
  .top { display: flex; align-items: flex-start; gap: 6mm; }
  .top .who { flex: 1; font-size: var(--t-fine); color: var(--muted); line-height: 1.45; }
  .top .who b { display: block; font-size: 10.4pt; color: var(--ink); }
  .top .title { flex: none; text-align: right; }
  .top .title .what { font-size: var(--t-lead); font-weight: 700; color: var(--indigo);
                      letter-spacing: .06em; }
  .top .title .no { font-size: var(--t-value); color: var(--body); margin-top: .6mm; }

  .band { display: flex; height: 1.1mm; margin: 2.4mm 0 3.2mm; }
  .band i { display: block; }
  .band .m { flex: 26; background: var(--magenta); }
  .band .g { flex: 13; background: var(--green); }
  .band .o { flex: 16; background: var(--orange); }
  .band .i { flex: 45; background: var(--indigo); }

  /* --- a department ----------------------------------------------------- */
  .dept { margin-bottom: 2.2mm; }
  .dept h2 {
    display: flex; align-items: baseline; gap: 3mm; margin: 0 0 1.1mm;
    font-size: var(--t-label); letter-spacing: .12em; text-transform: uppercase;
    color: var(--indigo); font-weight: 700;
    border-bottom: 0.8pt solid var(--hair); padding-bottom: .7mm;
  }
  .dept h2 .note {
    margin-left: auto; font-size: var(--t-fine); letter-spacing: 0; text-transform: none;
    font-weight: 400; font-style: italic; color: var(--muted);
  }

  /*
   * Four to a row, and a cell may take two.
   *
   * Ruled on all sides like the sheet it replaces: an operator reading across
   * a machine needs to see which figure belongs to which name without
   * tracking a line of white space.
   */
  .grid { display: flex; flex-wrap: wrap; margin: 0; border-left: 0.5pt solid var(--hair);
          border-top: 0.5pt solid var(--hair); }
  .cell { flex: 0 0 25%; padding: 1.2mm 2mm 1.3mm; min-width: 0;
          border-right: 0.5pt solid var(--hair); border-bottom: 0.5pt solid var(--hair); }
  .cell.wide { flex: 0 0 50%; }
  .cell dt { font-size: var(--t-label); letter-spacing: .09em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; }
  .cell dd { margin: .5mm 0 0; font-size: var(--t-value); color: var(--ink); font-weight: 700;
             font-variant-numeric: tabular-nums; line-height: 1.2; }
  .cell .nil { color: var(--hair); font-weight: 400; }
  /* Completes the last row of a block. Nothing belongs in it. */
  .cell.pad { background: repeating-linear-gradient(135deg,
      transparent 0 2.4mm, var(--wash) 2.4mm 4.8mm); }

  /* A box the floor fills in: the works' own yellow, and a line to write on. */
  .cell.fill { background: #FFFDF0; }
  .cell.fill .rule { display: block; height: 3.1mm; border-bottom: 0.7pt solid var(--muted); }

  .reel { margin: 0; padding: 2mm; font-size: var(--t-value); color: var(--body);
          font-style: italic; border: 0.5pt dashed var(--hair); }

  /* --- the figure the card builds to ------------------------------------ */
  .time { display: flex; align-items: stretch; border: 0.5pt solid var(--hair); }
  .time .part { flex: 1; padding: 1.5mm 2mm; border-right: 0.5pt solid var(--hair); }
  .time .part:last-child { border-right: 0; }
  .time dt { font-size: var(--t-label); letter-spacing: .09em; text-transform: uppercase;
             color: var(--muted); font-weight: 700; }
  .time dd { margin: .7mm 0 0; font-size: var(--t-value); color: var(--ink); font-weight: 700;
             font-variant-numeric: tabular-nums; }
  .time .part.fill { background: #FFFDF0; }
  .time .part.fill .rule { display: block; height: 3.1mm; border-bottom: 0.7pt solid var(--muted); }
  .time .sum { background: var(--wash); }
  .time .sum dd { color: var(--orange); font-size: var(--t-name); }

  /* --- instructions, and the three signatures --------------------------- */
  .instructions { border: 0.5pt solid var(--hair); padding: 1.6mm 2mm; }
  .instructions .said { font-size: var(--t-value); color: var(--ink); }
  .instructions .lines i { display: block; height: 4.2mm; border-bottom: 0.5pt dotted var(--hair); }

  .signs { display: flex; gap: 4mm; margin-top: 2.6mm; }
  .signs .by { flex: 1; }
  .signs .who { font-size: var(--t-value); color: var(--ink); font-weight: 700;
                min-height: 4.2mm; }
  .signs .line { border-bottom: 0.7pt solid var(--muted); height: 6.5mm; }
  .signs .what { display: flex; justify-content: space-between; margin-top: 1mm;
                 font-size: var(--t-label); letter-spacing: .09em; text-transform: uppercase;
                 color: var(--muted); font-weight: 700; }
</style></head>
<body><div class="sheet">

  <div class="top">
    ${mark('logo', 11)}
    <div class="who">
      <b>${esc(COMPANY.name)}</b>
      ${esc(COMPANY.subtitle)} &nbsp;·&nbsp; ${esc(COMPANY.address)}
    </div>
    <div class="title">
      <div class="what">JOB CARD</div>
      <div class="no num">No. ${sheet.number} &nbsp;·&nbsp; ${esc(longDate(sheet.date))}</div>
    </div>
  </div>
  ${BAND}

  ${header}
  ${printing}
  ${lamination}
  ${slitting}
  ${pouching}

  <section class="dept">
    <h2>Time on the machine<span class="note">A plan, not a record &mdash; write what it took</span></h2>
    <dl class="time">
      <div class="part">
        <dt>Cylinder changeover</dt>
        <dd>${asHoursMinutes(card.cylinderChangeoverMinutes)}</dd>
      </div>
      <div class="part">
        <dt>Rubber change</dt>
        <dd>${asHoursMinutes(card.rubberChangeMinutes)}</dd>
      </div>
      <div class="part${sheet.otherSettingMinutes > 0 ? '' : ' fill'}">
        <dt>Other setting</dt>
        <dd>${
          sheet.otherSettingMinutes > 0
            ? asHoursMinutes(sheet.otherSettingMinutes)
            : '<i class="rule"></i>'
        }</dd>
      </div>
      <div class="part sum">
        <dt>Final time</dt>
        <dd>${asHoursMinutes(finalMinutes)}</dd>
      </div>
    </dl>
  </section>

  <section class="dept">
    <h2>Special instructions</h2>
    <div class="instructions">
      ${
        sheet.specialInstructions.trim()
          ? `<div class="said">${esc(sheet.specialInstructions)}</div>`
          : '<div class="lines"><i></i><i></i></div>'
      }
    </div>
  </section>

  <!--
    Three signatures, taken on paper.

    The names are printed where the office knows them and the line is there
    either way: the card is signed by whoever actually did the work, and on a
    shift that is not always the person the office typed.
  -->
  <div class="signs">
    <div class="by">
      <div class="who">${esc(sheet.preparedBy)}</div>
      <div class="line"></div>
      <div class="what"><span>Prepared by</span><span>Date</span></div>
    </div>
    <div class="by">
      <div class="who">${esc(sheet.operatorName)}</div>
      <div class="line"></div>
      <div class="what"><span>Operated by</span><span>Date</span></div>
    </div>
    <div class="by">
      <div class="who">${esc(sheet.approvedBy)}</div>
      <div class="line"></div>
      <div class="what"><span>Approved by</span><span>Date</span></div>
    </div>
  </div>

  <div class="running-foot">
    <span>${esc(COMPANY.name)} &nbsp;·&nbsp; Job card ${sheet.number}</span>
    <span>${esc(spec.jobName)}</span>
  </div>
</div></body></html>`;
}
