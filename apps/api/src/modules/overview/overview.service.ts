import {
  laminationLabel,
  PRODUCTION_STAGE_LABELS,
  type Alert,
  type FloorCard,
  type Overview,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { readyToSend } from '../dispatch/dispatch.service.js';
import { listStock } from '../inventory/inventory.service.js';
import { machineBoard } from '../machines/machine.service.js';
import { planningBoard } from '../planning/planning.service.js';
import { listProduction } from '../production/production.service.js';
import { listQuotations } from '../quotations/quotation.service.js';
import { qualityBoard } from '../quality/quality.service.js';

/**
 * **The overview — the whole works on one screen.**
 *
 * It owns **no figures of its own.** Every number here is read from the module
 * that owns it: the godown from Dispatch, waste from Quality, machine states
 * from Machines, what can run from Planning. Nothing is recalculated a second
 * way, and that is the whole design.
 *
 * The reason is worth stating, because the shortcut is tempting. An overview
 * that computed its own version of "what is in the godown" would drift from
 * the Dispatch screen the first time either changed — and then somebody has to
 * check both, every time, forever, which is worse than having no overview.
 * Reading through the services costs a handful of extra queries and buys the
 * guarantee that the summary and the screen cannot disagree.
 *
 * Nothing here writes anything. It is safe to poll.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);
const round = (value: number, dp = 3) => Math.round(value * 10 ** dp) / 10 ** dp;
const today = (): string => new Date().toISOString().slice(0, 10);

function stageLabel(stage: { stage: string; pass: number }): string {
  if (stage.stage === 'LAMINATION' && stage.pass > 0) {
    return laminationLabel({ pass: stage.pass, totalPasses: 2, plies: [] }).title;
  }
  return (
    PRODUCTION_STAGE_LABELS[stage.stage as keyof typeof PRODUCTION_STAGE_LABELS] ?? stage.stage
  );
}

export async function overview(): Promise<Overview> {
  const monthStart = `${today().slice(0, 7)}-01`;

  const [quoted, orders, planning, cards, godown, machines, quality, stock, sent, lowDesigns] =
    await Promise.all([
      /*
       * Out with the customer, waiting for an answer.
       *
       * Through the quotations service, not a `_sum`: a quotation has no
       * stored total. Its value is worked out from the tier the customer was
       * given, and `grandWithGst` is the figure their own list screen shows —
       * so the overview quotes the same number back.
       */
      listQuotations({ page: 1, pageSize: 200, status: 'SENT' } as never),
      /* Committed to and not yet delivered. */
      prisma.order.aggregate({
        where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } },
        _count: { _all: true },
        _sum: { amount: true, quantityKg: true },
      }),
      planningBoard({}),
      listProduction({ page: 1, pageSize: 100 } as never),
      readyToSend({}),
      machineBoard({ days: 14 }),
      qualityBoard({ days: 14 }),
      listStock({ page: 1, pageSize: 1 } as never),
      prisma.dispatch.findMany({
        where: {
          status: 'DISPATCHED',
          dispatchDate: { gte: new Date(`${monthStart}T00:00:00.000Z`) },
        },
        select: { lines: { select: { quantityKg: true } } },
      }),
      prisma.job.count({ where: { customerId: null } }),
    ]);

  const running = cards.items.filter(
    (card) => card.status === 'RUNNING' || card.status === 'PLANNED' || card.status === 'ON_HOLD',
  );

  /* ------------------------------------------------------------- the floor */

  const stages = await prisma.productionStage.findMany({
    where: {
      status: 'RUNNING',
      productionOrder: { status: { in: ['PLANNED', 'RUNNING', 'ON_HOLD'] } },
    },
    select: {
      stage: true,
      pass: true,
      machineName: true,
      operator: true,
      productionOrderId: true,
    },
  });
  const stageOf = new Map(stages.map((stage) => [stage.productionOrderId, stage]));

  const floor: FloorCard[] = running
    .map((card) => {
      const stage = stageOf.get(card.id);
      return {
        cardId: card.id,
        cardNumber: card.number,
        orderNumber: card.orderNumber ?? 0,
        customerName: card.customerName,
        jobName: card.jobName,
        stage: stage?.stage ?? 'PRINTING',
        stageLabel: stage ? stageLabel(stage) : 'Not started',
        machineName: stage?.machineName ?? '',
        operator: stage?.operator ?? '',
        quantityKg: card.quantityKg,
        progressPercent: card.progressPercent,
        isShort: card.materials.some((line) => line.shortBy > 0) && card.status !== 'COMPLETED',
        dueDate: card.dueDate ?? null,
        isOverdue: Boolean(card.dueDate && card.dueDate < today()),
      } satisfies FloorCard;
    })
    .sort((a, b) => b.progressPercent - a.progressPercent);

  /* --------------------------------------------------------- what to do next */

  /*
   * Derived every time, never stored. An alert table would be a list somebody
   * has to clear — and a cleared alert whose cause is still true is exactly
   * the lie this screen exists to avoid.
   */
  const attention: Alert[] = [];
  /* "1 job cannot make its date", not "1 jobs cannot make their date". */
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
  const add = (
    severity: Alert['severity'],
    id: string,
    count: number,
    title: string,
    href: string,
  ) => {
    if (count > 0) attention.push({ id, severity, count, title, href });
  };

  const shortCards = floor.filter((card) => card.isShort).length;
  add(
    'HIGH',
    'short',
    shortCards,
    shortCards === 1 ? 'A job card is short of film' : `${shortCards} job cards are short of film`,
    '/production',
  );
  add(
    'HIGH',
    'machine-down',
    machines.totals.down,
    machines.totals.down === 1 ? 'A machine is down' : `${machines.totals.down} machines are down`,
    '/machines',
  );
  add(
    'HIGH',
    'quality',
    quality.totals.highSeverity,
    `${quality.totals.highSeverity} serious quality ${plural(quality.totals.highSeverity, 'issue is', 'issues are')} open`,
    '/quality',
  );

  const overdue = floor.filter((card) => card.isOverdue).length;
  add(
    'MEDIUM',
    'overdue',
    overdue,
    `${overdue} ${plural(overdue, 'job is', 'jobs are')} past the day promised`,
    '/production',
  );
  add(
    'MEDIUM',
    'landing-late',
    planning.totals.landingLate,
    `${planning.totals.landingLate} planned ${plural(planning.totals.landingLate, 'job cannot make its date', 'jobs cannot make their dates')}`,
    '/planning',
  );
  add(
    'MEDIUM',
    'blocked',
    planning.totals.blocked,
    `${planning.totals.blocked} ${plural(planning.totals.blocked, 'order cannot', 'orders cannot')} run — no film`,
    '/planning',
  );
  add(
    'MEDIUM',
    'low-stock',
    stock.totals.lowStock,
    `${stock.totals.lowStock} ${plural(stock.totals.lowStock, 'material is', 'materials are')} at or below the reorder level`,
    '/inventory',
  );

  const readyOrders = godown.length;
  add(
    'LOW',
    'ready',
    readyOrders,
    `${readyOrders} ${plural(readyOrders, 'order is', 'orders are')} made and waiting to go`,
    '/dispatch',
  );
  add(
    'LOW',
    'unplanned',
    planning.totals.ready,
    `${planning.totals.ready} ${plural(planning.totals.ready, 'order has', 'orders have')} film but no date`,
    '/planning',
  );
  add(
    'LOW',
    'no-customer',
    lowDesigns,
    `${lowDesigns} ${plural(lowDesigns, 'design belongs', 'designs belong')} to nobody`,
    '/designs',
  );

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  /* ------------------------------------------------------------- the chain */

  const godownKg = godown.reduce((sum, row) => sum + row.readyKg, 0);

  return {
    asOf: new Date().toISOString(),

    chain: {
      quoted: {
        count: quoted.total,
        kg: null,
        value: Math.round(quoted.items.reduce((sum, row) => sum + row.grandWithGst, 0) * 100) / 100,
      },
      ordered: {
        count: orders._count._all,
        kg: round(toNumber(orders._sum.quantityKg)),
        value: toNumber(orders._sum.amount),
      },
      planned: { count: planning.totals.scheduled, kg: null, value: null },
      onTheFloor: {
        count: running.length,
        kg: round(running.reduce((sum, card) => sum + card.quantityKg, 0)),
        value: null,
      },
      inTheGodown: { count: godown.length, kg: round(godownKg), value: null },
      dispatchedThisMonth: {
        /* Notes, not lines: "three lorries went" is the figure somebody
           pictures, and one lorry can carry four orders. */
        count: sent.length,
        kg: round(
          sent.reduce(
            (sum, note) => sum + note.lines.reduce((kg, line) => kg + toNumber(line.quantityKg), 0),
            0,
          ),
        ),
        value: null,
      },
    },

    today: {
      outputKg: machines.totals.outputKg,
      wasteKg: quality.totals.todayWasteKg,
      wastePercent: quality.totals.todayWastePercent,
      runs: machines.machines.reduce((sum, machine) => sum + machine.runs, 0),
    },

    stock: {
      value: stock.totals.totalValue,
      materialsInStock: stock.totals.materialsInStock,
      lowStock: stock.totals.lowStock,
    },

    machines: {
      running: machines.totals.running,
      idle: machines.totals.idle,
      down: machines.totals.down,
    },

    attention,
    floor,
  };
}
