/**
 * **Lists quotations whose colours the reopening bug may have overwritten.**
 *
 * READ ONLY. It opens the database, runs one `findMany`, prints what it finds
 * and disconnects. There is no create, update, upsert or delete anywhere in
 * this file, and nothing it prints has been changed by printing it. Run it as
 * often as you like.
 *
 * ---
 *
 * **What went wrong.** Opening a saved quotation to edit did not copy the
 * stored colours into the form, so the line opened with none chosen. The one
 * effect that still ran then added a white base coat, because the structure
 * asks for one. Saving anything at all — a date, a note, a quantity — wrote
 * that single white colour back over the inks the document was sold with.
 *
 * **What that looks like in the database.** An item carrying exactly one
 * colour, a SPECIAL called White, while its cylinder count says the job was
 * priced for more than one station. The cylinder count survives because it is
 * a plain number on the item and the form copied it faithfully — which is
 * what makes it the witness.
 *
 * Three things could each be true on their own, so they are reported apart
 * rather than lumped into one list:
 *
 *   CERTAIN    one White special, cylinders > 1, and the document has been
 *              edited since it was created. All three, which is the bug's
 *              exact fingerprint.
 *   CLEARED    no colours at all, on a document written after the colour strip
 *              shipped and edited since. The bug's other shape: where the
 *              structure asks for no white base there was nothing to add
 *              back, so the save wrote an empty set.
 *   NOT THE BUG
 *              either shape on a document never edited after creation. The
 *              bug cannot have touched it — listed so you can see that.
 *
 * **What is deliberately NOT reported: colours and cylinders disagreeing.**
 * The first version of this script flagged that and it was wrong on every
 * line in the database — five out of five. A line may carry four process
 * colours and six cylinders perfectly legitimately, because the office types
 * a cylinder count for stations it has not named an ink for yet; the form
 * allows it on purpose. A check that cries wolf on healthy data is worse than
 * no check, because the one real hit is then read past.
 *
 * A quotation written before colours existed at all carries none, and that is
 * not damage — those are counted and set aside rather than listed.
 */
import { prisma } from '../src/lib/prisma.js';
import {
  classifyColourDamage,
  COLOURS_SHIPPED,
  wasEdited,
} from '../src/modules/quotations/damaged-colours.js';

const quotations = await prisma.quotation.findMany({
  select: {
    id: true,
    number: true,
    version: true,
    isLatest: true,
    status: true,
    date: true,
    customerName: true,
    createdAt: true,
    updatedAt: true,
    items: {
      select: {
        id: true,
        jobName: true,
        cylinderCount: true,
        colours: {
          select: { name: true, kind: true, position: true },
          orderBy: { position: 'asc' },
        },
      },
    },
  },
  orderBy: [{ number: 'asc' }, { version: 'asc' }],
});

interface Hit {
  label: string;
  job: string;
  cylinders: number;
  colours: string;
  edited: boolean;
}

const certain: Hit[] = [];
const cleared: Hit[] = [];
const notTheBug: Hit[] = [];
let preColours = 0;
let itemsSeen = 0;
let healthy = 0;

for (const quotation of quotations) {
  const edited = wasEdited(quotation);
  const label =
    `QUO-${quotation.number}` +
    (quotation.version > 1 ? ` v${quotation.version}` : '') +
    `  ${quotation.date.toISOString().slice(0, 10)}  ${quotation.status.padEnd(8)}` +
    `  ${quotation.customerName.slice(0, 28)}`;

  for (const item of quotation.items) {
    itemsSeen += 1;

    const verdict = classifyColourDamage({
      colours: item.colours,
      cylinderCount: item.cylinderCount,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    });

    if (verdict === 'PRE_COLOURS') {
      preColours += 1;
      continue;
    }
    if (verdict === 'HEALTHY') {
      healthy += 1;
      continue;
    }

    const hit: Hit = {
      label,
      job: item.jobName,
      cylinders: item.cylinderCount,
      colours:
        item.colours.length === 0
          ? '(none stored)'
          : item.colours.map((colour) => colour.name).join(', '),
      edited,
    };

    if (verdict === 'CERTAIN') certain.push(hit);
    else if (verdict === 'CLEARED') cleared.push(hit);
    else notTheBug.push(hit);
  }
}

function report(title: string, note: string, hits: Hit[]) {
  console.log(`\n${title}  —  ${hits.length}`);
  console.log(note);
  if (hits.length === 0) {
    console.log('  nothing\n');
    return;
  }
  console.log();
  for (const hit of hits) {
    console.log(`  ${hit.label}`);
    console.log(
      `      ${hit.job.slice(0, 44).padEnd(44)}` +
        `  cylinders ${String(hit.cylinders).padStart(2)}` +
        `   colours: ${hit.colours}`,
    );
  }
  console.log();
}

console.log(`
Damaged colours — a listing, nothing changed
============================================
Read ${quotations.length} quotations, ${itemsSeen} lines.`);

report(
  'CERTAIN',
  '  One White special on a line priced for more than one cylinder, on a\n' +
    '  document edited after it was created. The bug’s exact fingerprint.',
  certain,
);

report(
  'CLEARED',
  '  No colours stored at all, on a document written after the colour strip\n' +
    '  shipped and edited since. The bug\u2019s other shape, where the structure\n' +
    '  asked for no white base and nothing was added back.',
  cleared,
);

report(
  'NOT THE BUG',
  '  One of those two shapes, but never edited after creation — so the bug\n' +
    '  cannot have touched it. Worth an eye, but the colours are as keyed.',
  notTheBug,
);

if (preColours > 0) {
  console.log(
    `Set aside: ${preColours} line(s) written before the colour strip shipped on\n` +
      `${COLOURS_SHIPPED.toISOString().slice(0, 10)}. Those legitimately store no colours.\n`,
  );
}

console.log(`${healthy} line(s) carry the inks they were sold on.\n`);

const damaged = certain.length + cleared.length;
console.log(
  damaged === 0
    ? 'Nothing to repair. Re-key nothing.\n'
    : `Re-key the ${damaged} line(s) under CERTAIN and CLEARED by hand, from the\n` +
        'PDF that was sent. Nothing here has been changed by this script.\n',
);

await prisma.$disconnect();
