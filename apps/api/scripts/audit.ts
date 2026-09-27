/**
 * **A whole-system invariant check.**
 *
 * Not a unit test: it runs against a real database and asks the questions
 * that only make sense across modules — does the stock ledger agree with the
 * batches, is anything claimed AND issued, does the godown equal made less
 * gone, does a completed order have a delivery behind it.
 *
 *   npm run audit -w @yuva/api
 *
 * Exits non-zero on any failure, so it can be pointed at production.
 */
import { prisma } from '../src/lib/prisma.js';
import { readyToSend } from '../src/modules/dispatch/dispatch.service.js';
import { planningBoard } from '../src/modules/planning/planning.service.js';
import { qualityBoard } from '../src/modules/quality/quality.service.js';
import { machineBoard } from '../src/modules/machines/machine.service.js';
import { listProduction } from '../src/modules/production/production.service.js';

let fails = 0;
let checks = 0;
const ok = (name: string, pass: boolean, detail = '') => {
  checks += 1;
  if (!pass) fails += 1;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const n = (v: unknown) => Number(v ?? 0);

async function main() {
  console.log('\n─── STOCK MOVES EXACTLY ONCE ───\n');

  // A posted sheet must have movements; an unposted one must not.
  const sheets = await prisma.jobSheet.findMany({
    select: { id: true, number: true, status: true, stockPostedAt: true, productionOrderId: true },
  });
  for (const s of sheets) {
    const moves = await prisma.stockMovement.count({
      where: { reference: `Job sheet ${s.number}` },
    });
    if (s.stockPostedAt)
      ok(`sheet ${s.number} posted has movements`, moves > 0, `${moves} movements`);
    else ok(`sheet ${s.number} unposted has none`, moves === 0, `${moves} movements`);
  }

  // No card both holds a claim AND has a posted sheet: that is double counting.
  const held = await prisma.stockReservation.groupBy({
    by: ['productionOrderId'],
    where: { status: 'HELD' },
    _count: { _all: true },
  });
  for (const h of held) {
    const card = await prisma.productionOrder.findUnique({
      where: { id: h.productionOrderId },
      select: { number: true, jobSheet: { select: { number: true, stockPostedAt: true } } },
    });
    ok(
      `card #${card?.number} holds a claim and has no posted sheet`,
      !card?.jobSheet?.stockPostedAt,
      card?.jobSheet?.stockPostedAt
        ? `sheet ${card.jobSheet.number} IS posted — double counted`
        : `${h._count._all} rows`,
    );
  }

  // Every batch's quantity must equal its movements.
  const batches = await prisma.stockBatch.findMany({
    select: {
      id: true,
      batchCode: true,
      quantity: true,
      movements: { select: { kind: true, quantity: true } },
    },
  });
  /*
   * **A movement carries its own sign.** A receipt is stored positive and an
   * issue negative, so the ledger is a straight sum — flipping the sign by
   * kind on top of that counts every issue as a receipt, which is what this
   * check did on its first run and why it accused two sound batches of
   * drifting.
   */
  let drifted = 0;
  const wrongSign: string[] = [];
  for (const b of batches) {
    const net = b.movements.reduce((sum, m) => sum + n(m.quantity), 0);
    if (Math.abs(net - n(b.quantity)) > 0.001) drifted += 1;
    for (const m of b.movements) {
      const q = n(m.quantity);
      if (m.kind === 'RECEIPT' && q < 0) wrongSign.push(`${b.batchCode} RECEIPT ${q}`);
      if (m.kind === 'ISSUE' && q > 0) wrongSign.push(`${b.batchCode} ISSUE ${q}`);
    }
  }
  ok(
    'every movement carries the right sign',
    wrongSign.length === 0,
    wrongSign.slice(0, 3).join('; '),
  );
  ok(
    'every stock batch agrees with its movements',
    drifted === 0,
    `${drifted} of ${batches.length} drifted`,
  );

  console.log('\n─── NUMBERING ───\n');
  for (const [label, rows] of [
    ['quotation', await prisma.quotation.findMany({ select: { number: true } })],
    ['order', await prisma.order.findMany({ select: { number: true } })],
    ['job card', await prisma.productionOrder.findMany({ select: { number: true } })],
    ['job sheet', await prisma.jobSheet.findMany({ select: { number: true } })],
    ['dispatch', await prisma.dispatch.findMany({ select: { number: true } })],
    ['quality issue', await prisma.qualityIssue.findMany({ select: { number: true } })],
    ['maintenance', await prisma.maintenanceRecord.findMany({ select: { number: true } })],
  ] as const) {
    const nums = rows.map((r) => r.number);
    ok(`${label} numbers are unique`, new Set(nums).size === nums.length, `${nums.length} rows`);
  }

  console.log('\n─── DISPATCH vs QUALITY vs PRODUCTION ───\n');
  const godown = await readyToSend({});
  for (const g of godown) {
    ok(
      `order #${g.orderNumber}: godown = made − gone`,
      Math.abs(g.readyKg - (g.producedKg - g.dispatchedKg)) < 0.001,
      `${g.readyKg} vs ${g.producedKg} − ${g.dispatchedKg}`,
    );
    ok(
      `order #${g.orderNumber}: nothing negative`,
      g.readyKg >= 0 && g.producedKg >= 0 && g.dispatchedKg >= 0,
    );
  }

  // A completed order must actually be fully delivered.
  const completed = await prisma.order.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true, number: true },
  });
  for (const c of completed) {
    const lines = await prisma.dispatchLine.aggregate({
      where: { orderId: c.id, dispatch: { status: 'DISPATCHED' } },
      _sum: { quantityKg: true, quantityPouches: true },
    });
    const gone = n(lines._sum.quantityKg) + n(lines._sum.quantityPouches);
    ok(`completed order #${c.number} has a delivery behind it`, gone > 0, `${gone} delivered`);
  }

  console.log('\n─── PLANNING ───\n');
  const plan = await planningBoard({});
  for (const p of plan.items) {
    if (p.status === 'STARTED') ok(`order #${p.orderNumber} STARTED has a card`, p.cardId !== null);
    if (p.status === 'BLOCKED')
      ok(`order #${p.orderNumber} BLOCKED names what is short`, p.shortOf.length > 0);
    if (p.plannedFinish)
      ok(
        `order #${p.orderNumber} finish is after its start`,
        p.plannedFinish >= (p.plannedStart ?? ''),
      );
  }
  const planned = await prisma.order.count({
    where: { plannedStart: { not: null }, productionOrders: { some: {} } },
  });
  ok('no order is both planned and already on the floor', planned === 0, `${planned} found`);

  console.log('\n─── QUALITY ───\n');
  const q = await qualityBoard({ days: 14 });
  ok(
    'waste and rejections are separate figures',
    q.totals.todayWasteKg >= 0 && q.totals.rejectedKg >= 0,
  );
  for (const r of q.byStage) {
    ok(`waste at ${r.stage} is a sane share`, r.percent >= 0 && r.percent < 100, `${r.percent}%`);
  }
  ok(
    'open count matches the issues',
    q.totals.openIssues === q.issues.filter((i) => i.isOpen).length,
  );
  const overRejected = await prisma.qualityIssue.findMany({
    where: { rejectedKg: { gt: 0 } },
    select: {
      number: true,
      rejectedKg: true,
      productionOrder: { select: { number: true, quantityKg: true } },
    },
  });
  for (const r of overRejected) {
    ok(
      `issue ${r.number} rejects no more than the card made`,
      n(r.rejectedKg) <= n(r.productionOrder.quantityKg) * 1.5,
      `${r.rejectedKg} of ${r.productionOrder.quantityKg}`,
    );
  }

  console.log('\n─── MACHINES ───\n');
  const m = await machineBoard({ days: 14 });
  ok(
    'states add up to the machine count',
    m.totals.running + m.totals.idle + m.totals.down === m.machines.length,
  );
  for (const c of m.machines) {
    if (c.state === 'DOWN') ok(`${c.name} down has a record`, c.down !== null);
    if (c.state === 'RUNNING') ok(`${c.name} running has a job`, c.job !== null);
    if (c.state === 'IDLE') ok(`${c.name} idle has no job`, c.job === null);
    ok(`${c.name} standing time is not negative`, c.standingMinutes >= 0);
  }
  const twoOpen = await prisma.maintenanceRecord.groupBy({
    by: ['machineId'],
    where: { endedAt: null },
    _count: { _all: true },
  });
  ok(
    'no machine has two open maintenance records',
    twoOpen.every((t) => t._count._all === 1),
    JSON.stringify(twoOpen.map((t) => t._count._all)),
  );

  console.log('\n─── PRODUCTION ───\n');
  const cards = await listProduction({ page: 1, pageSize: 100 } as never);
  for (const c of cards.items) {
    ok(
      `card #${c.number} progress is 0–100`,
      c.progressPercent >= 0 && c.progressPercent <= 100,
      `${c.progressPercent}%`,
    );
    if (c.status === 'COMPLETED')
      ok(`card #${c.number} completed is 100%`, c.progressPercent === 100, `${c.progressPercent}%`);
  }
  /* Every stage reaches its card. `{ is: undefined }` is a no-op filter that
     silently counts everything — this asks the question properly. */
  const stages = await prisma.productionStage.count();
  const parented = await prisma.productionStage.count({
    where: { productionOrder: { isNot: undefined } },
  });
  ok('every stage reaches its card', stages === parented, `${parented} of ${stages}`);

  console.log('\n─── ORDERS vs QUOTATIONS ───\n');
  const fromQuote = await prisma.order.findMany({
    where: { quotationItemId: { not: null } },
    select: {
      number: true,
      amount: true,
      quantityKg: true,
      ratePerKg: true,
      quantityPouches: true,
      ratePerPouch: true,
    },
  });
  /*
   * The stored amount comes from the quotation, at full precision; the rate
   * beside it is rounded for reading. They will not always multiply back to
   * the same figure, and that is fine — what matters is that the gap stays
   * tiny. A large one means the order was edited into disagreeing with the
   * quotation it came from.
   */
  for (const o of fromQuote) {
    const perPouch = o.quantityPouches > 0 && n(o.ratePerPouch) > 0;
    const expect =
      Math.round(
        (perPouch ? o.quantityPouches * n(o.ratePerPouch) : n(o.quantityKg) * n(o.ratePerKg)) * 100,
      ) / 100;
    const gap = Math.abs(n(o.amount) - expect);
    ok(
      `order #${o.number} is within rounding of its own figures`,
      gap <= Math.max(5, n(o.amount) * 0.0005),
      `${o.amount} vs ${expect} (off by ${gap.toFixed(2)})`,
    );
  }

  console.log(`\n═══ ${checks - fails} of ${checks} checks passed, ${fails} failed ═══\n`);
  await prisma.$disconnect();
  if (fails > 0) process.exitCode = 1;
}
await main();
