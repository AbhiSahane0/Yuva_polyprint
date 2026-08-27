import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateCustomerInput,
  Customer,
  CustomerDetail,
  CustomerJob,
  CustomerJobInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/** Prisma row shape plus the job count we always expose. */
type CustomerRow = Prisma.CustomerGetPayload<{ include: { _count: { select: { jobs: true } } } }>;

const withJobCount = { _count: { select: { jobs: true } } } as const;

/**
 * Every job column the customer screen can edit. Decimal columns serialise as
 * strings, which keeps the exact value the client typed.
 */
const JOB_FIELDS = {
  id: true,
  jobCode: true,
  jobName: true,
  jobType: true,
  pouchType: true,
  pouchSubType: true,
  petMicron: true,
  metPetMicron: true,
  polyMicron: true,
  polyType: true,
  layer: true,
  jobFinalDirection: true,
  printingType: true,
  designHeight: true,
  designOpenWidth: true,
  ups: true,
  design: true,
  jobColours: true,
  totalCylinders: true,
  cylinderParty: true,
  inkGsm: true,
  petGsm: true,
  metPetGsm: true,
  polyGsm: true,
  adhesiveGsm: true,
  compositeGsm: true,
  coatingGsm: true,
  rubberSize: true,
  cylinderCell: true,
  cylinderDia: true,
  viscosity: true,
  pouchPlateSize: true,
  singleRollWeight: true,
  pouchesPerKg: true,
  pouchHeight: true,
  pouchOpenWidth: true,
  dPunch: true,
  dPunchTopSize: true,
  gusset: true,
  gussetSize: true,
  vNotch: true,
  up1: true,
  up2: true,
  up3: true,
  up4: true,
  up2OpenWidth: true,
  up2Height: true,
  up3OpenWidth: true,
  notes: true,
} as const;

/**
 * Derived job values. These are computed here and never accepted from the
 * client, so the numbers can't drift apart from the inputs they come from.
 *
 * Both formulas were verified against every row of the legacy sheet:
 *   compositeGsm  = ink + PET + metallised PET + poly + adhesive   (411/411)
 *   pouchesPerKg  = 1e9 / (height mm x open width mm x composite)  (384/384)
 */
function deriveJobValues(job: Omit<CustomerJobInput, 'id'>) {
  const layers = [job.inkGsm, job.petGsm, job.metPetGsm, job.polyGsm, job.adhesiveGsm];
  const anyLayerSet = layers.some((value) => value !== null && value !== undefined);
  const compositeGsm = anyLayerSet
    ? Number(layers.reduce<number>((total, value) => total + (value ?? 0), 0).toFixed(3))
    : null;

  const { designHeight, designOpenWidth } = job;
  const canComputePouches =
    compositeGsm !== null &&
    compositeGsm > 0 &&
    designHeight !== null &&
    designHeight !== undefined &&
    designHeight > 0 &&
    designOpenWidth !== null &&
    designOpenWidth !== undefined &&
    designOpenWidth > 0;

  const pouchesPerKg = canComputePouches
    ? (1_000_000_000 / (designHeight * designOpenWidth * compositeGsm)).toFixed(2)
    : 'NA';

  return { compositeGsm, pouchesPerKg };
}

/**
 * Next job code for the current month, e.g. YPP2608001.
 *
 * The legacy sheet numbers jobs YPP + YY + MM + a sequence that restarts each
 * month, so new codes follow the same shape and the client's existing habits
 * keep working.
 */
async function nextJobCode(tx: Prisma.TransactionClient, taken: Set<string>): Promise<string> {
  const now = new Date();
  const prefix = `YPP${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await tx.job.findFirst({
    where: { jobCode: { startsWith: prefix } },
    orderBy: { jobCode: 'desc' },
    select: { jobCode: true },
  });

  let sequence = latest ? Number(latest.jobCode.slice(prefix.length)) : 0;
  if (!Number.isFinite(sequence)) sequence = 0;

  // `taken` covers codes handed out earlier in this same transaction, which the
  // database query cannot see yet.
  let code: string;
  do {
    sequence += 1;
    code = `${prefix}${String(sequence).padStart(3, '0')}`;
  } while (taken.has(code));

  taken.add(code);
  return code;
}

/**
 * Reconciles a customer's jobs against the list the form submitted.
 *
 * Rows with an id are updated, rows without one are created, and jobs the form
 * no longer lists are UNLINKED rather than deleted — the same rule as deleting
 * a customer. Removing a row from a form should never destroy production
 * history; the job returns to the "needs a customer" worklist instead.
 */
async function syncCustomerJobs(
  tx: Prisma.TransactionClient,
  customerId: string,
  jobs: CustomerJobInput[],
) {
  const existing = await tx.job.findMany({ where: { customerId }, select: { id: true } });
  const existingIds = new Set(existing.map((job) => job.id));
  const keptIds = new Set(jobs.map((job) => job.id).filter((id): id is string => Boolean(id)));

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    await tx.job.updateMany({
      where: { id: { in: removedIds } },
      data: { customerId: null, customerSource: 'NONE', needsCustomer: true },
    });
  }

  const codesIssued = new Set<string>();

  for (const job of jobs) {
    // `id` identifies the row; everything else is the job's own data.
    const { id: _ignored, ...data } = job;
    const derived = deriveJobValues(data);

    if (job.id && existingIds.has(job.id)) {
      // jobCode is never rewritten on update — it is the job's identity.
      await tx.job.update({ where: { id: job.id }, data: { ...data, ...derived } });
      continue;
    }

    await tx.job.create({
      data: {
        ...data,
        ...derived,
        jobCode: await nextJobCode(tx, codesIssued),
        customerId,
        customerSource: 'EXPLICIT',
        needsCustomer: false,
        // Rows added in the app have no line in the source spreadsheet.
        sourceRow: 0,
      },
    });
  }
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    address: row.address,
    city: row.city,
    district: row.district,
    pincode: row.pincode,
    mobile: row.mobile,
    gstNumber: row.gstNumber,
    altPhone: row.altPhone,
    email: row.email,
    sourceRaw: row.sourceRaw,
    isVerified: row.isVerified,
    source: row.source,
    jobCount: row._count.jobs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Free-text search across the fields someone would actually search by. */
function buildWhere(query: ListCustomersQuery): Prisma.CustomerWhereInput {
  const filters: Prisma.CustomerWhereInput[] = [];

  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' } as const;
    filters.push({
      OR: [
        { companyName: contains },
        { contactPerson: contains },
        { mobile: contains },
        { altPhone: contains },
        { email: contains },
        { city: contains },
        { district: contains },
        { address: contains },
        { pincode: contains },
      ],
    });
  }

  if (query.source) filters.push({ source: query.source });
  if (query.isVerified !== undefined) filters.push({ isVerified: query.isVerified });

  return filters.length > 0 ? { AND: filters } : {};
}

export async function listCustomers(query: ListCustomersQuery) {
  const where = buildWhere(query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: withJobCount,
      // Fixed, alphabetical order — the list is not user-sortable.
      orderBy: { companyName: 'asc' },
      skip,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items: rows.map(toCustomer), total };
}

export async function getCustomerById(id: string): Promise<CustomerDetail> {
  const row = await prisma.customer.findUnique({
    where: { id },
    include: { ...withJobCount, jobs: { select: JOB_FIELDS, orderBy: { jobName: 'asc' } } },
  });
  if (!row) throw ApiError.notFound('Customer not found');
  // Prisma returns Decimal instances; the API contract is strings.
  const jobs = row.jobs.map((job) => {
    const serialised: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(job)) {
      serialised[key] = value === null || value === undefined ? null : String(value);
    }
    return serialised as unknown as CustomerJob;
  });

  return { ...toCustomer(row), jobs };
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerDetail> {
  const existing = await prisma.customer.findUnique({
    where: { companyName: input.companyName },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(`A customer named "${input.companyName}" already exists`);
  }

  const { jobs, ...customerData } = input;

  const id = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        ...customerData,
        // Records created in the app are real entries, not spreadsheet imports.
        source: 'SHEET',
        sourceRaw: 'Added in the app',
      },
      select: { id: true },
    });
    if (jobs && jobs.length > 0) await syncCustomerJobs(tx, customer.id, jobs);
    return customer.id;
  });

  return getCustomerById(id);
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerDetail> {
  const current = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!current) throw ApiError.notFound('Customer not found');

  if (input.companyName) {
    const clash = await prisma.customer.findFirst({
      where: { companyName: input.companyName, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      throw ApiError.conflict(`A customer named "${input.companyName}" already exists`);
    }
  }

  const { jobs, ...customerData } = input;

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id }, data: customerData });
    // `jobs` omitted means "leave the jobs alone"; an empty array means
    // "this customer has no jobs", which is a real instruction.
    if (jobs) await syncCustomerJobs(tx, id, jobs);
  });

  return getCustomerById(id);
}

/**
 * Deletes a customer and hands its jobs back to the worklist.
 *
 * The foreign key is ON DELETE SET NULL, so the jobs survive — but a job with
 * no customer must be flagged, otherwise it silently disappears from every
 * customer view and nobody ever notices it needs reassigning.
 */
export async function deleteCustomer(id: string): Promise<{ id: string; releasedJobs: number }> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    include: withJobCount,
  });
  if (!existing) throw ApiError.notFound('Customer not found');

  const releasedJobs = existing._count.jobs;

  await prisma.$transaction(async (tx) => {
    if (releasedJobs > 0) {
      await tx.job.updateMany({
        where: { customerId: id },
        data: { customerSource: 'NONE', needsCustomer: true },
      });
    }
    await tx.customer.delete({ where: { id } });
  });

  return { id, releasedJobs };
}
