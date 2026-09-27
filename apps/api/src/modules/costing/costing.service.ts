import { liveOn } from '@yuva/shared';
import type {
  CostingMasterData,
  CostingOverhead,
  CostingOverheadInput,
  UpdateCostingOverheadInput,
  Labour,
  LabourInput,
  Machine,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Costing master data.
 *
 * The machines on the floor and the wages paid to run them. A rate is built by
 * turning kilograms into running metres, metres into minutes at each machine's
 * speed, and minutes into rupees — so these rows are what every quoted rate
 * ultimately rests on.
 *
 * Nothing here computes anything. The arithmetic lives in `@yuva/shared` so the
 * wizard, the API and the PDF cannot disagree about a price.
 */

const toNumber = (value: Prisma.Decimal | number): number => Number(value);

const toMachine = (row: Prisma.CostingMachineGetPayload<Record<string, never>>): Machine => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  horsepower: toNumber(row.horsepower),
  stationHorsepower: toNumber(row.stationHorsepower),
  stationColourSteps: row.stationColourSteps,
  powerRatePerHpHour: toNumber(row.powerRatePerHpHour),
  speedMPerMin: toNumber(row.speedMPerMin),
  setupMinutes: row.setupMinutes,
  setupPowerFactor: toNumber(row.setupPowerFactor),
  isActive: row.isActive,
  sortOrder: row.sortOrder,
  isDefault: row.isDefault,
});

const toLabour = (row: Prisma.CostingLabourGetPayload<Record<string, never>>): Labour => ({
  id: row.id,
  role: row.role,
  process: row.process,
  monthlySalary: toNumber(row.monthlySalary),
  effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
  effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
  /* Derived, never stored — see the type. A row is live while its window has
     not been closed. */
  isActive: row.effectiveTo === null,
  sortOrder: row.sortOrder,
});

const toOverhead = (
  row: Prisma.CostingOverheadGetPayload<Record<string, never>>,
): CostingOverhead => ({
  id: row.id,
  name: row.name,
  basis: row.basis,
  amount: toNumber(row.amount),
  effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
  effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
  sortOrder: row.sortOrder,
});

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/** Midnight UTC for a yyyy-mm-dd, which is how a `@db.Date` column compares. */
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Today, as the works' own calendar day rather than as an instant. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The overheads live on a given day.
 *
 * **On or after `effectiveFrom`, and strictly before `effectiveTo`.** The
 * half-open window is what makes closing one row and opening another on the
 * same day mean "the new figure applies from today" rather than "both apply".
 *
 * This is the whole reason the works can add an overhead without disturbing
 * anything: a quotation is costed on its own date, and a row that starts today
 * is simply not in the list for a document written in 2022.
 */
export async function overheadsAsAt(onDate?: string): Promise<CostingOverhead[]> {
  const on = onDate ?? today();
  const rows = await prisma.costingOverhead.findMany({
    where: {
      effectiveFrom: { lte: asDate(on) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asDate(on) } }],
    },
    orderBy: ORDER,
  });

  /*
   * Narrowed in SQL, decided in `liveOn`.
   *
   * The two say the same thing, and the point of saying it twice is that only
   * one of them can be tested without a database — so that one has the tests
   * and the last word. A `@db.Date` read back through a timezone is exactly
   * the sort of thing that would shift a boundary by a day, and this compares
   * the ISO strings the API actually returns.
   */
  return liveOn(rows.map(toOverhead), on);
}

/** Every row ever, newest window first — what "show ended" shows. */
export async function allOverheads(): Promise<CostingOverhead[]> {
  const rows = await prisma.costingOverhead.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { effectiveFrom: 'desc' }],
  });
  return rows.map(toOverhead);
}

/**
 * The wages in force on a given day.
 *
 * The same shape as `overheadsAsAt`, and for the same reason: a quotation is
 * costed against the master as it stood on ITS date, so taking on a lamination
 * crew today cannot reach back and re-price what went out last year.
 */
export async function labourAsAt(onDate?: string): Promise<Labour[]> {
  const on = onDate ?? today();
  const rows = await prisma.costingLabour.findMany({
    where: {
      effectiveFrom: { lte: asDate(on) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asDate(on) } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }],
  });

  /* Narrowed in SQL, decided in `liveOn` — the one with the tests, and the one
     that compares ISO strings so no timezone can shift a boundary by a day. */
  return liveOn(rows.map(toLabour), on);
}

/** Every window ever, newest first — what "show retired" shows. */
export async function allLabour(): Promise<Labour[]> {
  const rows = await prisma.costingLabour.findMany({
    orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }, { effectiveFrom: 'desc' }],
  });
  return rows.map(toLabour);
}

/** Every list at once: costing a rate needs all of it, and it is small. */
export async function getMasterData(
  includeRetired = false,
  onDate?: string,
): Promise<CostingMasterData> {
  const where = includeRetired ? {} : { isActive: true };
  const [machines, labour, overheads] = await Promise.all([
    prisma.costingMachine.findMany({ where, orderBy: ORDER }),
    /* Wages are dated now, so they are read the way the overheads are: as at
       the quotation's own date, not as at whatever a switch says today. */
    includeRetired ? allLabour() : labourAsAt(onDate),
    includeRetired ? allOverheads() : overheadsAsAt(onDate),
  ]);
  return { machines: machines.map(toMachine), labour, overheads };
}

/**
 * Adds an overhead, live from today.
 *
 * Not from the beginning of time, which would reach back and change the price
 * of every quotation anybody reprices. A works that genuinely wants an older
 * start date is asking to move documents that have already gone out, and that
 * is a different conversation from adding a charge.
 */
export async function createOverhead(input: CostingOverheadInput): Promise<CostingOverhead> {
  return toOverhead(
    await prisma.costingOverhead.create({
      data: { ...input, effectiveFrom: asDate(today()) },
    }),
  );
}

/**
 * Changes one, keeping what it used to be.
 *
 * A name is not priced, so it is corrected in place — the row that charged
 * Rs 500 charged Rs 500 whatever it was called. **The amount and the basis
 * are**, so changing either ends this row today and opens a new one from
 * today: a quotation written last month must go on repricing at the figure it
 * was written under.
 *
 * Unless the row started today, in which case it has priced nothing yet and
 * editing it in place leaves no dead window behind.
 */
export async function updateOverhead(
  id: string,
  input: UpdateCostingOverheadInput,
): Promise<CostingOverhead> {
  const existing = await prisma.costingOverhead.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That overhead is not on record');
  if (existing.effectiveTo) throw ApiError.conflict('That overhead has already been ended');

  const now = today();
  const priced =
    (input.amount !== undefined && toNumber(existing.amount) !== input.amount) ||
    (input.basis !== undefined && existing.basis !== input.basis);

  if (!priced || existing.effectiveFrom.toISOString().slice(0, 10) === now) {
    return toOverhead(await prisma.costingOverhead.update({ where: { id }, data: input }));
  }

  return prisma.$transaction(async (tx) => {
    await tx.costingOverhead.update({
      where: { id },
      data: { effectiveTo: asDate(now) },
    });
    return toOverhead(
      await tx.costingOverhead.create({
        data: {
          name: input.name ?? existing.name,
          basis: input.basis ?? existing.basis,
          amount: input.amount ?? toNumber(existing.amount),
          sortOrder: input.sortOrder ?? existing.sortOrder,
          effectiveFrom: asDate(now),
        },
      }),
    );
  }, TX);
}

/**
 * Ends an overhead from today, rather than deleting it.
 *
 * Same rule as a retired machine: the quotations it priced have to stay
 * explicable, and repricing one of them must still pick it up. It simply stops
 * applying to anything written from today.
 */
export async function endOverhead(id: string): Promise<CostingOverhead> {
  const existing = await prisma.costingOverhead.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That overhead is not on record');
  if (existing.effectiveTo) return toOverhead(existing);

  return toOverhead(
    await prisma.costingOverhead.update({
      where: { id },
      data: { effectiveTo: asDate(today()) },
    }),
  );
}

/**
 * Marks one machine as the one its kind is costed on, and unmarks the rest.
 *
 * **At most one per kind**, kept here rather than by a database constraint,
 * because "at most one row of this kind has a flag" is not something a unique
 * index can say without a partial index per kind. The rule is one line and it
 * is enforced on the one path that can break it.
 *
 * Passing false simply clears it, and the costing goes back to taking whichever
 * machine of that kind comes first.
 */
export async function setDefaultMachine(id: string, isDefault: boolean): Promise<Machine> {
  const existing = await prisma.costingMachine.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That machine is not on record');

  return prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.costingMachine.updateMany({
        where: { kind: existing.kind, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return toMachine(await tx.costingMachine.update({ where: { id }, data: { isDefault } }));
  }, TX);
}

/** A name already in use, told apart from anything else that could fail. */
function nameTaken(error: unknown, what: string): never {
  if ((error as { code?: string }).code === 'P2002') {
    throw ApiError.conflict(`There is already a ${what} with that name`);
  }
  throw error;
}

/**
 * A name that belongs to a RETIRED row brings that row back.
 *
 * Retiring keeps the row so quotations costed against it can still say what
 * they were priced on — but the name stays taken, and the row is off the screen
 * unless "Show retired" is on. Adding it again therefore failed with "there is
 * already a machine with that name" against a machine nobody could see.
 *
 * Reviving is what was actually asked for, and it is better than a second row:
 * the id survives, so everything already pointing at it still does. The figures
 * typed now win — they are the current answer to the same question.
 */
async function revive<T extends { id: string; isActive: boolean }>(
  existing: T | null,
): Promise<string | null> {
  return existing && !existing.isActive ? existing.id : null;
}

export async function createMachine(input: MachineInput): Promise<Machine> {
  const retiredId = await revive(
    await prisma.costingMachine.findUnique({ where: { name: input.name } }),
  );
  if (retiredId) {
    return toMachine(
      await prisma.costingMachine.update({
        where: { id: retiredId },
        data: { ...input, isActive: true },
      }),
    );
  }

  try {
    return toMachine(await prisma.costingMachine.create({ data: input }));
  } catch (error) {
    nameTaken(error, 'machine');
  }
}

export async function updateMachine(id: string, input: UpdateMachineInput): Promise<Machine> {
  const existing = await prisma.costingMachine.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That machine is not on record');
  try {
    return toMachine(await prisma.costingMachine.update({ where: { id }, data: input }));
  } catch (error) {
    nameTaken(error, 'machine');
  }
}

/**
 * Retires a machine rather than deleting it.
 *
 * Quotations were costed against its speed and its load. Removing the row
 * would leave those unable to say what they were priced on, which is the same
 * rule retired materials follow.
 */
export async function retireMachine(id: string): Promise<Machine> {
  const existing = await prisma.costingMachine.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That machine is not on record');
  return toMachine(
    await prisma.costingMachine.update({ where: { id }, data: { isActive: !existing.isActive } }),
  );
}

/**
 * Adds a role, live from today.
 *
 * Not from the beginning of time, which would reach back and change the price
 * of every quotation anybody reprices — the same rule the works' own overheads
 * follow, and the rule whose absence here re-priced seven 2022 documents the
 * moment the lamination crew was switched back on.
 *
 * A role whose window was closed **without ever pricing anything** is brought
 * back rather than duplicated: an empty window is not history, it is a row that
 * never applied, and the id surviving means everything already pointing at it —
 * the employees paid as that role — still does.
 */
export async function createLabour(input: LabourInput): Promise<Labour> {
  const now = today();

  /*
   * The role name is no longer unique in the database: two windows of one job
   * is the whole point. So the check that used to be an index lives here, where
   * it can say something useful instead of raising a constraint error.
   */
  const live = await prisma.costingLabour.findFirst({
    where: { role: input.role, effectiveTo: null },
    select: { id: true },
  });
  if (live) throw ApiError.conflict('There is already a role with that name');

  const empty = await prisma.costingLabour.findFirst({
    where: { role: input.role, effectiveTo: { not: null } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (empty?.effectiveTo && empty.effectiveFrom.getTime() === empty.effectiveTo.getTime()) {
    return toLabour(
      await prisma.costingLabour.update({
        where: { id: empty.id },
        data: { ...input, effectiveFrom: asDate(now), effectiveTo: null },
      }),
    );
  }

  return toLabour(
    await prisma.costingLabour.create({ data: { ...input, effectiveFrom: asDate(now) } }),
  );
}

/**
 * Changes a role, keeping what it used to pay.
 *
 * A name is not priced, so it is corrected in place — the row that paid
 * Rs 18,000 paid Rs 18,000 whatever the job was called. **The salary and the
 * process are**, so changing either ends this window today and opens a new one
 * from today: a quotation written last month must go on repricing at the crew
 * it was written under.
 *
 * Unless the window opened today, in which case it has priced nothing yet and
 * editing it in place leaves no dead window behind.
 */
export async function updateLabour(id: string, input: UpdateLabourInput): Promise<Labour> {
  const existing = await prisma.costingLabour.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That role is not on record');
  if (existing.effectiveTo) throw ApiError.conflict('That role has already been retired');

  const now = today();
  const priced =
    (input.monthlySalary !== undefined &&
      toNumber(existing.monthlySalary) !== input.monthlySalary) ||
    (input.process !== undefined && existing.process !== input.process);

  if (!priced || existing.effectiveFrom.toISOString().slice(0, 10) === now) {
    return toLabour(await prisma.costingLabour.update({ where: { id }, data: input }));
  }

  return prisma.$transaction(async (tx) => {
    await tx.costingLabour.update({ where: { id }, data: { effectiveTo: asDate(now) } });
    return toLabour(
      await tx.costingLabour.create({
        data: {
          role: input.role ?? existing.role,
          process: input.process ?? existing.process,
          monthlySalary: input.monthlySalary ?? toNumber(existing.monthlySalary),
          sortOrder: input.sortOrder ?? existing.sortOrder,
          effectiveFrom: asDate(now),
        },
      }),
    );
  }, TX);
}

/**
 * Ends a role today, or takes one back on from today.
 *
 * One control, because the screen has one switch — but the two directions are
 * not symmetrical, and that asymmetry is the whole feature. Ending closes the
 * window, and every quotation already written goes on being costed with the
 * crew it was written under. Taking the role back on opens a **new** window
 * from today, so it applies to what the works quotes from now and to nothing
 * that has already gone out.
 */
export async function retireLabour(id: string): Promise<Labour> {
  const existing = await prisma.costingLabour.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That role is not on record');

  const now = today();

  if (!existing.effectiveTo) {
    return toLabour(
      await prisma.costingLabour.update({ where: { id }, data: { effectiveTo: asDate(now) } }),
    );
  }

  /* An empty window priced nothing, so there is no history to keep and the row
     itself comes back — see createLabour. */
  if (existing.effectiveFrom.getTime() === existing.effectiveTo.getTime()) {
    return toLabour(
      await prisma.costingLabour.update({
        where: { id },
        data: { effectiveFrom: asDate(now), effectiveTo: null },
      }),
    );
  }

  return toLabour(
    await prisma.costingLabour.create({
      data: {
        role: existing.role,
        process: existing.process,
        monthlySalary: toNumber(existing.monthlySalary),
        sortOrder: existing.sortOrder,
        effectiveFrom: asDate(now),
      },
    }),
  );
}
