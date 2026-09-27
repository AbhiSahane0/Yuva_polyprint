import {
  estimateDays,
  planningOrder,
  planningStatus,
  planOutlook,
  type MachineLoad,
  type PlanningBoard,
  type PlanningQuery,
  type PlanningRow,
  type PlanningTotals,
  type PlanOrderInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { availabilityForCards } from '../production/material-reservation.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * **Planning — the gate between an order and the floor.**
 *
 * Two jobs, and it is careful not to take on a third.
 *
 * It runs the **material check before a card exists**. That check is already
 * thorough — every ply, ink and adhesive, and it knows a reel too narrow is no
 * use whatever it weighs — but it could only be asked of a job card, so the
 * only way to learn an order could not be made was to raise the card and be
 * refused. Here the same code is asked of the order itself, by handing it a
 * requirement keyed on the order's own id. Nothing is reserved: an order is not
 * a claim on anything, and holding film for a job nobody has scheduled would
 * starve the one on the machine.
 *
 * And it records **when a job runs and on what** — the single fact nothing in
 * the system held. Everything else on this board is derived, so there is
 * nothing here for anybody to keep up to date and nothing that can quietly go
 * stale.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const today = (): string => new Date().toISOString().slice(0, 10);

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  customerId: true,
  customerName: true,
  jobName: true,
  customerPoNumber: true,
  quantityKg: true,
  quantityPouches: true,
  dueDate: true,
  plannedStart: true,
  plannedMachineId: true,
  planNote: true,
  plannedBy: true,
  plannedAt: true,
  plannedMachine: { select: { id: true, name: true, kind: true } },
  productionOrders: {
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
    take: 1,
  },
} as const;

type Row = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

/**
 * The orders planning is about.
 *
 * Confirmed and in production only. A completed or cancelled order has nothing
 * left to schedule, and leaving them on the board would bury the four that
 * matter under a year of finished work.
 */
const OPEN: Prisma.OrderWhereInput = { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } };

async function buildRows(rows: Row[]): Promise<PlanningRow[]> {
  if (rows.length === 0) return [];

  const settings = await getSettings();

  /*
   * The card's own material check, asked of an order.
   *
   * `availabilityForCards` takes { id, orderId, quantityKg } and resolves the
   * materials through the order's quotation, so an order is a perfectly good
   * subject for it. Keying on the ORDER's id rather than a card's is what makes
   * it measure against every existing claim without excluding one of its own —
   * which is right: an unplanned order holds nothing, and the question being
   * asked is what could be put behind it if a card were raised now.
   */
  const availability = await availabilityForCards(
    prisma,
    rows.map((row) => ({
      id: row.id,
      orderId: row.id,
      quantityKg: toNumber(row.quantityKg),
    })),
  );

  const now = today();

  return rows
    .map((row) => {
      const card = row.productionOrders[0] ?? null;
      const materials = availability.get(row.id) ?? [];
      /*
       * A finished card is never flagged short, and neither is an order behind
       * one — the film has already been claimed or issued, and telling the
       * board it is missing would be a shortage about a job that is running.
       */
      const shortOf = card ? [] : materials.filter((line) => line.shortBy > 0).map((l) => l.name);

      const plannedStart = row.plannedStart ? isoDate(row.plannedStart) : null;
      const dueDate = row.dueDate ? isoDate(row.dueDate) : null;

      const days = estimateDays({
        quantityKg: toNumber(row.quantityKg),
        makeReadyDays: settings.makeReadyDays,
        kgPerDay: settings.kgPerDay,
      });
      const outlook = planOutlook({ plannedStart, days, dueDate });

      return {
        orderId: row.id,
        orderNumber: row.number,
        orderStatus: row.status,
        status: planningStatus({
          hasCard: Boolean(card),
          isShort: shortOf.length > 0,
          plannedStart,
        }),

        customerId: row.customerId,
        customerName: row.customerName,
        jobName: row.jobName,
        customerPoNumber: row.customerPoNumber,

        quantityKg: toNumber(row.quantityKg),
        quantityPouches: row.quantityPouches,
        dueDate,
        isOverdue: Boolean(dueDate && dueDate < now),

        plannedStart,
        plannedMachineId: row.plannedMachineId,
        plannedMachineName: row.plannedMachine?.name ?? null,
        planNote: row.planNote,
        plannedBy: row.plannedBy,
        plannedAt: row.plannedAt?.toISOString() ?? null,

        estimateDays: days,
        plannedFinish: outlook.finish,
        landsLate: outlook.landsLate,
        daysLate: outlook.daysLate,

        materials,
        shortOf,
        /* No priced structure behind it — an order typed over the phone. Said
           plainly rather than shown as an order that needs no film. */
        materialUnknown: materials.length === 0,

        cardId: card?.id ?? null,
        cardNumber: card?.number ?? null,
      } satisfies PlanningRow;
    })
    .sort((a, b) =>
      planningOrder(
        { status: a.status, dueDate: a.dueDate, number: a.orderNumber },
        { status: b.status, dueDate: b.dueDate, number: b.orderNumber },
      ),
    );
}

function totalsOf(items: PlanningRow[]): PlanningTotals {
  return {
    ready: items.filter((row) => row.status === 'READY').length,
    scheduled: items.filter((row) => row.status === 'SCHEDULED').length,
    blocked: items.filter((row) => row.status === 'BLOCKED').length,
    landingLate: items.filter((row) => row.landsLate && row.status !== 'STARTED').length,
    started: items.filter((row) => row.status === 'STARTED').length,
  };
}

export async function planningBoard(query: PlanningQuery): Promise<PlanningBoard> {
  const rows = await prisma.order.findMany({
    where: {
      ...OPEN,
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
    select: ORDER_SELECT,
  });

  const all = await buildRows(rows);
  /*
   * The status filters are applied AFTER the rows are built, because the status
   * is worked out rather than stored — there is no column to filter on, and a
   * second implementation of the rule in SQL is a second rule to keep in step.
   * The totals stay whole-board on purpose: filtering to what is blocked must
   * not make the blocked count read as everything.
   */
  const totals = totalsOf(all);
  const items = all.filter(
    (row) =>
      (!query.status || row.status === query.status) &&
      (!query.blockedOnly || row.status === 'BLOCKED'),
  );

  return { items, totals };
}

/** One order's planning row, for the drawer on the order screen. */
export async function planningFor(orderId: string): Promise<PlanningRow> {
  const row = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
  if (!row) throw ApiError.notFound('That order is not on record');
  const [built] = await buildRows([row]);
  if (!built) throw ApiError.notFound('That order is not on record');
  return built;
}

/**
 * Books an order onto a day, a machine, or both.
 *
 * **A plan is an intention, not a permission.** It does not reserve film, it
 * does not raise a card, and it will happily date an order that is short — the
 * board says so in red, and a works that cannot write down "Tuesday, press 1,
 * film arriving Monday" is a works that keeps its plan on paper instead.
 *
 * What it refuses is planning something there is no longer anything to plan:
 * an order already on the floor has a card with real stages, and a date typed
 * here would be a second opinion about a job that is running.
 */
export async function planOrder(
  orderId: string,
  input: PlanOrderInput,
  actor: string,
): Promise<PlanningRow> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, number: true, _count: { select: { productionOrders: true } } },
  });
  if (!existing) throw ApiError.notFound('That order is not on record');
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    throw ApiError.conflict('That order is finished — there is nothing left to plan');
  }
  if (existing._count.productionOrders > 0) {
    throw ApiError.conflict(
      `Order #${existing.number} already has a job card — the floor owns it now`,
    );
  }

  if (input.plannedMachineId) {
    const machine = await prisma.costingMachine.findUnique({
      where: { id: input.plannedMachineId },
      select: { id: true, isActive: true, name: true },
    });
    if (!machine) throw ApiError.badRequest('That machine is not on record');
    /* A retired machine still costs old quotations; it does not run new work. */
    if (!machine.isActive) {
      throw ApiError.conflict(`${machine.name} has been retired — it cannot be booked`);
    }
  }

  /*
   * No day and no machine is no plan — whatever else was typed. The note
   * explains a plan and the stamp records who made it, so both go with it;
   * a note reading "customer collecting Thursday" against an order with no
   * date, and nobody's name on it, is a leftover rather than a record.
   */
  const clearing = !input.plannedStart && !input.plannedMachineId;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      plannedStart: input.plannedStart ? asDate(input.plannedStart) : null,
      plannedMachineId: input.plannedMachineId,
      planNote: clearing ? '' : input.planNote,
      plannedBy: clearing ? '' : actor,
      plannedAt: clearing ? null : new Date(),
    },
  });

  return planningFor(orderId);
}

/**
 * What each machine has booked onto it.
 *
 * The other half of a planning board: the first says what each order is
 * waiting for, this says what each machine is in for. Retired machines are
 * left out unless something is still booked on one, which would be worth
 * seeing rather than hiding.
 */
export async function machineLoad(): Promise<MachineLoad[]> {
  const [machines, orders, settings] = await Promise.all([
    prisma.costingMachine.findMany({
      select: { id: true, name: true, kind: true, isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    }),
    prisma.order.findMany({
      where: { ...OPEN, plannedMachineId: { not: null }, plannedStart: { not: null } },
      select: {
        id: true,
        number: true,
        customerName: true,
        jobName: true,
        quantityKg: true,
        dueDate: true,
        plannedStart: true,
        plannedMachineId: true,
      },
      orderBy: { plannedStart: 'asc' },
    }),
    getSettings(),
  ]);

  const byMachine = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.plannedMachineId!;
    byMachine.set(key, [...(byMachine.get(key) ?? []), order]);
  }

  return machines
    .filter((machine) => machine.isActive || byMachine.has(machine.id))
    .map((machine) => {
      const booked = byMachine.get(machine.id) ?? [];
      let bookedDays = 0;

      const rows = booked.map((order) => {
        const days = estimateDays({
          quantityKg: toNumber(order.quantityKg),
          makeReadyDays: settings.makeReadyDays,
          kgPerDay: settings.kgPerDay,
        });
        bookedDays += days;
        const plannedStart = isoDate(order.plannedStart!);
        const outlook = planOutlook({
          plannedStart,
          days,
          dueDate: order.dueDate ? isoDate(order.dueDate) : null,
        });
        return {
          orderId: order.id,
          orderNumber: order.number,
          customerName: order.customerName,
          jobName: order.jobName,
          quantityKg: toNumber(order.quantityKg),
          plannedStart,
          plannedFinish: outlook.finish,
          landsLate: outlook.landsLate,
        };
      });

      return {
        machineId: machine.id,
        machineName: machine.name,
        kind: machine.kind,
        orders: rows,
        totalKg:
          Math.round(booked.reduce((sum, o) => sum + toNumber(o.quantityKg), 0) * 1000) / 1000,
        bookedDays: Math.round(bookedDays * 100) / 100,
      } satisfies MachineLoad;
    });
}
