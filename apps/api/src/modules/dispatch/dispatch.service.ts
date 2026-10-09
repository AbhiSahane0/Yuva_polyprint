import {
  averagePouchGrams,
  canMoveDispatchTo,
  DISPATCH_STATUS_LABELS,
  lineNetKg,
  linePouches,
  lineValue,
  orderDelivery,
  type CancelDispatchInput,
  type CreateDispatchInput,
  type Dispatch,
  type DispatchLine,
  type DispatchLineInput,
  type DispatchList,
  type DispatchSummary,
  type DispatchTotals,
  type ListDispatchesQuery,
  type OrderDelivery,
  type PostDispatchInput,
  type ReadyToSend,
  type ReadyToSendQuery,
  type UpdateDispatchInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { rejectedByCard } from '../quality/quality.service.js';

/**
 * **Dispatch — what left the building, and on whose lorry.**
 *
 * The link the rest of the system was missing. A job card being completed never
 * completed the order and was right not to: for a customer, complete means
 * delivered. This is the part that knows, and an order now completes itself the
 * moment the last of it goes out.
 *
 * Three rules hold the module up:
 *
 * 1. **A note is a lorry.** One vehicle, one customer, one signature, with a
 *    line per order aboard and a row per reel beneath it.
 * 2. **A draft is not a delivery.** Nothing a draft says counts against any
 *    order. Only posting settles anything, and posting is one transaction.
 * 3. **Nothing about delivery is stored twice.** What is in the godown, what is
 *    still owed, whether an order is done — all of it is arithmetic over the
 *    finished cards and the posted notes. The only thing written back is the
 *    order's own status, because that is a fact the rest of the app reads.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);

/** A `@db.Date` column back as the yyyy-mm-dd it was stored as. */
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const today = (): string => new Date().toISOString().slice(0, 10);

const kg = (value: number): string => value.toFixed(3);

/* ------------------------------------------------------------------ reading */

const LINE_INCLUDE = {
  packages: { orderBy: { position: 'asc' } },
  pouchWeighings: { orderBy: { position: 'asc' } },
  order: {
    select: {
      id: true,
      number: true,
      status: true,
      jobId: true,
      customerPoNumber: true,
      quantityKg: true,
      ratePerKg: true,
      ratePerPouch: true,
    },
  },
  productionOrder: { select: { number: true } },
} as const;

const DISPATCH_INCLUDE = {
  lines: { include: LINE_INCLUDE, orderBy: { position: 'asc' } },
} as const;

type Row = Prisma.DispatchGetPayload<{ include: typeof DISPATCH_INCLUDE }>;
type LineRow = Row['lines'][number];

/**
 * How much of an order has been made, and how much of it has gone.
 *
 * The one place either question is answered, so the godown screen, the posting
 * check and the order's own status cannot reach different conclusions about the
 * same order.
 *
 * `excludeDispatchId` leaves one note out of the "already gone" figure, which is
 * what cancelling needs: the question there is where the order stands *without*
 * this note.
 */
async function deliveryFor(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  excludeDispatchId?: string,
): Promise<Map<string, OrderDelivery>> {
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return new Map();

  const [orders, cards, sent] = await Promise.all([
    tx.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, quantityKg: true, quantityPouches: true, ratePerPouch: true },
    }),
    /*
     * Only finished runs. A card still on the machine has made nothing the
     * godown can put on a lorry, whatever its stages say.
     */
    tx.productionOrder.findMany({
      where: { orderId: { in: ids }, status: 'COMPLETED' },
      select: {
        id: true,
        orderId: true,
        quantityKg: true,
        jobSheet: { select: { finalOutputKg: true } },
      },
    }),
    tx.dispatchLine.findMany({
      where: {
        orderId: { in: ids },
        dispatch: { status: 'DISPATCHED' },
        ...(excludeDispatchId ? { dispatchId: { not: excludeDispatchId } } : {}),
      },
      select: { orderId: true, quantityKg: true, quantityPouches: true },
    }),
  ]);

  /*
   * **Film that was made and then failed.**
   *
   * A rejection is not waste. Waste is what the machine lost, and the run's
   * own output already has it taken off; this is finished film that was
   * weighed, packed and then rejected at the checking table. It is still in
   * the building and it still cannot go on a lorry, so it is counted out of
   * what the godown can send — the one place a quality issue reaches the rest
   * of the system.
   */
  const rejected = await rejectedByCard(
    tx,
    cards.map((card) => card.id),
  );

  const producedKg = new Map<string, number>();
  for (const card of cards) {
    /*
     * What the run actually packed, where the office has said so. Until a job
     * sheet is costed the card's own quantity is the best figure there is — and
     * it is the planned one, which is why sending a genuine overrun needs the
     * override rather than being impossible.
     */
    const output = toNumber(card.jobSheet?.finalOutputKg) || toNumber(card.quantityKg);
    /* Floored at nought: a card cannot have made a negative amount, however
       much of what it made was later rejected. */
    const sendable = Math.max(0, output - (rejected.get(card.id) ?? 0));
    producedKg.set(card.orderId, (producedKg.get(card.orderId) ?? 0) + sendable);
  }

  const goneKg = new Map<string, number>();
  const gonePouches = new Map<string, number>();
  for (const line of sent) {
    goneKg.set(line.orderId, (goneKg.get(line.orderId) ?? 0) + toNumber(line.quantityKg));
    gonePouches.set(line.orderId, (gonePouches.get(line.orderId) ?? 0) + line.quantityPouches);
  }

  const out = new Map<string, OrderDelivery>();
  for (const order of orders) {
    const orderedKg = toNumber(order.quantityKg);
    const made = producedKg.get(order.id) ?? 0;
    out.set(
      order.id,
      orderDelivery({
        quantityKg: orderedKg,
        quantityPouches: order.quantityPouches,
        ratePerPouch: toNumber(order.ratePerPouch),
        producedKg: made,
        /*
         * Inferred from the weight, because **no job sheet records a pouch
         * count** — the works weighs what it packs. Ordered count against
         * ordered weight is the only ratio there is, so a pouch order's godown
         * figure is an estimate and is only ever read as one. Nothing is
         * blocked on it: the over-production check below is on weight alone.
         */
        producedPouches: orderedKg > 0 ? Math.round((made / orderedKg) * order.quantityPouches) : 0,
        dispatchedKg: goneKg.get(order.id) ?? 0,
        dispatchedPouches: gonePouches.get(order.id) ?? 0,
      }),
    );
  }
  return out;
}

function toLine(row: LineRow, delivery: OrderDelivery | undefined): DispatchLine {
  const netKg = toNumber(row.quantityKg);
  return {
    id: row.id,
    position: row.position,

    orderId: row.orderId,
    orderNumber: row.order.number,
    orderStatus: row.order.status,
    customerPoNumber: row.order.customerPoNumber,

    jobName: row.jobName,
    jobId: row.order.jobId,

    productionOrderId: row.productionOrderId,
    productionOrderNumber: row.productionOrder?.number ?? null,

    quantityKg: netKg,
    quantityPouches: row.quantityPouches,
    packageCount: row.packages.length,
    value: lineValue({
      netKg,
      pouches: row.quantityPouches,
      ratePerKg: toNumber(row.order.ratePerKg),
      ratePerPouch: toNumber(row.order.ratePerPouch),
    }),

    remarks: row.remarks,
    packages: row.packages.map((pack) => ({
      id: pack.id,
      position: pack.position,
      reelNumber: pack.reelNumber,
      netKg: toNumber(pack.netKg),
      grossKg: pack.grossKg === null ? null : toNumber(pack.grossKg),
      widthMm: pack.widthMm,
    })),

    pouchWeighings: row.pouchWeighings.map((set) => ({
      id: set.id,
      position: set.position,
      pouchCount: set.pouchCount,
      grams: toNumber(set.grams),
    })),
    /* Worked out, never stored: the sets are the record and this is what they
       come to, so the two cannot drift apart. */
    pouchGrams: averagePouchGrams(
      row.pouchWeighings.map((set) => ({ pouchCount: set.pouchCount, grams: toNumber(set.grams) })),
    ),

    orderedKg: toNumber(row.order.quantityKg),
    producedKg: delivery?.producedKg ?? 0,
    dispatchedKg: delivery?.dispatchedKg ?? 0,
    pendingKg: delivery?.pendingKg ?? 0,
  };
}

function summarise(row: Row): DispatchSummary {
  const totalKg = row.lines.reduce((sum, line) => sum + toNumber(line.quantityKg), 0);
  return {
    id: row.id,
    number: row.number,
    status: row.status,

    customerId: row.customerId,
    customerName: row.customerName,

    dispatchDate: isoDate(row.dispatchDate),
    vehicleNumber: row.vehicleNumber,
    transporter: row.transporter,
    lrNumber: row.lrNumber,

    lineCount: row.lines.length,
    packageCount: row.lines.reduce((sum, line) => sum + line.packages.length, 0),
    totalKg: Math.round(totalKg * 1000) / 1000,
    totalPouches: row.lines.reduce((sum, line) => sum + line.quantityPouches, 0),
    totalValue:
      Math.round(
        row.lines.reduce(
          (sum, line) =>
            sum +
            lineValue({
              netKg: toNumber(line.quantityKg),
              pouches: line.quantityPouches,
              ratePerKg: toNumber(line.order.ratePerKg),
              ratePerPouch: toNumber(line.order.ratePerPouch),
            }),
          0,
        ) * 100,
      ) / 100,

    raisedBy: row.raisedBy,
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDispatch(row: Row, deliveries: Map<string, OrderDelivery>): Dispatch {
  return {
    ...summarise(row),
    deliveryAddress: row.deliveryAddress,
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    notes: row.notes,

    lines: row.lines.map((line) => toLine(line, deliveries.get(line.orderId))),

    dispatchedBy: row.dispatchedBy,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledReason: row.cancelledReason,

    overrideReason: row.overrideReason,
    overrideBy: row.overrideBy,
    overrideAt: row.overrideAt?.toISOString() ?? null,

    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function peekNextNumber(): Promise<number> {
  const latest = await prisma.dispatch.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (latest?.number ?? 0) + 1;
}

async function loadDispatch(id: string): Promise<Dispatch> {
  const row = await prisma.dispatch.findUnique({ where: { id }, include: DISPATCH_INCLUDE });
  if (!row) throw ApiError.notFound('That dispatch note is not on record');
  /*
   * Where the orders stand WITHOUT this note when it has not gone yet, and with
   * it once it has — which is exactly what its own status already does to the
   * figures, so nothing needs excluding here either way.
   */
  const deliveries = await deliveryFor(
    prisma,
    row.lines.map((line) => line.orderId),
  );
  return toDispatch(row, deliveries);
}

export const getDispatchById = loadDispatch;

export async function listDispatches(query: ListDispatchesQuery): Promise<DispatchList> {
  const where: Prisma.DispatchWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.from || query.to
      ? {
          dispatchDate: {
            ...(query.from ? { gte: asDate(query.from) } : {}),
            ...(query.to ? { lte: asDate(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { customerName: { contains: query.q, mode: 'insensitive' } },
            { vehicleNumber: { contains: query.q, mode: 'insensitive' } },
            { lrNumber: { contains: query.q, mode: 'insensitive' } },
            { transporter: { contains: query.q, mode: 'insensitive' } },
            { lines: { some: { jobName: { contains: query.q, mode: 'insensitive' } } } },
            ...(Number.isFinite(Number(query.q)) ? [{ number: Number(query.q) }] : []),
          ],
        }
      : {}),
  };

  const [rows, total, totals] = await Promise.all([
    prisma.dispatch.findMany({
      where,
      include: DISPATCH_INCLUDE,
      /* Drafts first — they are the only ones anybody still has to act on —
         then the most recent lorry. */
      orderBy: [{ status: 'asc' }, { dispatchDate: 'desc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.dispatch.count({ where }),
    dispatchTotals(),
  ]);

  return {
    items: rows.map(summarise),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totals,
  };
}

async function dispatchTotals(): Promise<DispatchTotals> {
  const monthStart = `${today().slice(0, 7)}-01`;
  const [drafts, queue, month] = await Promise.all([
    prisma.dispatch.count({ where: { status: 'DRAFT' } }),
    readyToSend({}),
    prisma.dispatchLine.aggregate({
      where: {
        dispatch: { status: 'DISPATCHED', dispatchDate: { gte: asDate(monthStart) } },
      },
      _sum: { quantityKg: true },
    }),
  ]);

  return {
    drafts,
    ordersReadyToSend: queue.length,
    readyKg: Math.round(queue.reduce((sum, row) => sum + row.readyKg, 0) * 1000) / 1000,
    dispatchedThisMonthKg: toNumber(month._sum.quantityKg),
    overdueOrders: queue.filter((row) => row.isOverdue).length,
  };
}

/**
 * The godown queue: orders with finished goods standing on the floor.
 *
 * Every figure is worked out from the finished cards and the posted notes. There
 * is no "ready to dispatch" flag, deliberately — that is the flag somebody
 * forgets to tick, after which the screen is wrong and the floor stops trusting
 * it.
 */
export async function readyToSend(query: ReadyToSendQuery): Promise<ReadyToSend[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: { not: 'CANCELLED' },
      /* Nothing is ready until at least one run behind it has finished. */
      productionOrders: { some: { status: 'COMPLETED' } },
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.q
        ? {
            OR: [
              { customerName: { contains: query.q, mode: 'insensitive' } },
              { jobName: { contains: query.q, mode: 'insensitive' } },
              { customerPoNumber: { contains: query.q, mode: 'insensitive' } },
              ...(Number.isFinite(Number(query.q)) ? [{ number: Number(query.q) }] : []),
            ],
          }
        : {}),
    },
    select: {
      id: true,
      number: true,
      status: true,
      customerId: true,
      customerName: true,
      jobId: true,
      jobName: true,
      customerPoNumber: true,
      dueDate: true,
      quantityKg: true,
      quantityPouches: true,
      ratePerKg: true,
      ratePerPouch: true,
      productionOrders: {
        where: { status: 'COMPLETED' },
        select: {
          id: true,
          number: true,
          quantityKg: true,
          completedAt: true,
          jobSheet: { select: { finalOutputKg: true } },
        },
        orderBy: { completedAt: 'desc' },
      },
    },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
  });

  const deliveries = await deliveryFor(
    prisma,
    orders.map((order) => order.id),
  );
  /* The same rejections `deliveryFor` took off the totals, so the per-card
     list underneath cannot show a card as having more than the order does. */
  const rejected = await rejectedByCard(
    prisma,
    orders.flatMap((order) => order.productionOrders.map((card) => card.id)),
  );
  const now = today();

  return (
    orders
      .map((order) => {
        const state = deliveries.get(order.id);
        const cards = order.productionOrders.map((card) => ({
          id: card.id,
          number: card.number,
          producedKg: Math.max(
            0,
            (toNumber(card.jobSheet?.finalOutputKg) || toNumber(card.quantityKg)) -
              (rejected.get(card.id) ?? 0),
          ),
          completedAt: card.completedAt?.toISOString() ?? null,
        }));

        return {
          orderId: order.id,
          orderNumber: order.number,
          orderStatus: order.status,
          customerId: order.customerId,
          customerName: order.customerName,
          jobId: order.jobId,
          jobName: order.jobName,
          customerPoNumber: order.customerPoNumber,
          dueDate: order.dueDate ? isoDate(order.dueDate) : null,
          isOverdue: Boolean(order.dueDate && isoDate(order.dueDate) < now),

          orderedKg: toNumber(order.quantityKg),
          orderedPouches: order.quantityPouches,
          producedKg: state?.producedKg ?? 0,
          producedPouches: 0,
          dispatchedKg: state?.dispatchedKg ?? 0,
          dispatchedPouches: state?.dispatchedPouches ?? 0,
          readyKg: state?.readyKg ?? 0,
          readyPouches: state?.readyPouches ?? 0,
          pendingKg: state?.pendingKg ?? 0,
          percentDispatched: state?.percentDispatched ?? 0,

          ratePerKg: toNumber(order.ratePerKg),
          ratePerPouch: toNumber(order.ratePerPouch),

          cards,
        } satisfies ReadyToSend;
      })
      /* Nothing standing on the floor is nothing to dispatch. An order fully
       delivered drops off the queue on its own, without anybody closing it. */
      .filter((row) => row.readyKg > 0 || row.readyPouches > 0)
  );
}

/* ------------------------------------------------------------------ writing */

/**
 * Checks the orders a note names, and snapshots what the lines need from them.
 *
 * Done once, on the way in, because every one of these is a refusal the office
 * should get while the note is still a draft rather than at the gate with a
 * lorry waiting.
 */
async function resolveLines(
  tx: Prisma.TransactionClient,
  lines: DispatchLineInput[],
  customerId: string | null,
): Promise<{ jobName: string; orderId: string }[]> {
  const orders = await tx.order.findMany({
    where: { id: { in: lines.map((line) => line.orderId) } },
    select: { id: true, number: true, status: true, jobName: true, customerId: true },
  });
  const byId = new Map(orders.map((order) => [order.id, order]));

  return lines.map((line) => {
    const order = byId.get(line.orderId);
    if (!order) throw ApiError.badRequest('One of those orders is not on record');
    if (order.status === 'CANCELLED') {
      throw ApiError.conflict(`Order #${order.number} was cancelled — nothing can be sent for it`);
    }
    /*
     * One note, one customer. Each customer signs for their own goods, and a
     * challan naming two of them is one neither will accept.
     */
    if (customerId && order.customerId && order.customerId !== customerId) {
      throw ApiError.badRequest(
        `Order #${order.number} belongs to another customer — a lorry to two customers is two notes`,
      );
    }
    return { orderId: line.orderId, jobName: order.jobName };
  });
}

/** The nested rows for one line, with the reels deciding its weight. */
function lineData(line: DispatchLineInput, jobName: string, position: number) {
  return {
    position,
    orderId: line.orderId,
    jobName,
    productionOrderId: line.productionOrderId,
    /* The packages ARE the total where there are any — see `lineNetKg`. */
    quantityKg: lineNetKg(line),
    /* And where the packer weighed the pouches, the boxes are the count —
       see `linePouches`. A typed figure beside a weighed one is two answers
       to what the customer is going to count. */
    quantityPouches: linePouches(line),
    remarks: line.remarks,
    packages: {
      create: line.packages.map((pack, index) => ({
        position: index + 1,
        reelNumber: pack.reelNumber,
        netKg: pack.netKg,
        grossKg: pack.grossKg,
        widthMm: pack.widthMm,
      })),
    },
    pouchWeighings: {
      create: line.pouchWeighings.map((set, index) => ({
        position: index + 1,
        pouchCount: set.pouchCount,
        grams: set.grams,
      })),
    },
  };
}

export async function createDispatch(input: CreateDispatchInput, actor: string): Promise<Dispatch> {
  const id = await prisma.$transaction(async (tx) => {
    const resolved = await resolveLines(tx, input.lines, input.customerId);

    const latest = await tx.dispatch.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const row = await tx.dispatch.create({
      data: {
        number: (latest?.number ?? 0) + 1,
        customerId: input.customerId,
        customerName: input.customerName,
        dispatchDate: asDate(input.dispatchDate),
        deliveryAddress: input.deliveryAddress,
        vehicleNumber: input.vehicleNumber,
        transporter: input.transporter,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        lrNumber: input.lrNumber,
        notes: input.notes,
        raisedBy: actor,
        lines: {
          create: input.lines.map((line, index) =>
            lineData(line, resolved[index]!.jobName, index + 1),
          ),
        },
      },
      select: { id: true },
    });
    return row.id;
  }, TX);

  return loadDispatch(id);
}

/**
 * Corrects a note nobody has sent.
 *
 * Only while it is a draft. Once a lorry has gone the note is a record of what
 * went on it, and editing it would quietly change what an order has been
 * credited with — cancelling it and raising the real one says what happened.
 */
export async function updateDispatch(id: string, input: UpdateDispatchInput): Promise<Dispatch> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.dispatch.findUnique({
      where: { id },
      select: { status: true, customerId: true },
    });
    if (!existing) throw ApiError.notFound('That dispatch note is not on record');
    if (existing.status !== 'DRAFT') {
      throw ApiError.conflict(
        `A ${DISPATCH_STATUS_LABELS[existing.status].toLowerCase()} note cannot be edited — cancel it and raise the one that went`,
      );
    }

    const customerId = input.customerId !== undefined ? input.customerId : existing.customerId;

    if (input.lines) {
      const resolved = await resolveLines(tx, input.lines, customerId);
      /*
       * Replaced wholesale rather than reconciled row by row. A draft's lines
       * have no history worth preserving — nothing has been credited against
       * them — and a wholesale rewrite cannot leave a half-matched line behind.
       */
      await tx.dispatchLine.deleteMany({ where: { dispatchId: id } });
      for (const [index, line] of input.lines.entries()) {
        await tx.dispatchLine.create({
          data: { dispatchId: id, ...lineData(line, resolved[index]!.jobName, index + 1) },
        });
      }
    }

    await tx.dispatch.update({
      where: { id },
      data: {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
        ...(input.dispatchDate !== undefined ? { dispatchDate: asDate(input.dispatchDate) } : {}),
        ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
        ...(input.vehicleNumber !== undefined ? { vehicleNumber: input.vehicleNumber } : {}),
        ...(input.transporter !== undefined ? { transporter: input.transporter } : {}),
        ...(input.driverName !== undefined ? { driverName: input.driverName } : {}),
        ...(input.driverPhone !== undefined ? { driverPhone: input.driverPhone } : {}),
        ...(input.lrNumber !== undefined ? { lrNumber: input.lrNumber } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
  }, TX);

  return loadDispatch(id);
}

/**
 * **Sends it.** The one call that settles anything.
 *
 * Everything happens in one transaction, which is what makes two clerks with the
 * same 500 kg in front of them safe: both notes may exist as drafts, and the
 * second one to post is refused against what the first one has already taken.
 * The check is inside the transaction, so there is no window between reading the
 * godown and writing to it.
 *
 * Two things are written, and only two:
 *
 * - the note becomes dispatched, stamped with who sent it and on what lorry;
 * - every order it settles in full becomes **Completed** — which is the gap this
 *   whole module exists to close.
 */
export async function postDispatch(
  id: string,
  input: PostDispatchInput,
  actor: string,
): Promise<Dispatch> {
  await prisma.$transaction(async (tx) => {
    const note = await tx.dispatch.findUnique({
      where: { id },
      include: { lines: { select: { orderId: true, quantityKg: true, quantityPouches: true } } },
    });
    if (!note) throw ApiError.notFound('That dispatch note is not on record');
    if (!canMoveDispatchTo(note.status, 'DISPATCHED')) {
      throw ApiError.conflict(
        `That note is already ${DISPATCH_STATUS_LABELS[note.status].toLowerCase()}`,
      );
    }
    if (note.lines.length === 0) {
      throw ApiError.badRequest('There is nothing on this note to send');
    }

    const orderIds = note.lines.map((line) => line.orderId);
    /* Where every order stands with this note still not counted. */
    const before = await deliveryFor(tx, orderIds, id);

    const orders = await tx.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, number: true, status: true, quantityKg: true },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));

    /*
     * More on the lorry than the works has recorded making. Physically that
     * cannot happen, so it means one of two things — a run that packed more
     * than its card planned and has not been costed yet, or a mistake. The
     * office is told which order and by how much, and may say so and go.
     */
    const over: string[] = [];
    for (const line of note.lines) {
      const order = byId.get(line.orderId);
      const state = before.get(line.orderId);
      if (!order || !state) continue;
      const going = toNumber(line.quantityKg);
      const excess = going + state.dispatchedKg - state.producedKg;
      if (excess > 0.0005) {
        over.push(
          `Order #${order.number}: ${kg(state.producedKg)} kg made, ${kg(state.dispatchedKg)} kg already gone, ${kg(going)} kg on this lorry — ${kg(excess)} kg more than the works has recorded making`,
        );
      }
    }
    if (over.length > 0 && !input.overrideReason) {
      throw ApiError.conflict(
        `This note sends more than has been made. ${over.join('; ')}. Record why, and it will go.`,
      );
    }

    await tx.dispatch.update({
      where: { id },
      data: {
        status: 'DISPATCHED',
        vehicleNumber: input.vehicleNumber,
        dispatchedAt: new Date(),
        dispatchedBy: actor,
        /* Stamped only where it was actually needed, so a reason on file always
           means a note that really did go out over what was made. */
        ...(over.length > 0
          ? { overrideReason: input.overrideReason, overrideBy: actor, overrideAt: new Date() }
          : {}),
      },
    });

    /* Now that it counts, ask again and settle what it settled. */
    const after = await deliveryFor(tx, orderIds);
    for (const order of orders) {
      const state = after.get(order.id);
      if (!state?.isFullyDispatched) continue;
      if (order.status === 'COMPLETED' || order.status === 'CANCELLED') continue;
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
  }, TX);

  return loadDispatch(id);
}

/**
 * Cancels a note — including one that has already gone.
 *
 * A lorry turned back at the customer's gate is a real afternoon, and the goods
 * are back in the godown. So cancelling gives the quantities back and, where
 * this note is what completed an order, **puts that order back in production** —
 * because an order completed against a delivery that did not happen is the one
 * kind of wrong figure nobody finds until the customer rings.
 *
 * That reopening is written directly rather than through `canMoveOrderTo`, which
 * forbids it. The rule there is right: reopening a completed order must be a
 * deliberate decision somebody can point at. This is that decision, made in the
 * one place that can know a delivery was undone.
 */
export async function cancelDispatch(
  id: string,
  input: CancelDispatchInput,
  actor: string,
): Promise<Dispatch> {
  await prisma.$transaction(async (tx) => {
    const note = await tx.dispatch.findUnique({
      where: { id },
      include: { lines: { select: { orderId: true } } },
    });
    if (!note) throw ApiError.notFound('That dispatch note is not on record');
    if (!canMoveDispatchTo(note.status, 'CANCELLED')) {
      throw ApiError.conflict('That note is already cancelled');
    }

    const wasOut = note.status === 'DISPATCHED';
    const orderIds = note.lines.map((line) => line.orderId);

    await tx.dispatch.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: `${input.reason}${actor ? ` — ${actor}` : ''}`,
      },
    });

    /* A draft never counted for anything, so there is nothing to give back. */
    if (!wasOut || orderIds.length === 0) return;

    const after = await deliveryFor(tx, orderIds);
    const orders = await tx.order.findMany({
      where: { id: { in: orderIds }, status: 'COMPLETED' },
      select: { id: true },
    });
    for (const order of orders) {
      if (after.get(order.id)?.isFullyDispatched) continue;
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'IN_PRODUCTION', completedAt: null },
      });
    }
  }, TX);

  return loadDispatch(id);
}

/**
 * Throws away a draft nobody sent.
 *
 * Only a draft. A note that has gone out is the record of a lorry that went, and
 * deleting it would leave an order credited with a delivery nothing explains —
 * cancelling says the same thing, keeps the record, and takes a reason.
 */
export async function deleteDispatch(id: string): Promise<{ id: string }> {
  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { status: true, number: true },
  });
  if (!existing) throw ApiError.notFound('That dispatch note is not on record');
  if (existing.status !== 'DRAFT') {
    throw ApiError.conflict(
      'Only a draft can be deleted. Cancel it instead, so the record says what happened',
    );
  }
  await prisma.dispatch.delete({ where: { id } });
  return { id };
}
