import {
  canMoveProductionTo,
  productionProgress,
  PRODUCTION_STATUS_LABELS,
  requiredStages,
  stageWasteKg,
  type AddProductionStageInput,
  type CreateProductionOrderInput,
  type ListProductionQuery,
  type MachineKind,
  type ProductionOrder,
  type ProductionStageRow,
  type ProductionStatus,
  type UpdateProductionOrderInput,
  type UpdateProductionStageInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Production — what the floor actually did.
 *
 * A quotation says what a job should cost, an order says what was asked for,
 * and a job card says what happened: on which machine, by whom, and what each
 * stage lost. It is the third of the three, and the first that anybody on the
 * floor ever touches.
 */

const toNumber = (value: Prisma.Decimal | number): number => Number(value);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

const WITH_ALL = {
  order: { select: { number: true, dueDate: true } },
  stages: { orderBy: { position: 'asc' } },
} as const;

type Row = Prisma.ProductionOrderGetPayload<{ include: typeof WITH_ALL }>;

function toStage(row: Row['stages'][number]): ProductionStageRow {
  const inputKg = toNumber(row.inputKg);
  const outputKg = toNumber(row.outputKg);
  return {
    id: row.id,
    position: row.position,
    stage: row.stage,
    pass: row.pass,
    status: row.status,
    machineId: row.machineId,
    machineName: row.machineName,
    operator: row.operator,
    inputKg,
    outputKg,
    wasteKg: stageWasteKg({ inputKg, outputKg }),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    notes: row.notes,
  };
}

function toProduction(row: Row): ProductionOrder {
  const stages = row.stages.map(toStage);
  /*
   * The stage being worked, else the next one waiting. What the list column
   * "Current stage" shows, and what the floor answers when asked where a job
   * is — not the last one finished, which is where it has BEEN.
   */
  const current =
    stages.find((s) => s.status === 'RUNNING') ??
    stages.find((s) => s.status === 'PENDING') ??
    null;

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderId: row.orderId,
    orderNumber: row.order.number,
    customerName: row.customerName,
    jobName: row.jobName,
    jobId: row.jobId,
    quantityKg: toNumber(row.quantityKg),
    notes: row.notes,
    dueDate: row.order.dueDate ? isoDate(row.order.dueDate) : null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    stages,
    progressPercent: productionProgress(stages),
    currentStage: current?.stage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function peekNextNumber(): Promise<number> {
  const latest = await prisma.productionOrder.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (latest?.number ?? 0) + 1;
}

export async function listProduction(query: ListProductionQuery) {
  const where: Prisma.ProductionOrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.stage
      ? { stages: { some: { stage: query.stage, status: { in: ['PENDING', 'RUNNING'] } } } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { customerName: { contains: query.search, mode: 'insensitive' } },
            { jobName: { contains: query.search, mode: 'insensitive' } },
            ...(Number.isFinite(Number(query.search)) ? [{ number: Number(query.search) }] : []),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      include: WITH_ALL,
      /* Running first, then planned, then what is finished. The floor's order,
         not the filing cabinet's. */
      orderBy: [{ status: 'asc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.productionOrder.count({ where }),
  ]);

  return { items: rows.map(toProduction), total, page: query.page, pageSize: query.pageSize };
}

export async function getProductionById(id: string): Promise<ProductionOrder> {
  const row = await prisma.productionOrder.findUnique({ where: { id }, include: WITH_ALL });
  if (!row) throw ApiError.notFound('That job card is not on record');
  return toProduction(row);
}

/**
 * The structure behind an order, so the stages can be derived from it.
 *
 * Three places know it, in descending order of authority: the quotation line
 * the order came from, which is what was priced; the job master, which is what
 * the works has on record for that design; and nothing at all, for an order
 * typed over the phone against a name.
 *
 * The last case gets the ordinary two-ply pouch, because that is what the works
 * makes — and the office ticks a stage off if this one is different. A card
 * with no stages would be worse: it would look finished.
 */
async function structureFor(
  tx: Prisma.TransactionClient,
  order: { quotationItemId: string | null; jobId: string | null },
) {
  if (order.quotationItemId) {
    const item = await tx.quotationItem.findUnique({
      where: { id: order.quotationItemId },
      select: {
        jobKind: true,
        layers: { select: { micron: true } },
        colours: { select: { id: true } },
      },
    });
    if (item) {
      return {
        plyCount: item.layers.filter((l) => toNumber(l.micron) > 0).length,
        makesPouches: item.jobKind !== 'ROLL',
        /* A line naming no colours is costed at the blended ink rate rather
           than not printed at all, so this asks the job kind, not the list. */
        isPrinted: true,
      };
    }
  }

  if (order.jobId) {
    const job = await tx.job.findUnique({
      where: { id: order.jobId },
      select: { petMicron: true, metPetMicron: true, polyMicron: true, jobType: true },
    });
    if (job) {
      const plies = [job.petMicron, job.metPetMicron, job.polyMicron].filter(
        (value) => value !== null && toNumber(value) > 0,
      ).length;
      return {
        plyCount: plies || 2,
        makesPouches: !/roll/i.test(job.jobType),
        isPrinted: true,
      };
    }
  }

  return { plyCount: 2, makesPouches: true, isPrinted: true };
}

/**
 * Raises a job card against an order.
 *
 * **Refused while one is still open.** A second card on the same order is
 * either a mistake or a batch, and the two look identical from here — so the
 * mistake is blocked and the batch waits until the first is finished, which is
 * the honest reading of "we are running it in two goes".
 *
 * Starting production moves the ORDER to in-production in the same transaction.
 * Nothing else is going to do it, and an order sitting at confirmed while its
 * card runs is the kind of disagreement this whole module exists to end.
 */
export async function createProduction(
  input: CreateProductionOrderInput,
): Promise<ProductionOrder> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        customerName: true,
        jobName: true,
        jobId: true,
        quantityKg: true,
        quotationItemId: true,
      },
    });
    if (!order) throw ApiError.notFound('That order is not on record');
    if (order.status === 'CANCELLED') {
      throw ApiError.conflict('That order was cancelled — there is nothing to make');
    }

    const open = await tx.productionOrder.findFirst({
      where: { orderId: order.id, status: { not: 'COMPLETED' } },
      select: { number: true },
    });
    if (open) {
      throw ApiError.conflict(
        `Job card #${open.number} is already open on this order. Finish it before raising another`,
      );
    }

    const latest = await tx.productionOrder.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const stages = requiredStages(await structureFor(tx, order));

    const card = await tx.productionOrder.create({
      data: {
        number: (latest?.number ?? 0) + 1,
        orderId: order.id,
        customerName: order.customerName,
        jobName: order.jobName,
        jobId: order.jobId,
        quantityKg: input.quantityKg ?? order.quantityKg,
        notes: input.notes,
        stages: {
          create: stages.map((stage) => ({
            position: stage.position,
            stage: stage.stage,
            pass: stage.pass,
          })),
        },
      },
      include: WITH_ALL,
    });

    return toProduction(card);
  });
}

export async function updateProduction(
  id: string,
  input: UpdateProductionOrderInput,
): Promise<ProductionOrder> {
  const existing = await prisma.productionOrder.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That job card is not on record');

  const status: ProductionStatus = input.status ?? existing.status;
  if (!canMoveProductionTo(existing.status, status)) {
    throw ApiError.conflict(
      `A ${PRODUCTION_STATUS_LABELS[existing.status].toLowerCase()} job card cannot be moved to ${PRODUCTION_STATUS_LABELS[status].toLowerCase()}`,
    );
  }

  const movedTo = status !== existing.status ? status : null;

  return prisma.$transaction(async (tx) => {
    const row = await tx.productionOrder.update({
      where: { id },
      data: {
        ...(input.quantityKg !== undefined ? { quantityKg: input.quantityKg } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        status,
        ...(movedTo === 'RUNNING' && !existing.startedAt ? { startedAt: new Date() } : {}),
        ...(movedTo === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
      include: WITH_ALL,
    });

    if (movedTo === 'RUNNING') await startTheOrder(tx, row.orderId);
    return toProduction(row);
  });
}

/**
 * Moves the order to in-production, if it is not already past it.
 *
 * The one piece of automation in this module, and it earns it: an order sitting
 * at confirmed while its job card runs is exactly the disagreement between the
 * office and the floor that the system exists to end. Completing the card does
 * NOT complete the order — for a customer, complete means delivered, and
 * nothing here knows about that yet.
 */
async function startTheOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (order?.status === 'CONFIRMED') {
    await tx.order.update({ where: { id: orderId }, data: { status: 'IN_PRODUCTION' } });
  }
}

/** Records what a stage did, and starts the card the first time one runs. */
export async function updateStage(
  stageId: string,
  input: UpdateProductionStageInput,
): Promise<ProductionOrder> {
  const existing = await prisma.productionStage.findUnique({
    where: { id: stageId },
    select: { id: true, status: true, productionOrderId: true, startedAt: true },
  });
  if (!existing) throw ApiError.notFound('That stage is not on record');

  return prisma.$transaction(async (tx) => {
    let machineName: string | undefined;
    if (input.machineId) {
      const machine = await tx.costingMachine.findUnique({
        where: { id: input.machineId },
        select: { name: true },
      });
      if (!machine) throw ApiError.notFound('That machine is not on record');
      machineName = machine.name;
    } else if (input.machineId === null) {
      machineName = '';
    }

    const status = input.status ?? existing.status;
    const movedTo = status !== existing.status ? status : null;

    await tx.productionStage.update({
      where: { id: stageId },
      data: {
        ...(input.machineId !== undefined ? { machineId: input.machineId } : {}),
        ...(machineName !== undefined ? { machineName } : {}),
        ...(input.operator !== undefined ? { operator: input.operator } : {}),
        ...(input.inputKg !== undefined ? { inputKg: input.inputKg } : {}),
        ...(input.outputKg !== undefined ? { outputKg: input.outputKg } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        status,
        ...(movedTo === 'RUNNING' && !existing.startedAt ? { startedAt: new Date() } : {}),
        ...(movedTo === 'DONE' ? { finishedAt: new Date() } : {}),
        /* Ticked off after the fact: the times are no longer about anything. */
        ...(movedTo === 'SKIPPED' ? { startedAt: null, finishedAt: null } : {}),
      },
    });

    /*
     * A stage running means the card is running, and the order with it. Said
     * once here rather than asked of whoever clicks: the floor starts a stage,
     * not a card, and it should not have to remember to start both.
     */
    if (movedTo === 'RUNNING') {
      const card = await tx.productionOrder.findUnique({
        where: { id: existing.productionOrderId },
        select: { status: true, startedAt: true, orderId: true },
      });
      if (card && (card.status === 'PLANNED' || card.status === 'ON_HOLD')) {
        await tx.productionOrder.update({
          where: { id: existing.productionOrderId },
          data: { status: 'RUNNING', ...(card.startedAt ? {} : { startedAt: new Date() }) },
        });
        await startTheOrder(tx, card.orderId);
      }
    }

    const row = await tx.productionOrder.findUnique({
      where: { id: existing.productionOrderId },
      include: WITH_ALL,
    });
    return toProduction(row!);
  });
}

/** Puts a stage back on a card the derivation left it off. */
export async function addStage(
  id: string,
  input: AddProductionStageInput,
): Promise<ProductionOrder> {
  const card = await prisma.productionOrder.findUnique({
    where: { id },
    select: { id: true, status: true, stages: { select: { position: true } } },
  });
  if (!card) throw ApiError.notFound('That job card is not on record');
  if (card.status === 'COMPLETED') {
    throw ApiError.conflict('That job card is finished — a stage cannot be added to it now');
  }

  const position = Math.max(0, ...card.stages.map((s) => s.position)) + 1;
  await prisma.productionStage.create({
    data: { productionOrderId: id, position, stage: input.stage as MachineKind },
  });
  return getProductionById(id);
}

/**
 * Deletes a job card nobody has started.
 *
 * Once a stage has run there is material behind it, and a deleted card is
 * material nothing explains. There is no "cancel" here as there is on an order:
 * a card that should not have been raised on an untouched order is a mistake,
 * and a mistake is worth removing rather than recording.
 */
export async function deleteProduction(id: string): Promise<{ id: string }> {
  const existing = await prisma.productionOrder.findUnique({
    where: { id },
    select: { status: true, startedAt: true },
  });
  if (!existing) throw ApiError.notFound('That job card is not on record');
  if (existing.status !== 'PLANNED' || existing.startedAt) {
    throw ApiError.conflict('Only a job card that has not started can be deleted');
  }
  await prisma.productionOrder.delete({ where: { id } });
  return { id };
}
