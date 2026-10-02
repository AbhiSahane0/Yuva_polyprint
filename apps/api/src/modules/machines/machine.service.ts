import {
  dayTotals,
  downFor,
  laminationLabel,
  machineOrder,
  machineState,
  PRODUCTION_STAGE_LABELS,
  standingMinutes,
  type EndMaintenanceInput,
  type MachineBoard,
  type MachineBoardQuery,
  type MachineCard,
  type MaintenanceRecord,
  type StandEvent,
  type StartMaintenanceInput,
  type MachineOutput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * **Machines & maintenance.**
 *
 * One stored fact and a screen full of worked-out ones.
 *
 * The stored fact is a machine being down, and it has no status field: a
 * maintenance record with no end **is** the machine being down. A flag
 * somebody has to remember to clear is a flag that is wrong, and the press
 * would read "under maintenance" for a fortnight after it came back.
 *
 * Everything else already existed and is only being read from a different
 * angle. What is on a machine is the stage running on it. Who is on it is that
 * stage's operator. Today's output and waste are the stages that finished on
 * it today. **Downtime is the pauses and problems the machine screen has been
 * recording all along** — which is why that screen insisted on a reason for
 * every stoppage, and what those reasons were being kept for.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);

/** Midnight this morning, which is what "today" means on a factory floor. */
function startOfToday(): Date {
  const at = new Date();
  at.setHours(0, 0, 0, 0);
  return at;
}

function toRecord(
  row: Prisma.MaintenanceRecordGetPayload<{ include: { machine: { select: { name: true } } } }>,
  now: string,
): MaintenanceRecord {
  const startedAt = row.startedAt.toISOString();
  const endedAt = row.endedAt?.toISOString() ?? null;
  return {
    id: row.id,
    number: row.number,
    machineId: row.machineId,
    machineName: row.machine.name,
    kind: row.kind,
    reason: row.reason,
    startedAt,
    endedAt,
    minutes: downFor({ startedAt, endedAt }, now),
    workDone: row.workDone,
    reportedBy: row.reportedBy,
    closedBy: row.closedBy,
  };
}

const WITH_MACHINE = { machine: { select: { name: true } } } as const;

function stageLabel(stage: { stage: string; pass: number }): string {
  if (stage.stage === 'LAMINATION' && stage.pass > 0) {
    return laminationLabel({ pass: stage.pass, totalPasses: 2, plies: [] }).title;
  }
  return (
    PRODUCTION_STAGE_LABELS[stage.stage as keyof typeof PRODUCTION_STAGE_LABELS] ?? stage.stage
  );
}

/**
 * Which machines are down right now.
 *
 * Exported because the **machine screen** and **Planning** both need it, and
 * both should get the answer from the one query that defines it rather than
 * each deciding for itself what "down" means.
 */
export async function openMaintenance(
  tx: Prisma.TransactionClient,
  machineIds?: string[],
): Promise<Map<string, MaintenanceRecord>> {
  const rows = await tx.maintenanceRecord.findMany({
    where: { endedAt: null, ...(machineIds ? { machineId: { in: machineIds } } : {}) },
    include: WITH_MACHINE,
  });
  const now = new Date().toISOString();
  return new Map(rows.map((row) => [row.machineId, toRecord(row, now)]));
}

export async function machineBoard(query: MachineBoardQuery): Promise<MachineBoard> {
  const since = startOfToday();
  const historyFrom = new Date(since);
  historyFrom.setDate(historyFrom.getDate() - (query.days - 1));

  const [machines, running, finishedToday, down, history, booked] = await Promise.all([
    prisma.costingMachine.findMany({
      select: { id: true, name: true, kind: true, isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    }),
    /* What is on each machine now. */
    prisma.productionStage.findMany({
      where: { status: 'RUNNING', machineId: { not: null } },
      select: {
        id: true,
        stage: true,
        pass: true,
        machineId: true,
        operator: true,
        startedAt: true,
        productionOrder: {
          select: {
            id: true,
            number: true,
            customerName: true,
            jobName: true,
            order: { select: { number: true } },
          },
        },
      },
    }),
    /* What each got through today. */
    prisma.productionStage.findMany({
      where: { status: 'DONE', machineId: { not: null }, finishedAt: { gte: since } },
      select: { machineId: true, inputKg: true, outputKg: true },
    }),
    openMaintenance(prisma),
    prisma.maintenanceRecord.findMany({
      where: { startedAt: { gte: historyFrom } },
      include: WITH_MACHINE,
      orderBy: { startedAt: 'desc' },
      take: 50,
    }),
    prisma.order.groupBy({
      by: ['plannedMachineId'],
      where: {
        plannedMachineId: { not: null },
        status: { in: ['CONFIRMED', 'IN_PRODUCTION'] },
      },
      _count: { _all: true },
    }),
  ]);

  /*
   * **Every stoppage the floor has recorded today**, whichever button raised
   * it. A pause and a problem both leave a machine standing, and a downtime
   * figure that left out the defects would flatter the works exactly where it
   * should not.
   *
   * Keyed to the machine through the stage the stoppage happened on.
   */
  const [pauses, problems] = await Promise.all([
    prisma.floorEvent.findMany({
      where: { createdAt: { gte: since }, stage: { machineId: { not: null } } },
      select: { kind: true, createdAt: true, stage: { select: { machineId: true } } },
    }),
    prisma.qualityIssue.findMany({
      where: { createdAt: { gte: since }, stage: { machineId: { not: null } } },
      select: { createdAt: true, stage: { select: { machineId: true } } },
    }),
  ]);

  const standing = new Map<string, StandEvent[]>();
  const push = (machineId: string | null | undefined, event: StandEvent) => {
    if (!machineId) return;
    standing.set(machineId, [...(standing.get(machineId) ?? []), event]);
  };
  for (const row of pauses) {
    push(row.stage?.machineId, {
      at: row.createdAt.toISOString(),
      kind: row.kind === 'RESUMED' ? 'START' : 'STOP',
    });
  }
  /* A problem stops the machine as surely as a pause does. */
  for (const row of problems) {
    push(row.stage?.machineId, { at: row.createdAt.toISOString(), kind: 'STOP' });
  }
  /* And so does the fitter. */
  for (const [machineId, record] of down) {
    push(machineId, { at: record.startedAt, kind: 'STOP' });
  }
  for (const row of history) {
    if (!row.endedAt || row.endedAt < since) continue;
    push(row.machineId, { at: row.startedAt.toISOString(), kind: 'STOP' });
    push(row.machineId, { at: row.endedAt.toISOString(), kind: 'START' });
  }

  const now = new Date().toISOString();
  const bookedBy = new Map(booked.map((row) => [row.plannedMachineId!, row._count._all]));

  const cards = machines
    .map((machine, index) => {
      const job = running.find((stage) => stage.machineId === machine.id) ?? null;
      const totals = dayTotals(
        finishedToday
          .filter((stage) => stage.machineId === machine.id)
          .map((stage) => ({
            inputKg: toNumber(stage.inputKg),
            outputKg: toNumber(stage.outputKg),
          })),
      );

      return {
        id: machine.id,
        name: machine.name,
        kind: machine.kind,
        position: index,
        state: machineState({ isDown: down.has(machine.id), hasRunningJob: Boolean(job) }),

        job: job
          ? {
              stageId: job.id,
              cardId: job.productionOrder.id,
              cardNumber: job.productionOrder.number,
              orderNumber: job.productionOrder.order?.number ?? 0,
              customerName: job.productionOrder.customerName,
              jobName: job.productionOrder.jobName,
              stageLabel: stageLabel(job),
              operator: job.operator,
              startedAt: job.startedAt?.toISOString() ?? null,
            }
          : null,

        outputKg: totals.outputKg,
        wasteKg: totals.wasteKg,
        wastePercent: totals.wastePercent,
        runs: totals.runs,
        standingMinutes: standingMinutes(standing.get(machine.id) ?? [], now),

        down: down.get(machine.id) ?? null,
        booked: bookedBy.get(machine.id) ?? 0,
        isActive: machine.isActive,
      } satisfies MachineCard;
    })
    .sort(machineOrder);

  return {
    machines: cards,
    totals: {
      running: cards.filter((card) => card.state === 'RUNNING').length,
      idle: cards.filter((card) => card.state === 'IDLE').length,
      down: cards.filter((card) => card.state === 'DOWN').length,
      outputKg: Math.round(cards.reduce((sum, card) => sum + card.outputKg, 0) * 1000) / 1000,
      standingMinutes: cards.reduce((sum, card) => sum + card.standingMinutes, 0),
    },
    history: history.map((row) => toRecord(row, now)),
  };
}

/**
 * **Puts a machine down.**
 *
 * Refuses a second open record on the same machine, because two would make
 * "how long has it been down" unanswerable — and the answer is the reason the
 * record exists.
 *
 * It does **not** refuse a machine with a job running on it. A press does not
 * break down politely between stages, and a system that insists the stage be
 * finished first is one the fitter works around. The job stays where it is and
 * the machine reads Down, which is the truth.
 */
export async function startMaintenance(
  input: StartMaintenanceInput,
  actor: string,
): Promise<MaintenanceRecord> {
  const machine = await prisma.costingMachine.findUnique({
    where: { id: input.machineId },
    select: { id: true, name: true },
  });
  if (!machine) throw ApiError.notFound('That machine is not on record');

  const already = await prisma.maintenanceRecord.findFirst({
    where: { machineId: input.machineId, endedAt: null },
    select: { number: true },
  });
  if (already) {
    throw ApiError.conflict(`${machine.name} is already down — see record ${already.number}`);
  }

  const latest = await prisma.maintenanceRecord.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const row = await prisma.maintenanceRecord.create({
    data: {
      number: (latest?.number ?? 0) + 1,
      machineId: input.machineId,
      kind: input.kind,
      reason: input.reason,
      startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
      reportedBy: actor,
    },
    include: WITH_MACHINE,
  });
  return toRecord(row, new Date().toISOString());
}

/** Brings it back. */
export async function endMaintenance(
  id: string,
  input: EndMaintenanceInput,
  actor: string,
): Promise<MaintenanceRecord> {
  const existing = await prisma.maintenanceRecord.findUnique({
    where: { id },
    select: { endedAt: true, startedAt: true },
  });
  if (!existing) throw ApiError.notFound('That record is not on record');
  if (existing.endedAt) throw ApiError.conflict('That machine is already back');

  const endedAt = input.endedAt ? new Date(input.endedAt) : new Date();
  /* A spell that ends before it started would read as negative downtime. */
  if (endedAt < existing.startedAt) {
    throw ApiError.badRequest('It cannot have come back before it went down');
  }

  const row = await prisma.maintenanceRecord.update({
    where: { id },
    data: { endedAt, workDone: input.workDone, closedBy: actor },
    include: WITH_MACHINE,
  });
  return toRecord(row, new Date().toISOString());
}

/** One machine's whole history, for the drawer on its card. */
export async function machineHistory(machineId: string): Promise<MaintenanceRecord[]> {
  const rows = await prisma.maintenanceRecord.findMany({
    where: { machineId },
    include: WITH_MACHINE,
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  const now = new Date().toISOString();
  return rows.map((row) => toRecord(row, now));
}

/**
 * What each machine got through over a window of days.
 *
 * The board above is today's figures, which is what the floor wants. An owner
 * wants the fortnight: today tells you nothing about whether a press is earning
 * its keep, because today might be a make-ready day.
 *
 * Here rather than in the overview because it is a fact about machines, and the
 * day the Machines screen wants a fortnight column it should read the same
 * figures rather than work out its own.
 */
export async function machineOutput(days: number): Promise<MachineOutput[]> {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const [machines, stages, open] = await Promise.all([
    prisma.costingMachine.findMany({
      where: { isActive: true },
      select: { id: true, name: true, kind: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    }),
    /* Finished runs only. A stage still on the machine has produced nothing
       that can be counted, whatever its input says. */
    prisma.productionStage.findMany({
      where: { status: 'DONE', finishedAt: { gte: from }, machineId: { not: null } },
      select: { machineId: true, inputKg: true, outputKg: true },
    }),
    prisma.maintenanceRecord.findMany({
      where: { endedAt: null },
      select: { machineId: true },
    }),
  ]);

  const down = new Set(open.map((row) => row.machineId));
  const totals = new Map<string, { input: number; output: number; runs: number }>();
  for (const stage of stages) {
    if (!stage.machineId) continue;
    const at = totals.get(stage.machineId) ?? { input: 0, output: 0, runs: 0 };
    at.input += Number(stage.inputKg);
    at.output += Number(stage.outputKg);
    at.runs += 1;
    totals.set(stage.machineId, at);
  }

  return machines.map((machine) => {
    const at = totals.get(machine.id) ?? { input: 0, output: 0, runs: 0 };
    const waste = at.input - at.output;
    return {
      id: machine.id,
      name: machine.name,
      kind: machine.kind,
      outputKg: Math.round(at.output * 1000) / 1000,
      wasteKg: Math.round(waste * 1000) / 1000,
      wastePercent: at.input > 0 ? Math.round((waste / at.input) * 10000) / 100 : 0,
      runs: at.runs,
      isDown: down.has(machine.id),
    };
  });
}
