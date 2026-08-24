import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateCustomerInput,
  Customer,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/** Prisma row shape plus the job count we always expose. */
type CustomerRow = Prisma.CustomerGetPayload<{ include: { _count: { select: { jobs: true } } } }>;

const withJobCount = { _count: { select: { jobs: true } } } as const;

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
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items: rows.map(toCustomer), total };
}

export async function getCustomerById(id: string): Promise<Customer> {
  const row = await prisma.customer.findUnique({ where: { id }, include: withJobCount });
  if (!row) throw ApiError.notFound('Customer not found');
  return toCustomer(row);
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const existing = await prisma.customer.findUnique({
    where: { companyName: input.companyName },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(`A customer named "${input.companyName}" already exists`);
  }

  const row = await prisma.customer.create({
    data: {
      ...input,
      // Records created in the app are real entries, not spreadsheet imports.
      source: 'SHEET',
      sourceRaw: 'Added in the app',
    },
    include: withJobCount,
  });
  return toCustomer(row);
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
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

  const row = await prisma.customer.update({
    where: { id },
    data: input,
    include: withJobCount,
  });
  return toCustomer(row);
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
