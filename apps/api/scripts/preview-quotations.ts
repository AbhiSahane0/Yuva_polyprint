/**
 * Renders every quotation template from real data, for looking at.
 *
 * A PDF design cannot be reviewed from the code, and rebuilding the app to see
 * a letterhead move 2mm is not a loop anybody iterates in. This writes each
 * template to `apps/web/public/_dev/`, where the dev server already serves
 * static files, so the whole set is a browser refresh away.
 *
 *     npm run preview:quotations -w @yuva/api            # 143, 150, 145
 *     npm run preview:quotations -w @yuva/api -- 152     # whichever you like
 *
 * Then open http://localhost:5173/_dev/index.html — note the filename: a bare
 * directory is swallowed by the app's own router.
 *
 * The output is git-ignored. It is a megabyte a file, because the letterhead
 * artwork is inlined as base64, and it is regenerated in a second.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';
import { getQuotationById } from '../src/modules/quotations/quotation.service.js';
import { renderQuotationHtml } from '../src/modules/quotations/quotation-document.js';
import { renderFolio } from '../src/modules/quotations/templates/folio.js';
import { renderDossier } from '../src/modules/quotations/templates/dossier.js';
import { renderStatement } from '../src/modules/quotations/templates/statement.js';

const OUT = fileURLToPath(new URL('../../web/public/_dev/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const TEMPLATES = [
  ['folio', 'Folio', 'A card a job, with the facts in a grid.', renderFolio],
  [
    'dossier',
    'Dossier',
    'Specification down the left, money in a panel on the right.',
    renderDossier,
  ],
  ['statement', 'Statement', 'The total first, the jobs underneath as evidence.', renderStatement],
  ['current', 'Current', 'What the app sends today, for comparison.', renderQuotationHtml],
] as const;

const wanted = (process.argv.slice(2).length ? process.argv.slice(2) : ['143', '150', '145']).map(
  Number,
);
const rows: string[] = [];

for (const number of wanted) {
  const found = await prisma.quotation.findFirst({ where: { number }, select: { id: true } });
  if (!found) {
    console.log(`  (no quotation ${number})`);
    continue;
  }
  const q = await getQuotationById(found.id);
  const links = TEMPLATES.map(([slug, name, , render]) => {
    const file = `${slug}-${number}.html`;
    writeFileSync(`${OUT}/${file}`, render(q));
    return `<a href="${file}">${name}</a>`;
  }).join('');
  rows.push(
    `<tr><th>#${number}<span>${q.customerName}</span><em>${q.items.length} job${q.items.length === 1 ? '' : 's'}</em></th><td>${links}</td></tr>`,
  );
  console.log(`  #${number}  ${q.customerName}  (${q.items.length} job)`);
}

writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Quotation templates</title>
<style>
  body { font: 15px/1.6 -apple-system, "Segoe UI", sans-serif; background:#ECEAF2; color:#1D1B2A;
         margin:0; padding:48px 32px; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 26px; margin:0 0 4px; font-weight: 700; letter-spacing:-.01em; }
  p.sub { margin:0 0 28px; color:#78748C; }
  .keys { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:28px; }
  .key { background:#fff; border-radius:10px; padding:14px 16px; }
  .key b { display:block; font-size:15px; }
  .key span { color:#78748C; font-size:13px; }
  table { width:100%; border-collapse:separate; border-spacing:0 10px; }
  th { text-align:left; font-weight:700; padding:14px 18px; background:#fff;
       border-radius:10px 0 0 10px; width:46%; }
  th span { display:block; font-weight:400; color:#3E3B4F; }
  th em { display:block; font-style:normal; color:#78748C; font-size:13px; }
  td { background:#fff; border-radius:0 10px 10px 0; padding:14px 18px; }
  a { display:inline-block; margin-right:8px; padding:7px 14px; border-radius:99px;
      background:#503888; color:#fff; text-decoration:none; font-size:13.5px; font-weight:600; }
  a:last-child { background:#DEDCE6; color:#3E3B4F; }
  footer { margin-top:28px; color:#78748C; font-size:13px; }
</style>
<main>
  <h1>Quotation templates</h1>
  <p class="sub">Three card designs, rendered from your own quotations. Press &#8984;P on any of them to see it as the A4 PDF.</p>
  <div class="keys">
    ${TEMPLATES.slice(0, 3)
      .map(([, name, blurb]) => `<div class="key"><b>${name}</b><span>${blurb}</span></div>`)
      .join('')}
  </div>
  <table>${rows.join('')}</table>
  <footer>All three print A4 portrait. &ldquo;Current&rdquo; is today&rsquo;s document, for comparison.</footer>
</main>`,
);

console.log(`\nOpen  http://localhost:5173/_dev/index.html`);
await prisma.$disconnect();
