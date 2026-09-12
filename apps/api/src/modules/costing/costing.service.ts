import type {
  CostingMasterData,
  Labour,
  LabourInput,
  Machine,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
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
});

const toLabour = (row: Prisma.CostingLabourGetPayload<Record<string, never>>): Labour => ({
  id: row.id,
  role: row.role,
  process: row.process,
  monthlySalary: toNumber(row.monthlySalary),
  isActive: row.isActive,
  sortOrder: row.sortOrder,
});

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/** Both lists at once: costing a rate needs all of it, and it is small. */
export async function getMasterData(includeRetired = false): Promise<CostingMasterData> {
  const where = includeRetired ? {} : { isActive: true };
  const [machines, labour] = await Promise.all([
    prisma.costingMachine.findMany({ where, orderBy: ORDER }),
    prisma.costingLabour.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }],
    }),
  ]);
  return { machines: machines.map(toMachine), labour: labour.map(toLabour) };
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

export async function createLabour(input: LabourInput): Promise<Labour> {
  /* A retired role of the same name comes back — see `revive`. */
  const retiredId = await revive(
    await prisma.costingLabour.findUnique({ where: { role: input.role } }),
  );
  if (retiredId) {
    return toLabour(
      await prisma.costingLabour.update({
        where: { id: retiredId },
        data: { ...input, isActive: true },
      }),
    );
  }

  try {
    return toLabour(await prisma.costingLabour.create({ data: input }));
  } catch (error) {
    nameTaken(error, 'role');
  }
}

export async function updateLabour(id: string, input: UpdateLabourInput): Promise<Labour> {
  const existing = await prisma.costingLabour.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That role is not on record');
  try {
    return toLabour(await prisma.costingLabour.update({ where: { id }, data: input }));
  } catch (error) {
    nameTaken(error, 'role');
  }
}

export async function retireLabour(id: string): Promise<Labour> {
  const existing = await prisma.costingLabour.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('That role is not on record');
  return toLabour(
    await prisma.costingLabour.update({ where: { id }, data: { isActive: !existing.isActive } }),
  );
}
