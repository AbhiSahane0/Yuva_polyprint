import { computeJobCard } from '@yuva/shared';
import { renderHtmlToPdf } from '../../lib/pdf.js';
import { ApiError } from '../../utils/api-error.js';
import { getJobSpecification } from '../jobs/job.service.js';
import { getSettings } from '../settings/settings.service.js';
import { getJobSheet } from './job-sheet.service.js';
import { renderJobCardHtml } from './job-card-document.js';

/**
 * **The job card as a sheet of paper.**
 *
 * Gathers the three things the card is made of and prints them: what the
 * office typed (the sheet), what the design master says (the specification),
 * and the works' figures (the settings). The arithmetic between them is
 * `computeJobCard` — the same call the screen makes, so the paper and the
 * screen cannot disagree.
 *
 * The settings are read **as at the sheet's own date**, not today's. A card
 * reprinted next year has to come out of the printer saying what it said when
 * the job ran: the changeover minutes and the film allowance move, and a
 * reprint that quietly re-times a finished job is worse than no reprint.
 */
export async function renderJobCardPdf(id: string): Promise<{ pdf: Uint8Array; filename: string }> {
  const sheet = await getJobSheet(id);

  if (!sheet.jobId) {
    throw ApiError.badRequest(
      'Pick the design this run is for before printing its card — the card is worked out from it',
    );
  }

  const [spec, settings] = await Promise.all([
    getJobSpecification(sheet.jobId),
    getSettings(sheet.date),
  ]);

  const rates = {
    cylinderChangeoverMinutes: settings.cylinderChangeoverMinutes,
    rubberChangeMinutes: settings.rubberChangeMinutes,
    /* The setting is named for the card it belongs to; the calculator names it
       for what it does to a ply. Mapped here rather than renaming either. */
    plyAllowancePercent: settings.jobCardAllowancePercent,
    dispatchLeadDays: settings.dispatchLeadDays,
  };

  const card = computeJobCard(
    {
      petMicron: spec.petMicron,
      metPetMicron: spec.metPetMicron,
      polyMicron: spec.polyMicron,
      petGsm: spec.petGsm,
      metPetGsm: spec.metPetGsm,
      polyGsm: spec.polyGsm,
      compositeGsm: spec.compositeGsm,
      rubberSizeMm: spec.rubberSizeMm,
      pouchesPerKg: spec.pouchesPerKg,
      totalCylinders: spec.totalCylinders,
    },
    rates,
    {
      quantityKg: sheet.quantityKg,
      printSpeedMPerMin: sheet.printSpeedMPerMin,
      pouchingSpeedPerMin: sheet.pouchingSpeedPerMin,
      otherSettingMinutes: sheet.otherSettingMinutes,
    },
  );

  const html = renderJobCardHtml({ sheet, spec, card, rates });

  /* Named for the floor: the card number first, because that is what somebody
     looking for a reprint has in their hand. */
  const safeName = (spec.jobName || sheet.jobName)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return {
    pdf: await renderHtmlToPdf(html),
    filename: `Job_Card_${sheet.number}_${safeName || 'Job'}.pdf`,
  };
}
