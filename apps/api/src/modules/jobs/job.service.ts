import type {
  AssignDesignCustomerInput,
  CustomerJob,
  DesignMasterList,
  DesignMasterRow,
  ListDesignsQuery,
  SaveQuotationJobInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { nextJobCode } from '../customers/customer.service.js';

/**
 * Saving one job, one at a time.
 *
 * Jobs used to be reachable only through the whole-customer PATCH, which meant
 * saving one design sent every design that customer holds. That is fine for the
 * customer editor, where the office is looking at all of them, and wrong for
 * the quotation wizard, where stepping past a line would rewrite rows nobody
 * touched — and quietly discard whatever a colleague changed in between.
 *
 * The customer comes from the path, never the body. A job cannot be attached to
 * the wrong customer by a malformed request, because the request has no say in
 * which customer it belongs to.
 */

/** The subset of the jobs table a quotation line can speak to. */
function toJobData(input: SaveQuotationJobInput) {
  return {
    jobName: input.jobName.trim(),
    jobType: input.jobType,
    pouchType: input.pouchType,
    layer: input.layer ?? null,
    petMicron: input.petMicron ?? null,
    metPetMicron: input.metPetMicron ?? null,
    polyMicron: input.polyMicron ?? null,
    designOpenWidth: input.designOpenWidth ?? null,
    designHeight: input.designHeight ?? null,
    totalCylinders: input.totalCylinders ?? null,
    petGsm: input.petGsm ?? null,
    metPetGsm: input.metPetGsm ?? null,
    polyGsm: input.polyGsm ?? null,
    pouchesPerKg: input.pouchesPerKg ?? 'NA',
  };
}

/** What the client needs back — the same shape the customer detail returns. */
const SELECT = {
  id: true,
  jobCode: true,
  jobName: true,
  pouchType: true,
  petMicron: true,
  metPetMicron: true,
  polyMicron: true,
  designHeight: true,
  designOpenWidth: true,
  totalCylinders: true,
} as const;

type JobRow = Record<keyof typeof SELECT, unknown>;

function toCustomerJob(row: JobRow): CustomerJob {
  const num = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value);

  return {
    id: String(row.id),
    jobCode: String(row.jobCode),
    jobName: String(row.jobName),
    pouchType: String(row.pouchType),
    petMicron: num(row.petMicron),
    metPetMicron: num(row.metPetMicron),
    polyMicron: num(row.polyMicron),
    designHeight: num(row.designHeight),
    designOpenWidth: num(row.designOpenWidth),
    totalCylinders: num(row.totalCylinders),
  } as CustomerJob;
}

/**
 * Records a design against a customer.
 *
 * **Idempotent by name.** A customer already holding a job of this name gets it
 * updated rather than duplicated. That is what makes the wizard safe to step
 * back and forward through, and a double-clicked Next harmless — the
 * alternative is a customer accumulating four copies of one design because
 * somebody was unsure whether the first click registered.
 */
export async function createJobForCustomer(
  customerId: string,
  input: SaveQuotationJobInput,
): Promise<CustomerJob> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw ApiError.notFound('Customer not found');

  const jobName = input.jobName.trim();

  return prisma.$transaction(async (tx) => {
    /*
     * Case-insensitively, because "ADF Plain 1kg." and "adf plain 1kg." are the
     * same design to everybody except a database.
     */
    const existing = await tx.job.findFirst({
      where: { customerId, jobName: { equals: jobName, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      return toCustomerJob(
        await tx.job.update({ where: { id: existing.id }, data: toJobData(input), select: SELECT }),
      );
    }

    return toCustomerJob(
      await tx.job.create({
        data: {
          ...toJobData(input),
          jobCode: await nextJobCode(tx, new Set()),
          // 0 marks a job that did not come from the imported spreadsheet — the
          // same marker the customer editor uses for one added by hand.
          sourceRow: 0,
          customerId,
          customerSource: 'EXPLICIT',
          needsCustomer: false,
        },
        select: SELECT,
      }),
    );
  }, TX);
}

/** Updates a design already on record. */
export async function updateJob(id: string, input: SaveQuotationJobInput): Promise<CustomerJob> {
  const existing = await prisma.job.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Job not found');

  return toCustomerJob(
    await prisma.job.update({ where: { id }, data: toJobData(input), select: SELECT }),
  );
}

/* ------------------------------------------------------- the design master */

/**
 * **Every design the works has on its books.**
 *
 * The one list nothing else provides. A design belongs to a customer and is
 * edited on that customer's page — which works for all but the ones that came
 * off the old sheets with **nobody's name on them**. Those belong to no
 * customer, so no customer's page lists them, and until this screen existed
 * they could not be found at all.
 *
 * Nothing new is stored. Whether a design has been quoted, ordered, engraved
 * or drawn is counted from the rows that point at it.
 */
const DESIGN_SELECT = {
  id: true,
  jobCode: true,
  jobName: true,
  jobType: true,
  customerId: true,
  petMicron: true,
  metPetMicron: true,
  polyMicron: true,
  polyType: true,
  jobColours: true,
  customer: { select: { companyName: true, brandName: true } },
  quotationItems: {
    select: { quotation: { select: { date: true } } },
    orderBy: { quotation: { date: 'desc' } },
  },
  _count: { select: { orders: true, cylinders: true, artwork: true } },
} as const;

type DesignRowPayload = Prisma.JobGetPayload<{ select: typeof DESIGN_SELECT }>;

function toDesign(row: DesignRowPayload): DesignMasterRow {
  /*
   * The plies, in the works' own shorthand: "12 / 12 / 60".
   *
   * Only the plies the design actually has. A **zero** is not a ply — 303 of
   * the imported designs carry `metPetMicron = "0"` meaning there is no MET
   * PET in them, and printing that as "12 / 0 / 135" reads as a third layer
   * of nothing rather than as a two-ply structure. Blank and 'NA' are the
   * same story from a different row of the old sheet.
   */
  const structure = [row.petMicron, row.metPetMicron, row.polyMicron]
    .map((micron) => (micron === null || micron === undefined ? '' : String(micron).trim()))
    .filter((micron) => micron !== '' && micron !== 'NA' && Number(micron) > 0)
    .join(' / ');

  return {
    id: row.id,
    jobCode: row.jobCode,
    jobName: row.jobName,
    jobType: row.jobType,

    customerId: row.customerId,
    customerName: row.customer?.companyName ?? null,
    needsCustomer: row.customerId === null,

    structure: structure || '—',
    colours: row.jobColours && row.jobColours !== 'NA' ? row.jobColours : '—',

    quotedTimes: row.quotationItems.length,
    orderedTimes: row._count.orders,
    hasCylinders: row._count.cylinders > 0,
    hasArtwork: row._count.artwork > 0,
    lastQuotedOn: row.quotationItems[0]?.quotation?.date?.toISOString().slice(0, 10) ?? null,
  };
}

export async function listDesigns(query: ListDesignsQuery): Promise<DesignMasterList> {
  const where: Prisma.JobWhereInput = {
    ...(query.needsCustomer ? { customerId: null } : {}),
    ...(query.quotedOnly ? { quotationItems: { some: {} } } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.q
      ? {
          OR: [
            { jobName: { contains: query.q, mode: 'insensitive' } },
            { jobCode: { contains: query.q, mode: 'insensitive' } },
            { customer: { companyName: { contains: query.q, mode: 'insensitive' } } },
            { customer: { brandName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total, designs, needCustomer, everQuoted, withCylinders] = await Promise.all([
    prisma.job.findMany({
      where,
      select: DESIGN_SELECT,
      /*
       * The ones nobody can find first, then the newest code. A design master
       * sorted by name alone buries the seventy-odd that need attention
       * somewhere in the middle of four hundred.
       */
      orderBy: [{ customerId: { sort: 'asc', nulls: 'first' } }, { jobCode: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.job.count({ where }),
    prisma.job.count(),
    prisma.job.count({ where: { customerId: null } }),
    prisma.job.count({ where: { quotationItems: { some: {} } } }),
    prisma.job.count({ where: { cylinders: { some: {} } } }),
  ]);

  return {
    items: rows.map(toDesign),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totals: { designs, needCustomer, everQuoted, withCylinders },
  };
}

/**
 * Puts a customer to a design that arrived without one.
 *
 * The only thing the worklist does. Afterwards the design appears on that
 * customer's page and is edited there like any other — this is the way in,
 * not a second editor.
 */
export async function assignDesignCustomer(
  id: string,
  input: AssignDesignCustomerInput,
): Promise<DesignMasterRow> {
  const [job, customer] = await Promise.all([
    prisma.job.findUnique({ where: { id }, select: { id: true, customerId: true } }),
    prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }),
  ]);
  if (!job) throw ApiError.notFound('That design is not on record');
  if (!customer) throw ApiError.notFound('That customer is not on record');

  await prisma.job.update({
    where: { id },
    data: {
      customerId: input.customerId,
      /* It is somebody's now, and the worklist is about the ones that are
         nobody's. `customerSource` records that a person decided, rather than
         the importer having guessed from a brand name in the job title. */
      needsCustomer: false,
      customerSource: 'EXPLICIT',
    },
  });

  /* Read back through the same mapper the list uses, so the row the screen
     receives is exactly the shape it already holds — counts and all. */
  const fresh = await prisma.job.findUniqueOrThrow({ where: { id }, select: DESIGN_SELECT });
  return toDesign(fresh);
}
