import {
  canMoveOrderTo,
  orderAmount,
  ORDER_STATUS_LABELS,
  type CreateOrderInput,
  type ListOrdersQuery,
  type Order,
  type OrderStatus,
  type OrdersFromQuotation,
  type UpdateOrderInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Customer orders — what was actually asked for.
 *
 * A quotation is an offer and a job sheet is a post-mortem. This is the thing
 * in between that neither of them is: a commitment, with a quantity, a rate, a
 * date it is wanted by and a place it has got to.
 */

const toNumber = (value: Prisma.Decimal | number): number => Number(value);

/** A `@db.Date` column back as the yyyy-mm-dd it was stored as. */
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const today = (): string => new Date().toISOString().slice(0, 10);

type Row = Prisma.OrderGetPayload<{ include: { quotation: { select: { number: true } } } }>;

function toOrder(row: Row): Order {
  return {
    id: row.id,
    number: row.number,
    status: row.status,

    customerId: row.customerId,
    customerName: row.customerName,
    jobId: row.jobId,
    jobName: row.jobName,

    quotationId: row.quotationId,
    quotationNumber: row.quotation?.number ?? null,
    quotationItemId: row.quotationItemId,

    quantityKg: toNumber(row.quantityKg),
    ratePerKg: toNumber(row.ratePerKg),
    quantityPouches: row.quantityPouches,
    ratePerPouch: toNumber(row.ratePerPouch),
    amount: toNumber(row.amount),

    customerPoNumber: row.customerPoNumber,
    orderDate: isoDate(row.orderDate),
    dueDate: row.dueDate ? isoDate(row.dueDate) : null,

    notes: row.notes,

    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledReason: row.cancelledReason,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const WITH_QUOTATION = { quotation: { select: { number: true } } } as const;

export async function peekNextNumber(): Promise<number> {
  const latest = await prisma.order.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (latest?.number ?? 0) + 1;
}

export async function listOrders(query: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dueFrom || query.dueTo
      ? {
          dueDate: {
            ...(query.dueFrom ? { gte: asDate(query.dueFrom) } : {}),
            ...(query.dueTo ? { lte: asDate(query.dueTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { customerName: { contains: query.search, mode: 'insensitive' } },
            { jobName: { contains: query.search, mode: 'insensitive' } },
            { customerPoNumber: { contains: query.search, mode: 'insensitive' } },
            ...(Number.isFinite(Number(query.search)) ? [{ number: Number(query.search) }] : []),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: WITH_QUOTATION,
      /*
       * What is open and soonest due, first. A list ordered by number alone
       * puts the oldest order at the bottom on the day it goes late, which is
       * the one morning anybody needs to see it.
       */
      orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { items: rows.map(toOrder), total, page: query.page, pageSize: query.pageSize };
}

export async function getOrderById(id: string): Promise<Order> {
  const row = await prisma.order.findUnique({ where: { id }, include: WITH_QUOTATION });
  if (!row) throw ApiError.notFound('That order is not on record');
  return toOrder(row);
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const amount = orderAmount(input);
  const row = await prisma.order.create({
    data: {
      number: await peekNextNumber(),
      customerId: input.customerId,
      customerName: input.customerName,
      jobId: input.jobId,
      jobName: input.jobName,
      quantityKg: input.quantityKg,
      ratePerKg: input.ratePerKg,
      quantityPouches: input.quantityPouches,
      ratePerPouch: input.ratePerPouch,
      amount,
      customerPoNumber: input.customerPoNumber,
      orderDate: asDate(input.orderDate),
      dueDate: input.dueDate ? asDate(input.dueDate) : null,
      notes: input.notes,
    },
    include: WITH_QUOTATION,
  });
  return toOrder(row);
}

/**
 * Corrects an order, and moves its status.
 *
 * The status is checked against `canMoveOrderTo` rather than accepted, because
 * this endpoint is not the only way in and a completed order quietly returning
 * to production is the kind of thing nobody notices until the month's figures
 * disagree.
 */
export async function updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That order is not on record');

  const status: OrderStatus = input.status ?? existing.status;
  if (!canMoveOrderTo(existing.status, status)) {
    throw ApiError.conflict(
      `A ${ORDER_STATUS_LABELS[existing.status].toLowerCase()} order cannot be moved to ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
    );
  }

  /* Recomputed from whatever the figures are AFTER the patch, not from what
     arrived: a PATCH that moves only the rate still has to move the total. */
  const figures = {
    quantityKg: input.quantityKg ?? toNumber(existing.quantityKg),
    ratePerKg: input.ratePerKg ?? toNumber(existing.ratePerKg),
    quantityPouches: input.quantityPouches ?? existing.quantityPouches,
    ratePerPouch: input.ratePerPouch ?? toNumber(existing.ratePerPouch),
  };

  const movedTo = status !== existing.status ? status : null;

  const row = await prisma.order.update({
    where: { id },
    data: {
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
      ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      ...(input.jobName !== undefined ? { jobName: input.jobName } : {}),
      ...figures,
      amount: orderAmount(figures),
      ...(input.customerPoNumber !== undefined ? { customerPoNumber: input.customerPoNumber } : {}),
      ...(input.orderDate !== undefined ? { orderDate: asDate(input.orderDate) } : {}),
      ...(input.dueDate !== undefined
        ? { dueDate: input.dueDate ? asDate(input.dueDate) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      status,
      /* Stamped once, when it actually happens. */
      ...(movedTo === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(movedTo === 'CANCELLED'
        ? { cancelledAt: new Date(), cancelledReason: input.cancelledReason ?? '' }
        : {}),
    },
    include: WITH_QUOTATION,
  });
  return toOrder(row);
}

/**
 * Deletes an order nobody has started.
 *
 * Only while it is CONFIRMED. Once it has been in production there is a run
 * behind it, and a deleted order is a run nothing explains — cancelling says
 * the same thing and keeps the record, which is why it takes a reason.
 */
export async function deleteOrder(id: string): Promise<{ id: string }> {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That order is not on record');
  if (existing.status !== 'CONFIRMED') {
    throw ApiError.conflict(
      'Only a confirmed order can be deleted. Cancel it instead, so the record says what happened',
    );
  }
  await prisma.order.delete({ where: { id } });
  return { id };
}

/**
 * Turns a won quotation into orders — one per line.
 *
 * Called from the outcome endpoint inside the same transaction that wins the
 * quotation, so a quotation cannot end up won with no orders behind it.
 *
 * **Idempotent**, exactly as the job records it creates beside them are: the
 * line's id is unique on the order, so winning the same quotation twice creates
 * nothing the second time and says so.
 *
 * The quantity comes from the tier the customer actually accepted. A quotation
 * priced at three quantities is three prices for one job, and turning all three
 * into orders would be three times the work nobody asked for.
 */
export async function ordersFromQuotation(
  tx: Prisma.TransactionClient,
  quotationId: string,
): Promise<OrdersFromQuotation> {
  const quotation = await tx.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      customerId: true,
      customerName: true,
      date: true,
      selectedQuantity: true,
      wonTierId: true,
      wonTier: { select: { position: true } },
      items: {
        select: {
          id: true,
          jobId: true,
          jobName: true,
          quantities: {
            select: {
              position: true,
              quantityKg: true,
              ratePerKg: true,
              quantityPouches: true,
              ratePerPouch: true,
              totalAmount: true,
            },
          },
          order: { select: { number: true } },
        },
      },
    },
  });
  if (!quotation) return { created: [], skipped: [] };

  /* The tier the customer accepted, else the one the document was printed for. */
  const position = quotation.wonTier?.position ?? quotation.selectedQuantity;

  const created: number[] = [];
  const skipped: number[] = [];

  /* One read for the sequence, then counted up — the rows are written in one
     transaction and a query per line would race with itself. */
  const latest = await tx.order.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let next = (latest?.number ?? 0) + 1;

  for (const item of quotation.items) {
    if (item.order) {
      skipped.push(item.order.number);
      continue;
    }

    const quantity =
      item.quantities.find((q) => q.position === position) ?? item.quantities[0] ?? null;
    if (!quantity) continue;

    const row = await tx.order.create({
      data: {
        number: next,
        customerId: quotation.customerId,
        customerName: quotation.customerName,
        jobId: item.jobId,
        jobName: item.jobName,
        quotationId: quotation.id,
        quotationItemId: item.id,
        quantityKg: quantity.quantityKg,
        ratePerKg: quantity.ratePerKg,
        quantityPouches: quantity.quantityPouches,
        ratePerPouch: quantity.ratePerPouch,
        amount: quantity.totalAmount,
        /* Ordered the day it was won, not the day the quotation was written —
           which may be months earlier, and would make it late on arrival. */
        orderDate: asDate(today()),
      },
      select: { number: true },
    });
    created.push(row.number);
    next += 1;
  }

  return { created, skipped };
}
