import {
  laminationLabel,
  lineValue,
  PRODUCTION_STAGE_LABELS,
  type Alert,
  type FloorCard,
  type Overview,
  type OverviewDay,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { readyToSend } from '../dispatch/dispatch.service.js';
import { listStock } from '../inventory/inventory.service.js';
import { machineBoard, machineOutput } from '../machines/machine.service.js';
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

/** Percent movement, or null where there was nothing to move from. */
function changeFrom(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** The first of the month, n months back. */
function monthStartOf(back: number): string {
  const at = new Date(`${today().slice(0, 8)}01T00:00:00.000Z`);
  at.setUTCMonth(at.getUTCMonth() - back);
  return at.toISOString().slice(0, 10);
}

export async function overview(days = 14): Promise<Overview> {
  const monthStart = monthStartOf(0);
  const lastMonthStart = monthStartOf(1);

  /* The window, and the one before it, so every figure can say which way it
     has moved. Asked for in one go and split below. */
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));

  const [
    quoted,
    orders,
    planning,
    cards,
    godown,
    machines,
    quality,
    stock,
    sent,
    lowDesigns,
    load,
    quotationCounts,
    lastMonth,
    completed,
    byCustomer,
    openOrders,
  ] = await Promise.all([
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
    machineBoard({ days }),
    qualityBoard({ days: days * 2 }),
    listStock({ page: 1, pageSize: 1 } as never),
    /*
     * What has actually left this month. The rate comes off the order rather
     * than the line, because a line carries what went and the order carries
     * what it is worth — the same pair `lineValue` takes on the Dispatch
     * screen, so the two figures are arrived at the same way.
     */
    prisma.dispatch.findMany({
      where: {
        status: 'DISPATCHED',
        dispatchDate: { gte: new Date(`${monthStart}T00:00:00.000Z`) },
      },
      select: {
        lines: {
          select: {
            quantityKg: true,
            quantityPouches: true,
            order: { select: { ratePerKg: true, ratePerPouch: true } },
          },
        },
      },
    }),
    prisma.job.count({ where: { customerId: null } }),

    /* Each machine's share of the window. Machines owns the figure. */
    machineOutput(days),

    /* How the quotation book converts. */
    prisma.quotation.groupBy({ by: ['status'], _count: { _all: true } }),

    /* Last month's deliveries, to say which way this month is going. */
    prisma.dispatch.findMany({
      where: {
        status: 'DISPATCHED',
        dispatchDate: {
          gte: new Date(`${lastMonthStart}T00:00:00.000Z`),
          lt: new Date(`${monthStart}T00:00:00.000Z`),
        },
      },
      select: {
        lines: {
          select: {
            quantityKg: true,
            quantityPouches: true,
            order: { select: { ratePerKg: true, ratePerPouch: true } },
          },
        },
      },
    }),

    /*
     * Every delivery that went out in the window, against the day it was
     * promised for.
     *
     * Measured on deliveries rather than on orders closing, and the difference
     * matters. A works delivers in parts, and the customer judges each lorry on
     * whether it came when it was meant to — an order that closes late after
     * three deliveries that were all on time is not three failures. Closing is
     * also a status somebody sets; a lorry leaving is a fact with a date on it.
     *
     * Nothing else works this out: Dispatch answers what is still owed, not
     * what was late when it went.
     */
    prisma.dispatchLine.findMany({
      where: {
        dispatch: { status: 'DISPATCHED', dispatchDate: { gte: windowStart } },
        order: { dueDate: { not: null } },
      },
      select: {
        dispatch: { select: { dispatchDate: true } },
        order: { select: { dueDate: true } },
      },
    }),

    /* Who the open order book is with. */
    prisma.order.groupBy({
      by: ['customerId', 'customerName'],
      where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } },
      _sum: { amount: true, quantityKg: true },
      _count: { _all: true },
    }),

    /* Open orders with a date on them, for what is about to be late. */
    prisma.order.findMany({
      where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] }, dueDate: { not: null } },
      select: {
        id: true,
        number: true,
        customerName: true,
        jobName: true,
        dueDate: true,
        quantityKg: true,
        status: true,
        _count: { select: { productionOrders: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 40,
    }),
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

  /* ------------------------------------------------------ the last fortnight */

  /*
   * Quality already works the fortnight out, day by day, for its own waste
   * chart — so this reads that series rather than querying the stages again.
   * What it adds is the other half of each day: Quality records what went ON
   * the machine and what was lost, and the works wants what came OFF.
   *
   * Quiet days stay in the series as zeros. A chart that skipped them would
   * put Friday next to Monday and make a fortnight look like a fortnight of
   * work, which is the one thing this chart must not do.
   */
  const asDay = (day: (typeof quality.trend)[number]): OverviewDay => ({
    date: day.date,
    outputKg: round(day.inputKg - day.wasteKg),
    wasteKg: round(day.wasteKg),
    wastePercent: day.percent,
    runs: day.runs,
  });

  /* Quality was asked for twice the window so the half before this one is here
     to compare against. The chart only ever draws the second half. */
  const series = quality.trend.map(asDay);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const trend = series.slice(-days);

  const sumKg = (rows: OverviewDay[]) => rows.reduce((sum, day) => sum + day.outputKg, 0);
  const sumWaste = (rows: OverviewDay[]) => rows.reduce((sum, day) => sum + day.wasteKg, 0);
  const sumInput = (rows: OverviewDay[]) =>
    rows.reduce((sum, day) => sum + day.outputKg + day.wasteKg, 0);
  const pct = (waste: number, input: number) =>
    input > 0 ? Math.round((waste / input) * 10000) / 100 : 0;

  const fortnightInputKg = sumInput(trend);
  const fortnightWasteKg = sumWaste(trend);
  const wasteNow = pct(fortnightWasteKg, fortnightInputKg);
  const wasteBefore = pct(sumWaste(previous), sumInput(previous));

  /* ------------------------------------------------------------ what it means */

  const valueOf = (
    notes: {
      lines: {
        quantityKg: unknown;
        quantityPouches: number | null;
        order: { ratePerKg: unknown; ratePerPouch: unknown } | null;
      }[];
    }[],
  ) =>
    Math.round(
      notes.reduce(
        (sum, note) =>
          sum +
          note.lines.reduce(
            (value, line) =>
              value +
              lineValue({
                netKg: toNumber(line.quantityKg as never),
                pouches: line.quantityPouches ?? 0,
                ratePerKg: toNumber(line.order?.ratePerKg as never),
                ratePerPouch: toNumber(line.order?.ratePerPouch as never),
              }),
            0,
          ),
        0,
      ) * 100,
    ) / 100;

  const sentKg = round(
    sent.reduce(
      (sum, note) => sum + note.lines.reduce((kg, line) => kg + toNumber(line.quantityKg), 0),
      0,
    ),
  );
  const sentValue = valueOf(sent);
  const lastMonthValue = valueOf(lastMonth);

  /* On time means the lorry went on or before the day it was promised for. An
     order with no date cannot be late, so the query has already left it out. */
  const deliveries = completed.length;
  const late = completed.filter(
    (line) =>
      line.dispatch.dispatchDate.toISOString().slice(0, 10) >
      line.order!.dueDate!.toISOString().slice(0, 10),
  ).length;

  const bookValue = toNumber(orders._sum.amount);
  const customers = byCustomer
    .map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      value: toNumber(row._sum.amount),
      kg: round(toNumber(row._sum.quantityKg)),
      orders: row._count._all,
      percent: bookValue > 0 ? Math.round((toNumber(row._sum.amount) / bookValue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  /* What the godown still owes on each open order, so "at risk" is about what
     is left rather than what was ordered. */
  const owed = new Map(godown.map((row) => [row.orderId, row.pendingKg]));
  const atRisk = openOrders
    .map((order) => {
      const due = order.dueDate!.toISOString().slice(0, 10);
      const daysLeft = Math.round(
        (new Date(`${due}T00:00:00.000Z`).getTime() -
          new Date(`${today()}T00:00:00.000Z`).getTime()) /
          86_400_000,
      );
      return {
        id: order.id,
        number: order.number,
        customerName: order.customerName,
        jobName: order.jobName,
        dueDate: due,
        daysLeft,
        quantityKg: round(toNumber(order.quantityKg)),
        pendingKg: owed.get(order.id) ?? round(toNumber(order.quantityKg)),
        status: order.status,
        notStarted: order._count.productionOrders === 0,
      };
    })
    /* A week's warning is what the floor can actually act on. */
    .filter((order) => order.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  const statusCount = (status: string) =>
    quotationCounts.find((row) => row.status === status)?._count._all ?? 0;
  const won = statusCount('WON');
  const lost = statusCount('LOST');

  const stageLabels: Record<string, string> = PRODUCTION_STAGE_LABELS;
  const wasteByStage = quality.byStage
    .map((row) => ({
      stage: row.stage,
      label: stageLabels[row.stage] ?? row.stage,
      wasteKg: row.wasteKg,
      inputKg: row.inputKg,
      percent: row.percent,
      runs: row.runs,
    }))
    .sort((a, b) => b.percent - a.percent);

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
        kg: sentKg,
        value: sentValue,
      },
    },

    today: {
      outputKg: machines.totals.outputKg,
      wasteKg: quality.totals.todayWasteKg,
      wastePercent: quality.totals.todayWastePercent,
      runs: machines.machines.reduce((sum, machine) => sum + machine.runs, 0),
    },

    days,
    trend,

    kpis: {
      orderBook: {
        value: bookValue,
        count: orders._count._all,
        kg: round(toNumber(orders._sum.quantityKg)),
      },
      delivered: {
        value: sentValue,
        previous: lastMonthValue,
        change: changeFrom(sentValue, lastMonthValue),
        riseIsGood: true,
        kg: sentKg,
        count: sent.length,
      },
      output: {
        value: round(sumKg(trend)),
        previous: round(sumKg(previous)),
        change: changeFrom(sumKg(trend), sumKg(previous)),
        riseIsGood: true,
      },
      waste: {
        value: wasteNow,
        previous: wasteBefore,
        change: changeFrom(wasteNow, wasteBefore),
        /* The one figure where down is the good direction. */
        riseIsGood: false,
      },
      onTime: {
        percent: deliveries > 0 ? Math.round(((deliveries - late) / deliveries) * 1000) / 10 : null,
        onTime: deliveries - late,
        late,
        total: deliveries,
      },
    },

    winRate: {
      sent: statusCount('SENT'),
      won,
      lost,
      /* Against the ones that were decided. A quotation still out with the
         customer is not a loss, and counting it as one would make a busy
         month look like a bad one. */
      percent: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null,
    },

    machineLoad: load,
    wasteByStage,
    customers,
    atRisk,

    fortnight: {
      outputKg: round(trend.reduce((sum, day) => sum + day.outputKg, 0)),
      wasteKg: round(fortnightWasteKg),
      wastePercent:
        fortnightInputKg > 0 ? Math.round((fortnightWasteKg / fortnightInputKg) * 10000) / 100 : 0,
      runs: trend.reduce((sum, day) => sum + day.runs, 0),
      bestDayKg: trend.reduce((best, day) => Math.max(best, day.outputKg), 0),
      workingDays: trend.filter((day) => day.runs > 0).length,
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
