/** Dev helper: writes a quotation's printable markup to a file for inspection. */
import { writeFileSync } from 'node:fs';
import { renderQuotationHtml } from '../src/modules/quotations/quotation-document.js';
import { getQuotationById, listQuotations } from '../src/modules/quotations/quotation.service.js';

async function main() {
  const list = await listQuotations({ page: 1, pageSize: 1 } as never);
  const first = list.items[0];
  if (!first) throw new Error('No quotations to dump');
  const full = await getQuotationById(first.id);
  const out = process.argv[2] ?? '/tmp/doc.html';
  writeFileSync(out, renderQuotationHtml(full));
  console.log(`wrote quotation #${full.number} to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
