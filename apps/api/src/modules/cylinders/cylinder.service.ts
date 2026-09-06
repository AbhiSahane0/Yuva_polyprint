import {
  canRecord,
  designStatus,
  isOutOfStore,
  isUnusable,
  round,
  statusAfter,
  type Cylinder,
  type CylinderEvent,
  type DesignDetail,
  type DesignList,
  type DesignSummary,
  type ListCylindersQuery,
  type RecordCylinderEventInput,
  type RegisterCylindersInput,
  type UpdateCylinderInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * The cylinder register.
 *
 * **A design is a job.** The jobs already on record carry the customer, the
 * product, the colours and the expected cylinder count, and the quotation
 * wizard already treats a saved job as the design it charges cylinders for.
 * Nothing here duplicates any of that — this module adds the individual
 * cylinders, so "where is the cyan one for Krishna Dairy" has an answer.
 *
 * Status follows the events, exactly as stock quantity follows movements. A
 * cylinder marked "in store" by hand while it is on a machine is the one nobody
 * can find, which is the failure the register exists to prevent.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const CYLINDER_INCLUDE = {
  events: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
} satisfies Prisma.CylinderInclude;

type CylinderRow = Prisma.CylinderGetPayload<{ include: typeof CYLINDER_INCLUDE }>;

function toCylinder(row: CylinderRow): Cylinder {
  return {
    id: row.id,
    code: row.code,
    jobId: row.jobId,
    colour: row.colour,
    position: row.position,
    ownership: row.ownership,
    status: row.status,
    location: row.location,
    diameterMm: toNumber(row.diameterMm),
    circumferenceMm: toNumber(row.circumferenceMm),
    cost: toNumber(row.cost),
    engraver: row.engraver,
    engravedOn: row.engravedOn ? toISODate(row.engravedOn) : null,
    notes: row.notes,
    lastEventAt: row.events[0]?.createdAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

type EventRow = Prisma.CylinderEventGetPayload<{
  include: { cylinder: { select: { code: true } } };
}>;

function toEvent(row: EventRow): CylinderEvent {
  return {
    id: row.id,
    cylinderId: row.cylinderId,
    cylinderCode: row.cylinder.code,
    kind: row.kind,
    occurredOn: toISODate(row.occurredOn),
    statusAfter: row.statusAfter,
    reference: row.reference,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    notes: row.notes,
    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

const DESIGN_INCLUDE = {
  customer: { select: { id: true, companyName: true, brandName: true } },
  cylinders: { include: CYLINDER_INCLUDE, orderBy: [{ position: 'asc' }, { code: 'asc' }] },
  /* Counted, not fetched: the list shows how many files there are, not which. */
  _count: { select: { artwork: { where: { status: { in: ['ACTIVE', 'SUPERSEDED'] } } } } },
} satisfies Prisma.JobInclude;

/* Derived from the include above, so the two cannot drift apart. */
type JobRow = Prisma.JobGetPayload<{ include: typeof DESIGN_INCLUDE }>;

/**
 * A design row: the job, plus what its cylinders add up to.
 *
 * Nothing here is stored. Ownership reads MIXED when a set is part
 * customer-owned — which happens when a replacement is cut at the works'
 * expense — because reporting either half would be wrong about the other.
 */
function toDesign(row: JobRow): DesignSummary {
  const cylinders = row.cylinders.map(toCylinder);
  const statuses = cylinders.map((cylinder) => cylinder.status);
  const ownerships = [...new Set(cylinders.map((cylinder) => cylinder.ownership))];

  const lastEvent = cylinders
    .map((cylinder) => cylinder.lastEventAt)
    .filter((at): at is string => at !== null)
    .sort()
    .pop();

  return {
    jobId: row.id,
    jobCode: row.jobCode,
    jobName: row.jobName,
    customerId: row.customer?.id ?? null,
    // The brand is what the office calls them; the company is what an invoice
    // says. This screen is the office's, so the brand wins where there is one.
    customerName:
      row.customer === null
        ? null
        : row.customer.brandName !== 'NA' && row.customer.brandName.trim() !== ''
          ? row.customer.brandName
          : row.customer.companyName,
    pouchType: row.pouchType,
    expectedCylinders: toNumber(row.totalCylinders),
    cylinderCount: cylinders.length,
    status: designStatus(statuses),
    codes: cylinders.map((cylinder) => cylinder.code),
    colours: [...new Set(cylinders.map((c) => c.colour).filter((c) => c && c !== 'NA'))],
    locations: [...new Set(cylinders.map((c) => c.location).filter((l) => l && l !== 'NA'))],
    ownership: ownerships.length === 0 ? null : ownerships.length > 1 ? 'MIXED' : ownerships[0]!,
    totalCost: round(
      cylinders.reduce((sum, cylinder) => sum + (cylinder.cost ?? 0), 0),
      2,
    ),
    artworkCount: row._count.artwork,
    lastEventAt: lastEvent ?? null,
  };
}

/**
 * Designs on the register, and the totals across all of them.
 *
 * A design is here once it has something on it: a cylinder set, or a file. Not
 * every job — there are 420, and 382 record a cylinder *count*, but a count is
 * not a set and listing them all would bury the rows somebody can act on.
 *
 * Artwork counts because it comes first in the real order of work: the file is
 * drawn and sent to the engraver, and the cylinders come back weeks later. A
 * design whose artwork is loaded but whose set is not cut yet is precisely the
 * one the office is waiting on.
 */
export async function listDesigns(query: ListCylindersQuery): Promise<DesignList> {
  const filters: Prisma.JobWhereInput[] = [
    {
      OR: [
        { cylinders: { some: {} } },
        { artwork: { some: { status: { in: ['ACTIVE', 'SUPERSEDED'] } } } },
      ],
    },
  ];
  if (query.customerId) filters.push({ customerId: query.customerId });
  if (query.status) filters.push({ cylinders: { some: { status: query.status } } });
  if (query.q) {
    filters.push({
      OR: [
        { jobName: { contains: query.q, mode: 'insensitive' } },
        { jobCode: { contains: query.q, mode: 'insensitive' } },
        { cylinders: { some: { code: { contains: query.q, mode: 'insensitive' } } } },
        { customer: { companyName: { contains: query.q, mode: 'insensitive' } } },
        { customer: { brandName: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }

  const rows = await prisma.job.findMany({
    where: { AND: filters },
    include: DESIGN_INCLUDE,
    orderBy: { jobName: 'asc' },
  });

  const all = rows.map(toDesign);

  /*
   * Counted over every cylinder, not over the designs on screen. A filter that
   * moves the "damaged" figure would make it useless as an alarm — the answer
   * to "how many are damaged" must not depend on what is being looked at.
   */
  const [cylinders, inUse, attention] = await Promise.all([
    prisma.cylinder.count(),
    prisma.cylinder.count({ where: { status: { in: ['ALLOCATED', 'IN_USE'] } } }),
    prisma.cylinder.count({ where: { status: { in: ['DAMAGED', 'NEEDS_REWORK'] } } }),
  ]);

  const totals = { designs: rows.length, cylinders, inUse, attention };

  const visible = query.attentionOnly
    ? all.filter((design) => design.status !== 'NONE' && isUnusable(design.status))
    : all;

  return { items: visible, totals };
}

/** One design in full: its cylinders, and every event against them. */
export async function getDesign(jobId: string): Promise<DesignDetail> {
  const row = await prisma.job.findUnique({ where: { id: jobId }, include: DESIGN_INCLUDE });
  if (!row) throw ApiError.notFound('Design not found');

  const events = await prisma.cylinderEvent.findMany({
    where: { cylinder: { jobId } },
    // Newest first: the history is read to answer "what just happened to it".
    orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { cylinder: { select: { code: true } } },
  });

  return {
    ...toDesign(row),
    cylinders: row.cylinders.map(toCylinder),
    events: events.map(toEvent),
  };
}

/**
 * Registers a set against a design.
 *
 * Each cylinder gets an ENGRAVED event as it is created, so its history starts
 * where it actually started rather than at the first time somebody moved it. A
 * register whose earliest entry is "returned to store" cannot say where the
 * cylinder came from.
 */
export async function registerCylinders(
  input: RegisterCylindersInput,
  enteredBy: string,
): Promise<DesignDetail> {
  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, jobName: true },
  });
  if (!job) throw ApiError.notFound('That design is not on record');

  const codes = input.cylinders.map((cylinder) => cylinder.code.trim());
  const clashes = await prisma.cylinder.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  if (clashes.length > 0) {
    // Named, because the office is holding the cylinders and needs to know
    // which number is already taken rather than that "something" clashed.
    throw ApiError.conflict(`Already registered: ${clashes.map((row) => row.code).join(', ')}`);
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, cylinder] of input.cylinders.entries()) {
      const created = await tx.cylinder.create({
        data: {
          code: cylinder.code.trim(),
          jobId: input.jobId,
          colour: cylinder.colour || 'NA',
          position: cylinder.position ?? index + 1,
          ownership: cylinder.ownership,
          location: cylinder.location,
          diameterMm: cylinder.diameterMm,
          circumferenceMm: cylinder.circumferenceMm,
          cost: cylinder.cost,
          engraver: cylinder.engraver || 'NA',
          engravedOn: cylinder.engravedOn ? parseDate(cylinder.engravedOn) : null,
          notes: cylinder.notes,
          status: 'IN_STORE',
        },
        select: { id: true },
      });

      await tx.cylinderEvent.create({
        data: {
          cylinderId: created.id,
          kind: 'ENGRAVED',
          occurredOn: cylinder.engravedOn ? parseDate(cylinder.engravedOn) : new Date(),
          statusAfter: 'IN_STORE',
          toLocation: cylinder.location,
          notes: cylinder.notes,
          enteredBy,
        },
      });
    }
  });

  return getDesign(input.jobId);
}

/**
 * Records what happened to one or more cylinders.
 *
 * A set moves together — mounted together, returned together — so this takes a
 * list. Doing them one at a time would mean four dialogs to record one job
 * starting, and the fourth would be the one somebody forgets.
 *
 * The status is derived from the kind, never sent by the caller. A cylinder
 * whose status is typed separately from its history can say "in store" while
 * the history says it went out and never came back.
 */
export async function recordEvent(
  input: RecordCylinderEventInput,
  enteredBy: string,
): Promise<CylinderEvent[]> {
  const cylinders = await prisma.cylinder.findMany({
    where: { id: { in: input.cylinderIds } },
    select: { id: true, code: true, status: true, location: true, jobId: true },
  });

  if (cylinders.length !== input.cylinderIds.length) {
    throw ApiError.notFound('One of those cylinders is no longer on record');
  }

  const refused = cylinders.filter((cylinder) => !canRecord(input.kind, cylinder.status));
  if (refused.length > 0) {
    // Retired means scrapped or gone back to the customer. It is not there to
    // be mounted, and pretending otherwise puts a job on a machine that cannot
    // run it.
    throw ApiError.badRequest(
      `${refused.map((c) => c.code).join(', ')} ${refused.length === 1 ? 'has' : 'have'} been retired — re-engrave to bring ${refused.length === 1 ? 'it' : 'them'} back`,
    );
  }

  const ids = await prisma.$transaction(async (tx) => {
    const created: string[] = [];

    for (const cylinder of cylinders) {
      const next = statusAfter(input.kind, cylinder.status);
      const moving = input.kind === 'TRANSFERRED';

      const event = await tx.cylinderEvent.create({
        data: {
          cylinderId: cylinder.id,
          kind: input.kind,
          occurredOn: parseDate(input.occurredOn),
          statusAfter: next,
          reference: input.reference,
          fromLocation: moving ? cylinder.location : '',
          toLocation: moving ? input.toLocation.trim() : '',
          notes: input.notes,
          enteredBy,
        },
        select: { id: true },
      });
      created.push(event.id);

      await tx.cylinder.update({
        where: { id: cylinder.id },
        data: {
          status: next,
          // A transfer is the only event that changes where it lives.
          ...(moving ? { location: input.toLocation.trim() } : {}),
        },
      });
    }

    return created;
  });

  const rows = await prisma.cylinderEvent.findMany({
    where: { id: { in: ids } },
    include: { cylinder: { select: { code: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toEvent);
}

/**
 * Corrects a cylinder's details.
 *
 * Its **status is not editable here** — that follows the events, and letting it
 * be typed would reintroduce exactly the drift the register exists to prevent.
 * Its code is not editable either: the number is painted on the cylinder, and
 * changing it in the system would leave the two disagreeing.
 */
export async function updateCylinder(id: string, input: UpdateCylinderInput): Promise<Cylinder> {
  const existing = await prisma.cylinder.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Cylinder not found');

  const updated = await prisma.cylinder.update({
    where: { id },
    data: {
      ...(input.colour !== undefined ? { colour: input.colour || 'NA' } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.ownership !== undefined ? { ownership: input.ownership } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.diameterMm !== undefined ? { diameterMm: input.diameterMm } : {}),
      ...(input.circumferenceMm !== undefined ? { circumferenceMm: input.circumferenceMm } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.engraver !== undefined ? { engraver: input.engraver || 'NA' } : {}),
      ...(input.engravedOn !== undefined
        ? { engravedOn: input.engravedOn ? parseDate(input.engravedOn) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: CYLINDER_INCLUDE,
  });

  return toCylinder(updated);
}

/**
 * Designs that could take a set but have none registered.
 *
 * The register's own worklist: 382 jobs record a cylinder count and none of
 * them has cylinders yet, so this is what the office works through. Sorted by
 * how many the job says it needs, largest first — the biggest sets are the
 * most expensive to lose.
 */
export async function listUnregistered(limit = 50): Promise<DesignSummary[]> {
  const rows = await prisma.job.findMany({
    where: { cylinders: { none: {} }, totalCylinders: { gt: 0 } },
    include: DESIGN_INCLUDE,
    orderBy: [{ totalCylinders: 'desc' }, { jobName: 'asc' }],
    take: limit,
  });
  return rows.map(toDesign);
}

/** Every cylinder currently out of the store, whatever design it belongs to. */
export async function listOut(): Promise<Cylinder[]> {
  const rows = await prisma.cylinder.findMany({
    where: { status: { in: ['ALLOCATED', 'IN_USE'] } },
    include: CYLINDER_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toCylinder).filter((cylinder) => isOutOfStore(cylinder.status));
}
