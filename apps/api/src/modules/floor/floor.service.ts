import {
  floorAction,
  floorQueueOrder,
  isReachable,
  laminationLabel,
  machineMayRun,
  operatorChoices,
  PRODUCTION_STAGE_LABELS,
  wasteKg,
  wastePercent,
  type FinishFloorJobInput,
  type FloorBoard,
  type FloorBoardQuery,
  type FloorJob,
  type FloorMachine,
  type HoldFloorJobInput,
  type ResumeFloorJobInput,
  type StartFloorJobInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { availabilityForCards } from '../production/material-reservation.js';
import { updateStage } from '../production/production.service.js';
import { createIssue } from '../quality/quality.service.js';

/**
 * **The machine screen.**
 *
 * A different front end for a different person, over behaviour that already
 * exists. Starting and finishing a stage go through `updateStage` — the same
 * call the office screen makes — so the floor gets the material re-check, the
 * card starting itself, the operator snapshot and the hand-off to the next
 * machine without a second copy of any of it. A tablet that started jobs its
 * own way would drift from the job card within a month, and the job card is
 * the document the works is paid against.
 *
 * What is genuinely new is small: **which stages a given machine may pick up**,
 * and **why a machine is standing idle**. Nothing else recorded either.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const today = (): string => new Date().toISOString().slice(0, 10);

/** Cards a machine could still be working on. A finished card is not one. */
const LIVE_CARD: Prisma.ProductionOrderWhereInput = {
  status: { in: ['PLANNED', 'RUNNING', 'ON_HOLD'] },
};

/** Defects still open on a card. They outlive the stoppage that raised them. */
const OPEN_ISSUES = {
  where: { status: { not: 'RESOLVED' as const } },
  select: { id: true, number: true, severity: true, title: true, raisedBy: true, createdAt: true },
  orderBy: { createdAt: 'desc' as const },
  take: 5,
};

const STAGE_SELECT = {
  id: true,
  position: true,
  stage: true,
  pass: true,
  status: true,
  machineId: true,
  machineName: true,
  operatorId: true,
  operator: true,
  inputKg: true,
  outputKg: true,
  startedAt: true,
  productionOrder: {
    select: {
      id: true,
      number: true,
      status: true,
      /* The ORDER behind the card. The materials hang off the quotation the
         order was won from, so this is what the stock side resolves them
         through — not the card's own id, which names nothing on that side. */
      orderId: true,
      customerName: true,
      jobName: true,
      quantityKg: true,
      materialOverrideReason: true,
      order: { select: { number: true, dueDate: true, quantityKg: true } },
      stages: { select: { id: true, position: true, status: true, stage: true } },
      qualityIssues: OPEN_ISSUES,
    },
  },
  floorEvents: {
    select: { id: true, kind: true, note: true, operator: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  },
} as const;

type StageRow = Prisma.ProductionStageGetPayload<{ select: typeof STAGE_SELECT }>;

/** Every machine a tablet can be bolted to, with how much is waiting at it. */
export async function listMachines(): Promise<FloorMachine[]> {
  const machines = await prisma.costingMachine.findMany({
    where: { isActive: true },
    select: { id: true, name: true, kind: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });

  const rows = await prisma.productionStage.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, productionOrder: LIVE_CARD },
    select: STAGE_SELECT,
  });

  return machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    kind: machine.kind,
    waiting: rows.filter(
      (row) =>
        machineMayRun(row, machine) &&
        isReachable(row.productionOrder.stages, {
          id: row.id,
          position: row.position,
          status: row.status,
        }),
    ).length,
  }));
}

function labelFor(row: StageRow, passes: number): string {
  /*
   * A job that laminates twice runs the machine twice, and the operator has to
   * know which pass is in front of them. The plies are not passed: the bond
   * names belong on the job card, and a machine screen wants the shortest true
   * heading it can have.
   */
  if (row.stage === 'LAMINATION' && row.pass > 0) {
    return laminationLabel({ pass: row.pass, totalPasses: passes, plies: [] }).title;
  }
  return PRODUCTION_STAGE_LABELS[row.stage] ?? row.stage;
}

function toJob(row: StageRow, short: string[]): FloorJob {
  const card = row.productionOrder;
  const dueDate = card.order?.dueDate ? isoDate(card.order.dueDate) : null;
  const inputKg = toNumber(row.inputKg);
  const outputKg = toNumber(row.outputKg);

  return {
    stageId: row.id,
    cardId: card.id,
    cardNumber: card.number,
    cardStatus: card.status,

    orderNumber: card.order?.number ?? 0,
    customerName: card.customerName,
    jobName: card.jobName,
    orderQuantityKg: toNumber(card.order?.quantityKg ?? card.quantityKg),
    dueDate,
    isOverdue: Boolean(dueDate && dueDate < today()),

    stage: row.stage,
    pass: row.pass,
    stageLabel: labelFor(row, card.stages.filter((s) => s.stage === 'LAMINATION').length),
    stageStatus: row.status,
    position: row.position,
    stageCount: card.stages.filter((stage) => stage.status !== 'SKIPPED').length,

    machineId: row.machineId,
    machineName: row.machineName,
    operatorId: row.operatorId,
    operator: row.operator,

    inputKg,
    outputKg,
    wasteKg: wasteKg({ inputKg, outputKg }),
    wastePercent: wastePercent({ inputKg, outputKg }),

    startedAt: row.startedAt?.toISOString() ?? null,
    isRunning: row.status === 'RUNNING',
    action: floorAction({ cardStatus: card.status, stageStatus: row.status }),

    events: row.floorEvents.map((event) => ({
      id: event.id,
      kind: event.kind,
      note: event.note,
      operator: event.operator,
      createdAt: event.createdAt.toISOString(),
    })),

    issues: card.qualityIssues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      severity: issue.severity,
      title: issue.title,
      raisedBy: issue.raisedBy,
      createdAt: issue.createdAt.toISOString(),
    })),

    shortOf: short,
    canStartShort: Boolean(card.materialOverrideReason),
  };
}

/**
 * Everything one tablet needs, in one call.
 *
 * One call on purpose: a screen bolted to a press is refreshed by somebody
 * with gloves on, and three requests means three chances to show half a job.
 */
export async function floorBoard(query: FloorBoardQuery): Promise<FloorBoard> {
  const machine = query.machineId
    ? await prisma.costingMachine.findUnique({
        where: { id: query.machineId },
        select: { id: true, name: true, kind: true, isActive: true },
      })
    : null;
  if (query.machineId && !machine) throw ApiError.notFound('That machine is not on record');
  if (!machine) return { machine: null, current: null, waiting: [], operators: [] };

  const rows = await prisma.productionStage.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, productionOrder: LIVE_CARD },
    select: STAGE_SELECT,
  });

  /* This machine's, and only what the reel has actually reached. */
  const mine = rows.filter(
    (row) =>
      machineMayRun(row, machine) &&
      isReachable(row.productionOrder.stages, {
        id: row.id,
        position: row.position,
        status: row.status,
      }),
  );

  /*
   * The card's own material check, so the tablet refuses a job for the same
   * reason and with the same words the office screen would. A card that has
   * been allowed to run short reads short and starts anyway — the allowance is
   * the office's to give, and this screen only reports it.
   */
  const availability = await availabilityForCards(
    prisma,
    [...new Map(mine.map((row) => [row.productionOrder.id, row.productionOrder])).values()].map(
      /*
       * `id` is the CARD's, so the card's own claim is left out of what it is
       * measured against — a card holding its film must not report itself
       * short. `orderId` is the ORDER's, because that is where the priced
       * structure lives. Passing the card's id for both reads as no materials
       * at all, which is silent: the tablet shows a job as fine and the server
       * then refuses it at the moment the operator presses start.
       */
      (card) => ({
        id: card.id,
        orderId: card.orderId,
        quantityKg: toNumber(card.quantityKg),
      }),
    ),
  );

  const jobs = mine
    .map((row) =>
      toJob(
        row,
        (availability.get(row.productionOrder.id) ?? [])
          .filter((line) => line.shortBy > 0)
          .map((line) => line.name),
      ),
    )
    .sort((a, b) =>
      floorQueueOrder(
        { isRunning: a.isRunning, dueDate: a.dueDate, cardNumber: a.cardNumber },
        { isRunning: b.isRunning, dueDate: b.dueDate, cardNumber: b.cardNumber },
      ),
    );

  /*
   * The job in hand is the one already running here. Where nothing is running,
   * the front of the queue stands in — so the screen always has one job on it
   * and the operator never has to choose before they can see anything.
   */
  const current = jobs.find((job) => job.isRunning) ?? jobs[0] ?? null;

  /*
   * The process comes off the role, not the person — the same join the
   * employee screen makes. It is what puts the laminator's own people at the
   * top of the list on the laminator's tablet.
   */
  const people = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      roleName: true,
      isActive: true,
      role: { select: { process: true } },
    },
  });
  const choices = operatorChoices(
    people.map((person) => ({ ...person, process: person.role?.process ?? null })),
    machine.kind,
    null,
  );

  return {
    machine: { id: machine.id, name: machine.name, kind: machine.kind, waiting: jobs.length },
    current,
    waiting: jobs.filter((job) => job.stageId !== current?.stageId),
    operators: [
      ...choices.suggested.map((person) => ({ id: person.id, name: person.name, suggested: true })),
      ...choices.others.map((person) => ({ id: person.id, name: person.name, suggested: false })),
    ],
  };
}

/** The stage, checked to be somewhere this machine may actually act. */
async function stageAt(stageId: string, machineId: string) {
  const machine = await prisma.costingMachine.findUnique({
    where: { id: machineId },
    select: { id: true, kind: true, name: true },
  });
  if (!machine) throw ApiError.notFound('That machine is not on record');

  const row = await prisma.productionStage.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      stage: true,
      machineId: true,
      status: true,
      productionOrderId: true,
      productionOrder: {
        select: { status: true, stages: { select: { id: true, position: true, status: true } } },
      },
      position: true,
    },
  });
  if (!row) throw ApiError.notFound('That job is not on record');
  if (!machineMayRun(row, machine)) {
    throw ApiError.conflict(`That job is not on ${machine.name}`);
  }
  return { row, machine };
}

/**
 * **Start it.**
 *
 * Through `updateStage`, which is what makes this safe: the material re-check
 * happens there, at the moment film goes on a machine, and it refuses a short
 * job unless the office has already allowed it. Binding the stage to this
 * machine is part of the same write — a job started at Laminator 2 says
 * Laminator 2 afterwards, without anybody in the office typing it.
 */
export async function startJob(
  stageId: string,
  machineId: string,
  input: StartFloorJobInput,
): Promise<FloorBoard> {
  const { row, machine } = await stageAt(stageId, machineId);
  if (row.status === 'RUNNING') throw ApiError.conflict('That job is already running');
  if (row.status !== 'PENDING') throw ApiError.conflict('That job has already been done');
  if (row.productionOrder.status === 'ON_HOLD') {
    throw ApiError.conflict('This card is stopped — restart it before starting a job');
  }
  if (!isReachable(row.productionOrder.stages, row)) {
    throw ApiError.conflict('The reel has not reached this machine yet');
  }

  await updateStage(stageId, {
    status: 'RUNNING',
    machineId: machine.id,
    operatorId: input.operatorId,
    ...(input.inputKg > 0 ? { inputKg: input.inputKg } : {}),
  });

  return floorBoard({ machineId });
}

/**
 * **Finish it.**
 *
 * Again through `updateStage`, which hands the reel to the next machine with
 * the weight carried across. The input may be corrected here as well as the
 * output, because a reel is often only weighed properly once it is off.
 */
export async function finishJob(
  stageId: string,
  machineId: string,
  input: FinishFloorJobInput,
): Promise<FloorBoard> {
  const { row } = await stageAt(stageId, machineId);
  if (row.status !== 'RUNNING') throw ApiError.conflict('That job is not running');
  if (row.productionOrder.status === 'ON_HOLD') {
    throw ApiError.conflict('This card is stopped — restart it before finishing');
  }

  await updateStage(stageId, {
    status: 'DONE',
    operatorId: input.operatorId,
    outputKg: input.outputKg,
    ...(input.inputKg !== undefined ? { inputKg: input.inputKg } : {}),
  });

  return floorBoard({ machineId });
}

/**
 * **Stop it, and say why.**
 *
 * Both buttons land here — a pause and a problem stop the job the same way,
 * and the difference is what the log says afterwards. The reason is required,
 * because a machine that stopped for no recorded cause is the gap this screen
 * was built to close.
 *
 * The card goes On hold rather than the stage going backwards. A stage that
 * un-ran would lose the time it had already been running, and the office needs
 * to see a stopped job on the card without being told about it.
 */
export async function holdJob(
  stageId: string,
  machineId: string,
  input: HoldFloorJobInput,
): Promise<FloorBoard> {
  const { row } = await stageAt(stageId, machineId);
  if (row.productionOrder.status === 'ON_HOLD') {
    throw ApiError.conflict('That job is already stopped');
  }

  const person = await prisma.employee.findUnique({
    where: { id: input.operatorId },
    select: { name: true },
  });
  if (!person) throw ApiError.notFound('That person is not on record');

  await prisma.$transaction(async (tx) => {
    await tx.productionOrder.update({
      where: { id: row.productionOrderId },
      data: { status: 'ON_HOLD' },
    });

    if (input.kind === 'ISSUE') {
      /*
       * A defect is not a stoppage. The machine starting again in ten minutes
       * does not make the problem go away, so it is raised as a quality issue
       * — with a severity, an owner and a life — through the same call the
       * office uses. One way for a defect to come into existence.
       */
      await createIssue(
        tx,
        {
          productionOrderId: row.productionOrderId,
          stageId: row.id,
          severity: input.severity,
          title: input.note,
          detail: '',
          rejectedKg: 0,
          responsibleId: input.operatorId,
        },
        person.name,
      );
      return;
    }

    await tx.floorEvent.create({
      data: {
        productionOrderId: row.productionOrderId,
        stageId: row.id,
        kind: 'PAUSED',
        note: input.note,
        operatorId: input.operatorId,
        operator: person.name,
      },
    });
  }, TX);

  return floorBoard({ machineId });
}

/**
 * Start it again.
 *
 * Back to running, and the restart is logged beside the stoppage so a shift
 * reads as what happened rather than as a status that changed twice.
 */
export async function resumeJob(
  stageId: string,
  machineId: string,
  input: ResumeFloorJobInput,
): Promise<FloorBoard> {
  const { row } = await stageAt(stageId, machineId);
  if (row.productionOrder.status !== 'ON_HOLD') {
    throw ApiError.conflict('That job is not stopped');
  }

  const person = await prisma.employee.findUnique({
    where: { id: input.operatorId },
    select: { name: true },
  });
  if (!person) throw ApiError.notFound('That person is not on record');

  await prisma.$transaction(async (tx) => {
    await tx.productionOrder.update({
      where: { id: row.productionOrderId },
      /*
       * Running, not planned. Something has been on this card — that is why it
       * could be stopped — and sending it back to planned would lose the fact
       * that the floor has already had it.
       */
      data: { status: 'RUNNING' },
    });
    await tx.floorEvent.create({
      data: {
        productionOrderId: row.productionOrderId,
        stageId: row.id,
        kind: 'RESUMED',
        note: input.note,
        operatorId: input.operatorId,
        operator: person.name,
      },
    });
  }, TX);

  return floorBoard({ machineId });
}
