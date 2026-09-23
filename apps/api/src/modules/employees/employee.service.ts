import type {
  Employee,
  EmployeeActivity,
  EmployeeInput,
  EmployeeList,
  EmployeeOnFloor,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * The works' own people.
 *
 * Two things are worth saying about what this module does NOT do, because both
 * were deliberate.
 *
 * **It holds no wage.** That lives on the costing role an employee points at,
 * on the Costing screen, dated — so a rise is typed once rather than onto forty
 * records, and what a printing operator costs has exactly one answer.
 *
 * **It stores nothing about what anybody is doing.** Working, which machine,
 * which card, which order: all four come from the one job card stage that is
 * RUNNING with their name on it, worked out on the way out. A status somebody
 * has to remember to change is wrong most of the time, which is why this system
 * derives a card's progress and an order's lateness too.
 */

const WITH_ROLE = { role: { select: { role: true, process: true } } } as const;
type Row = Prisma.EmployeeGetPayload<{ include: typeof WITH_ROLE }>;

function toEmployee(row: Row): Employee {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    roleId: row.roleId,
    /* The role's own name wins where there is one, so renaming a role on the
       Costing screen renames it here too rather than leaving a stale copy. */
    roleName: row.role?.role ?? row.roleName,
    process: row.role?.process ?? null,
    shift: row.shift,
    phone: row.phone,
    joinedOn: row.joinedOn ? row.joinedOn.toISOString().slice(0, 10) : null,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The live half of a row — the part that is worked out, never stored. */
type LiveWork = Pick<
  EmployeeOnFloor,
  | 'currentMachine'
  | 'currentStage'
  | 'currentCardId'
  | 'currentCardNumber'
  | 'currentOrderNumber'
  | 'currentJobName'
>;

/** Nobody on a machine. What almost everybody is, almost all the time. */
const IDLE: LiveWork = {
  currentMachine: '',
  currentStage: null,
  currentCardId: null,
  currentCardNumber: null,
  currentOrderNumber: null,
  currentJobName: '',
};

/**
 * What each of these people is doing right now.
 *
 * One query for the whole list rather than one per person: a running stage
 * names its operator, so asking the stages once and turning them inside out is
 * the same answer for forty employees as for one.
 *
 * A person on two running stages at once is possible and is not an error —
 * somebody sets a laminator going and walks to the slitter. The first by
 * position wins the row, which is the job card's own order of work.
 */
async function whatTheyAreOn(employeeIds: string[]): Promise<Map<string, LiveWork>> {
  const out = new Map<string, LiveWork>();
  if (employeeIds.length === 0) return out;

  const running = await prisma.productionStage.findMany({
    where: { status: 'RUNNING', operatorId: { in: employeeIds } },
    orderBy: { position: 'asc' },
    select: {
      operatorId: true,
      stage: true,
      machineName: true,
      productionOrder: {
        select: { id: true, number: true, jobName: true, order: { select: { number: true } } },
      },
    },
  });

  for (const stage of running) {
    if (!stage.operatorId || out.has(stage.operatorId)) continue;
    out.set(stage.operatorId, {
      currentMachine: stage.machineName,
      currentStage: stage.stage,
      currentCardId: stage.productionOrder.id,
      currentCardNumber: stage.productionOrder.number,
      currentOrderNumber: stage.productionOrder.order.number,
      currentJobName: stage.productionOrder.jobName,
    });
  }

  return out;
}

const activityOf = (employee: Employee, working: boolean): EmployeeActivity => {
  if (!employee.isActive) return 'LEFT';
  return working ? 'WORKING' : 'AVAILABLE';
};

export async function listEmployees(query: ListEmployeesQuery): Promise<EmployeeList> {
  const where: Prisma.EmployeeWhereInput = {
    /* People who have left are out by default and never gone: an old job card
       names them, and a list that hides them cannot explain it. */
    ...(query.includeLeft ? {} : { isActive: true }),
    ...(query.shift ? { shift: query.shift } : {}),
    ...(query.process ? { role: { process: query.process } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { roleName: { contains: query.search, mode: 'insensitive' } },
            { role: { role: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.employee.findMany({
    where,
    include: WITH_ROLE,
    /* Still here first, then by name. The works reads this as a list of who is
       about, not as a filing cabinet. */
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  const live = await whatTheyAreOn(rows.map((row) => row.id));

  const items: EmployeeOnFloor[] = rows.map((row) => {
    const employee = toEmployee(row);
    const on = live.get(row.id);
    return {
      ...employee,
      ...(on ?? IDLE),
      activity: activityOf(employee, Boolean(on)),
    };
  });

  /*
   * Counted over everyone the filters matched, which is the only way the four
   * figures agree with the list under them.
   */
  const totals = {
    onBooks: items.filter((item) => item.isActive).length,
    working: items.filter((item) => item.activity === 'WORKING').length,
    available: items.filter((item) => item.activity === 'AVAILABLE').length,
    operators: items.filter((item) => item.isActive && item.process !== null).length,
  };

  return {
    items: query.workingOnly ? items.filter((i) => i.activity === 'WORKING') : items,
    totals,
  };
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const row = await prisma.employee.findUnique({ where: { id }, include: WITH_ROLE });
  if (!row) throw ApiError.notFound('That person is not on record');
  return toEmployee(row);
}

/**
 * The role's own name, copied down as a fallback.
 *
 * Stored as well as linked so a person is still described if their role is ever
 * retired, and so the free-text case — the office, the warehouse — needs no
 * second field to read from.
 */
async function roleNameFor(
  roleId: string | null | undefined,
  typed: string | undefined,
): Promise<string | undefined> {
  if (roleId) {
    const role = await prisma.costingLabour.findUnique({
      where: { id: roleId },
      select: { role: true },
    });
    if (!role) throw ApiError.badRequest('That costing role is no longer on record');
    return role.role;
  }
  return typed;
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const row = await prisma.employee.create({
    data: {
      name: input.name,
      code: input.code,
      roleId: input.roleId,
      roleName: (await roleNameFor(input.roleId, input.roleName)) ?? '',
      shift: input.shift,
      phone: input.phone,
      joinedOn: input.joinedOn ? new Date(`${input.joinedOn}T00:00:00.000Z`) : null,
      isActive: input.isActive,
      notes: input.notes,
    },
    include: WITH_ROLE,
  });
  return toEmployee(row);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('That person is not on record');

  const roleName =
    input.roleId !== undefined || input.roleName !== undefined
      ? await roleNameFor(input.roleId, input.roleName)
      : undefined;

  const row = await prisma.employee.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(roleName !== undefined ? { roleName } : {}),
      ...(input.shift !== undefined ? { shift: input.shift } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.joinedOn !== undefined
        ? { joinedOn: input.joinedOn ? new Date(`${input.joinedOn}T00:00:00.000Z`) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: WITH_ROLE,
  });
  return toEmployee(row);
}

/**
 * Removes somebody nobody's work names.
 *
 * **Refused once they have run anything**, and the message says to clear the
 * "still here" switch instead. That is not squeamishness: a stage keeps the
 * name beside the link precisely so an old card survives a deletion, but a
 * person removed from the master is a person the works can no longer count, and
 * a leaver is not a mistake — they are history. A mistyped row entered this
 * morning is the case this exists for.
 */
export async function deleteEmployee(id: string): Promise<{ id: string }> {
  const existing = await prisma.employee.findUnique({
    where: { id },
    select: { name: true, _count: { select: { stages: true } } },
  });
  if (!existing) throw ApiError.notFound('That person is not on record');

  if (existing._count.stages > 0) {
    throw ApiError.conflict(
      `${existing.name} has run ${existing._count.stages} stage${existing._count.stages === 1 ? '' : 's'}. Mark them as having left instead — the job cards they ran still name them`,
    );
  }

  await prisma.employee.delete({ where: { id } });
  return { id };
}
