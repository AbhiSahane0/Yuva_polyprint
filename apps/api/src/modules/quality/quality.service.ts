import {
  canMoveIssueTo,
  isOpenIssue,
  issueOrder,
  ISSUE_STATUS_LABELS,
  laminationLabel,
  PRODUCTION_STAGE_LABELS,
  rejectedKgOf,
  wasteByStage,
  wasteTrend,
  type CreateIssueInput,
  type IssueTarget,
  type QualityBoard,
  type QualityIssue,
  type QualityQuery,
  type StageWaste,
  type UpdateIssueInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * **Quality & waste.**
 *
 * The two halves of the screen are two different kinds of number, and keeping
 * them apart is most of the module.
 *
 * **Waste is read, not recorded.** Every stage already says what went on and
 * what came off, and has since the job card was built. Nothing here captures
 * a waste figure; it groups the ones the floor has been entering all along,
 * by process and by day, which is the only way the works can see that it is
 * the laminator losing the material rather than "the factory".
 *
 * **A rejection is recorded, and it is not waste.** Finished film that was
 * made, weighed and then failed. The material left the shelf once and was
 * lost once — adding a rejection to the waste figure would make a works that
 * scrapped 40 kg look as though it had lost 80. Its one consequence lives
 * elsewhere: Dispatch counts it out of what the godown can send.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);
const today = (): string => new Date().toISOString().slice(0, 10);

const ISSUE_INCLUDE = {
  productionOrder: {
    select: {
      id: true,
      number: true,
      customerName: true,
      jobName: true,
      order: { select: { number: true } },
    },
  },
  stage: {
    select: { id: true, stage: true, pass: true, productionOrderId: true },
  },
} as const;

type Row = Prisma.QualityIssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

function stageLabel(row: Row): string {
  /* Off the machine entirely — found at the checking table, or by the
     customer. Worth saying so rather than leaving the column blank. */
  if (!row.stage) return 'Checking';
  if (row.stage.stage === 'LAMINATION' && row.stage.pass > 0) {
    return laminationLabel({ pass: row.stage.pass, totalPasses: 2, plies: [] }).title;
  }
  return PRODUCTION_STAGE_LABELS[row.stage.stage] ?? row.stage.stage;
}

function toIssue(row: Row): QualityIssue {
  const raisedOn = row.createdAt.toISOString().slice(0, 10);
  return {
    id: row.id,
    number: row.number,

    cardId: row.productionOrderId,
    cardNumber: row.productionOrder.number,
    orderNumber: row.productionOrder.order?.number ?? 0,
    customerName: row.productionOrder.customerName,
    jobName: row.productionOrder.jobName,

    stageId: row.stageId,
    stage: row.stage?.stage ?? null,
    stageLabel: stageLabel(row),

    severity: row.severity,
    status: row.status,
    isOpen: isOpenIssue(row.status),

    title: row.title,
    detail: row.detail,
    rejectedKg: toNumber(row.rejectedKg),

    raisedBy: row.raisedBy,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleName,

    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolution: row.resolution,

    /*
     * How long it has been somebody's problem. Stops at the day it was
     * resolved — telling the office a closed issue is 40 days old is true and
     * useless.
     */
    openForDays: Math.max(
      0,
      Math.round(
        (Date.parse(
          `${(row.resolvedAt?.toISOString() ?? new Date().toISOString()).slice(0, 10)}T00:00:00Z`,
        ) -
          Date.parse(`${raisedOn}T00:00:00Z`)) /
          86_400_000,
      ),
    ),

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * What a set of cards cannot send, because it failed after it was made.
 *
 * Exported because **Dispatch** is where the figure matters: the godown's
 * "ready to send" is what the finished cards made, less what has gone, less
 * this. Keeping the sum here rather than in Dispatch means there is one
 * definition of a rejection, and it is next to the model that stores it.
 */
export async function rejectedByCard(
  tx: Prisma.TransactionClient,
  cardIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cardIds.length === 0) return out;

  const rows = await tx.qualityIssue.groupBy({
    by: ['productionOrderId'],
    where: { productionOrderId: { in: cardIds } },
    _sum: { rejectedKg: true },
  });
  for (const row of rows) out.set(row.productionOrderId, toNumber(row._sum.rejectedKg));
  return out;
}

/** The stages the waste figures are read from. Finished ones only. */
async function finishedStages(days: number): Promise<StageWaste[]> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.productionStage.findMany({
    where: { status: 'DONE', finishedAt: { gte: from } },
    select: { stage: true, inputKg: true, outputKg: true, finishedAt: true },
  });

  return rows.map((row) => ({
    stage: row.stage,
    inputKg: toNumber(row.inputKg),
    outputKg: toNumber(row.outputKg),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}

export async function qualityBoard(query: QualityQuery): Promise<QualityBoard> {
  const [stages, rows, rejected] = await Promise.all([
    finishedStages(query.days),
    prisma.qualityIssue.findMany({
      where: {
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.openOnly ? { status: { not: 'RESOLVED' } } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { detail: { contains: query.q, mode: 'insensitive' } },
                { responsibleName: { contains: query.q, mode: 'insensitive' } },
                { productionOrder: { jobName: { contains: query.q, mode: 'insensitive' } } },
                { productionOrder: { customerName: { contains: query.q, mode: 'insensitive' } } },
                ...(Number.isFinite(Number(query.q)) ? [{ number: Number(query.q) }] : []),
              ],
            }
          : {}),
      },
      include: ISSUE_INCLUDE,
    }),
    /*
     * Every rejection on a card that has not been delivered and closed. Read
     * against open cards only — film rejected on a job that shipped six
     * months ago is history, not something the godown is holding.
     */
    prisma.qualityIssue.aggregate({
      where: { productionOrder: { order: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } } } },
      _sum: { rejectedKg: true },
    }),
  ]);

  const issues = rows.map(toIssue).sort(issueOrder);
  const now = today();
  const todayStages = stages.filter((stage) => stage.finishedAt?.slice(0, 10) === now);
  const todayTotals = wasteTrend(todayStages, 1, now)[0]!;

  return {
    totals: {
      todayWastePercent: todayTotals.percent,
      todayWasteKg: todayTotals.wasteKg,
      rejectedKg: toNumber(rejected._sum.rejectedKg),
      openIssues: issues.filter((issue) => issue.isOpen).length,
      highSeverity: issues.filter((issue) => issue.isOpen && issue.severity === 'HIGH').length,
    },
    byStage: wasteByStage(stages),
    trend: wasteTrend(stages, query.days, now),
    issues,
  };
}

export async function getIssue(id: string): Promise<QualityIssue> {
  const row = await prisma.qualityIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  if (!row) throw ApiError.notFound('That issue is not on record');
  return toIssue(row);
}

/** The cards an issue can be raised against, with their stages. */
export async function issueTargets(): Promise<IssueTarget[]> {
  const cards = await prisma.productionOrder.findMany({
    where: { status: { in: ['PLANNED', 'RUNNING', 'ON_HOLD', 'COMPLETED'] } },
    select: {
      id: true,
      number: true,
      customerName: true,
      jobName: true,
      order: { select: { number: true } },
      stages: {
        where: { status: { not: 'SKIPPED' } },
        select: { id: true, stage: true, pass: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { number: 'desc' },
    take: 50,
  });

  return cards.map((card) => ({
    cardId: card.id,
    cardNumber: card.number,
    orderNumber: card.order?.number ?? 0,
    customerName: card.customerName,
    jobName: card.jobName,
    stages: card.stages.map((stage) => ({
      id: stage.id,
      stage: stage.stage,
      label:
        stage.stage === 'LAMINATION' && stage.pass > 0
          ? laminationLabel({ pass: stage.pass, totalPasses: 2, plies: [] }).title
          : (PRODUCTION_STAGE_LABELS[stage.stage] ?? stage.stage),
    })),
  }));
}

/**
 * Raises an issue.
 *
 * Shared with the machine screen: the operator's **Problem** button lands
 * here, which is why this takes a transaction client. One way for a defect to
 * come into existence, whether it was found at the press or at the checking
 * table.
 */
export async function createIssue(
  tx: Prisma.TransactionClient,
  input: CreateIssueInput,
  raisedBy: string,
): Promise<string> {
  const card = await tx.productionOrder.findUnique({
    where: { id: input.productionOrderId },
    select: { id: true },
  });
  if (!card) throw ApiError.notFound('That job card is not on record');

  if (input.stageId) {
    const stage = await tx.productionStage.findUnique({
      where: { id: input.stageId },
      select: { productionOrderId: true },
    });
    if (!stage) throw ApiError.notFound('That stage is not on record');
    /* A stage from another card would put the issue on a job it never ran. */
    if (stage.productionOrderId !== input.productionOrderId) {
      throw ApiError.badRequest('That stage belongs to a different job card');
    }
  }

  let responsibleName = '';
  if (input.responsibleId) {
    const person = await tx.employee.findUnique({
      where: { id: input.responsibleId },
      select: { name: true },
    });
    if (!person) throw ApiError.notFound('That person is not on record');
    responsibleName = person.name;
  }

  const latest = await tx.qualityIssue.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const row = await tx.qualityIssue.create({
    data: {
      number: (latest?.number ?? 0) + 1,
      productionOrderId: input.productionOrderId,
      stageId: input.stageId,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      rejectedKg: input.rejectedKg,
      raisedBy,
      responsibleId: input.responsibleId,
      responsibleName,
    },
    select: { id: true },
  });
  return row.id;
}

/** Raising one from the office, outside anybody else's transaction. */
export async function raiseIssue(input: CreateIssueInput, raisedBy: string): Promise<QualityIssue> {
  const id = await prisma.$transaction((tx) => createIssue(tx, input, raisedBy));
  return getIssue(id);
}

/**
 * Changes one, and closes it.
 *
 * **Resolving takes a note.** "Resolved" on its own teaches nobody anything,
 * and the same defect comes back in March with nothing on file about what was
 * done in September.
 */
export async function updateIssue(
  id: string,
  input: UpdateIssueInput,
  actor: string,
): Promise<QualityIssue> {
  const existing = await prisma.qualityIssue.findUnique({
    where: { id },
    select: { status: true, resolution: true },
  });
  if (!existing) throw ApiError.notFound('That issue is not on record');

  const status = input.status ?? existing.status;
  if (!canMoveIssueTo(existing.status, status)) {
    throw ApiError.conflict(
      `An issue that is ${ISSUE_STATUS_LABELS[existing.status].toLowerCase()} cannot be moved to ${ISSUE_STATUS_LABELS[status].toLowerCase()}`,
    );
  }

  const closing = status === 'RESOLVED' && existing.status !== 'RESOLVED';
  const resolution = input.resolution ?? existing.resolution;
  if (closing && resolution.trim().length < 3) {
    throw ApiError.badRequest('Say briefly what was done about it');
  }

  let responsibleName: string | undefined;
  if (input.responsibleId) {
    const person = await prisma.employee.findUnique({
      where: { id: input.responsibleId },
      select: { name: true },
    });
    if (!person) throw ApiError.notFound('That person is not on record');
    responsibleName = person.name;
  } else if (input.responsibleId === null) {
    responsibleName = '';
  }

  await prisma.qualityIssue.update({
    where: { id },
    data: {
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
      ...(input.rejectedKg !== undefined ? { rejectedKg: input.rejectedKg } : {}),
      ...(input.responsibleId !== undefined ? { responsibleId: input.responsibleId } : {}),
      ...(responsibleName !== undefined ? { responsibleName } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      status,
      ...(closing ? { resolvedBy: actor, resolvedAt: new Date() } : {}),
      /* Reopened: the stamp goes, or the list shows a closing date on
         something that is open again. */
      ...(status !== 'RESOLVED' && existing.status === 'RESOLVED'
        ? { resolvedBy: '', resolvedAt: null }
        : {}),
    },
  });

  return getIssue(id);
}

/** What one card cannot send. Used by the job card screen. */
export async function rejectedForCard(cardId: string): Promise<number> {
  const rows = await prisma.qualityIssue.findMany({
    where: { productionOrderId: cardId },
    select: { rejectedKg: true },
  });
  return rejectedKgOf(rows.map((row) => ({ rejectedKg: toNumber(row.rejectedKg) })));
}
