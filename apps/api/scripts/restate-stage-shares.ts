/**
 * Restates sheets costed at stage shares that came to more than one day.
 *
 *   npm run restate:stage-shares -w @yuva/api            say what would change
 *   npm run restate:stage-shares -w @yuva/api -- --write do it
 *
 * The works' spreadsheet splits a day's electricity 60 / 20 / 20 / 10 / 10,
 * which comes to 120 — so every job costed that way carries a sixth more
 * electricity than the day actually cost. The works has confirmed the total
 * should be 100. This corrects the sheets already entered.
 *
 * **Each sheet's own shares are rescaled, not replaced.** A sheet keeps its
 * weighting between the machines — that is the works' knowledge, and it was
 * never the thing in question — and only the total moves. A sheet already
 * summing to 100 is left exactly alone, so running this twice changes nothing
 * the second time.
 *
 * **Sheets whose electricity was typed are not touched.** Six of the fourteen
 * come from older tabs that charge a flat `days × 5000` with no stage split at
 * all. There is no 120 to correct there; their figure is what the works
 * settled, and quietly replacing it with a computed one would be a different
 * change from the one that was asked for. They are listed at the end so the gap
 * is visible rather than assumed.
 *
 * Every restated sheet gets a line on its notes saying what moved and when.
 * These are figures the office has already signed off, and a correction with no
 * trail is indistinguishable from a bug.
 */
import { JOB_SHEET_STAGE_SHARE_TOTAL } from '@yuva/shared';
import { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { recost } from '../src/modules/job-sheets/job-sheet.service.js';

const write = process.argv.includes('--write');
const today = new Date().toISOString().slice(0, 10);

const sheets = await prisma.jobSheet.findMany({
  orderBy: { number: 'asc' },
  select: {
    id: true,
    number: true,
    jobName: true,
    notes: true,
    stockPostedAt: true,
    electricityOverride: true,
    electricityCost: true,
    costPerKg: true,
    stages: { select: { id: true, sharePercent: true } },
  },
});

const rescalable = sheets.filter((sheet) => {
  if (sheet.stockPostedAt) return false;
  if (sheet.electricityOverride !== null) return false;
  const total = sheet.stages.reduce((sum, stage) => sum + Number(stage.sharePercent), 0);
  return total > 0 && Math.abs(total - JOB_SHEET_STAGE_SHARE_TOTAL) > 0.01;
});

const typed = sheets.filter((sheet) => !sheet.stockPostedAt && sheet.electricityOverride !== null);
const posted = sheets.filter((sheet) => sheet.stockPostedAt);

console.log(
  `\n${rescalable.length} of ${sheets.length} sheets to restate${write ? '' : ' — dry run, nothing is written'}\n`,
);
console.log(
  `${'Sheet'.padEnd(30)} ${'shares'.padStart(7)} ${'electricity'.padStart(22)} ${'cost a kilogram'.padStart(22)}`,
);
console.log('-'.repeat(86));

for (const sheet of rescalable) {
  const total = sheet.stages.reduce((sum, stage) => sum + Number(stage.sharePercent), 0);
  const factor = JOB_SHEET_STAGE_SHARE_TOTAL / total;

  const wasElectricity = Number(sheet.electricityCost);
  const wasPerKg = Number(sheet.costPerKg);

  if (!write) {
    /* Predicted rather than computed: the bill is linear in the share. */
    const willBe = Math.round(wasElectricity * factor * 100) / 100;
    console.log(
      `${`#${sheet.number} ${sheet.jobName}`.slice(0, 29).padEnd(30)} ${`${total}→100`.padStart(7)} ` +
        `${`${wasElectricity} → ${willBe}`.padStart(22)} ${`${wasPerKg} → ?`.padStart(22)}`,
    );
    continue;
  }

  await prisma.$transaction(
    sheet.stages.map((stage) =>
      prisma.jobSheetStageUsage.update({
        where: { id: stage.id },
        data: {
          sharePercent: new Prisma.Decimal((Number(stage.sharePercent) * factor).toFixed(3)),
        },
      }),
    ),
  );

  const after = await recost(sheet.id);

  await prisma.jobSheet.update({
    where: { id: sheet.id },
    data: {
      notes: [
        sheet.notes,
        `Electricity restated ${today}: stage shares rescaled from ${total} to 100, ` +
          `the workbook's split having charged a sixth too much. ` +
          `Electricity Rs ${wasElectricity} to Rs ${after.electricityCost}; ` +
          `cost a kilogram Rs ${wasPerKg} to Rs ${after.costPerKg}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  });

  console.log(
    `${`#${sheet.number} ${sheet.jobName}`.slice(0, 29).padEnd(30)} ${`${total}→100`.padStart(7)} ` +
      `${`${wasElectricity} → ${after.electricityCost}`.padStart(22)} ` +
      `${`${wasPerKg} → ${after.costPerKg}`.padStart(22)}`,
  );
}

console.log('-'.repeat(86));

if (typed.length > 0) {
  console.log(
    `\n${typed.length} sheets left alone — their electricity is a typed figure, not a share:`,
  );
  for (const sheet of typed) {
    console.log(
      `  #${sheet.number} ${String(sheet.jobName).slice(0, 24).padEnd(26)} Rs ${sheet.electricityOverride} as the works settled it`,
    );
  }
}
if (posted.length > 0) {
  console.log(`\n${posted.length} sheets left alone — already taken off stock, so a record.`);
}
if (rescalable.length === 0) {
  console.log('\nNothing to restate. Every unposted sheet already divides one whole day.');
}

await prisma.$disconnect();
