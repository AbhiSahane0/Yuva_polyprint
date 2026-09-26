import type { CustomerJob, SaveQuotationJobInput } from '@yuva/shared';
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
