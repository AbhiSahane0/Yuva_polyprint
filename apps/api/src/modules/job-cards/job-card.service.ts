import {
  dispatchDateFrom,
  type JobCard,
  type JobCardInput,
  type JobCardQuery,
  type JobCardSummary,
  type UpdateJobCardInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * **Job cards — the work instruction, written before the run.**
 *
 * Raised when the order is in hand, handed to the floor, signed by three
 * people. What it stores is only what somebody types; everything the card
 * PRINTS is worked out from the design master and the works' dated figures by
 * `computeJobCard`, which the screen and the PDF both call. One arithmetic,
 * so the paper and the screen cannot disagree.
 *
 * **Not a job sheet.** That is the other document: written after a stage
 * finishes, recording what it drew from the shelf and what came back, and
 * costing the run. See `job-sheet.service.ts`.
 */

const WITH_LINKS = {
  order: { select: { number: true } },
} as const;

type Row = Prisma.JobCardGetPayload<{ include: typeof WITH_LINKS }>;

const toNumber = (value: Prisma.Decimal | null): number => (value === null ? 0 : value.toNumber());
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);

function toJobCard(row: Row): JobCard {
  return {
    id: row.id,
    number: row.number,
    date: row.date.toISOString().slice(0, 10),

    orderId: row.orderId,
    orderNumber: row.order?.number ?? null,
    jobId: row.jobId,
    jobName: row.jobName,
    customerId: row.customerId,
    customerName: row.customerName,

    workOrderNo: row.workOrderNo,
    poDate: isoOf(row.poDate),
    dispatchDate: isoOf(row.dispatchDate),
    transport: row.transport,
    quantityKg: toNumber(row.quantityKg),
    jobReceivedBy: row.jobReceivedBy,
    printingNote: row.printingNote,
    printSpeedMPerMin: toNumber(row.printSpeedMPerMin),
    printMetersOverride:
      row.printMetersOverride === null ? null : toNumber(row.printMetersOverride),
    metPetCoatingGsm: toNumber(row.metPetCoatingGsm),
    polyCoatingGsm: toNumber(row.polyCoatingGsm),
    pouchingSpeedPerMin: toNumber(row.pouchingSpeedPerMin),
    otherSettingMinutes: toNumber(row.otherSettingMinutes),
    singleRollWeight: row.singleRollWeight,
    pouchSorting: row.pouchSorting,
    specialInstructions: row.specialInstructions,

    preparedBy: row.preparedBy,
    operatedBy: row.operatedBy,
    approvedBy: row.approvedBy,

    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The next number in the series, without taking it. */
export async function peekNextNumber(): Promise<number> {
  const latest = await prisma.jobCard.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (latest?.number ?? 0) + 1;
}

export async function getJobCard(id: string): Promise<JobCard> {
  const row = await prisma.jobCard.findUnique({ where: { id }, include: WITH_LINKS });
  if (!row) throw ApiError.notFound('That job card is not on record');
  return toJobCard(row);
}

export async function listJobCards(
  query: JobCardQuery,
): Promise<{ items: JobCardSummary[]; total: number }> {
  const where: Prisma.JobCardWhereInput = {
    ...(query.search
      ? {
          OR: [
            { jobName: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
            { workOrderNo: { contains: query.search, mode: 'insensitive' } },
            ...(Number.isFinite(Number(query.search)) ? [{ number: Number(query.search) }] : []),
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: asDate(query.from) } : {}),
            ...(query.to ? { lte: asDate(query.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      include: WITH_LINKS,
      orderBy: { number: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.jobCard.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      date: row.date.toISOString().slice(0, 10),
      jobName: row.jobName,
      customerName: row.customerName,
      orderNumber: row.order?.number ?? null,
      quantityKg: toNumber(row.quantityKg),
      workOrderNo: row.workOrderNo,
      dispatchDate: isoOf(row.dispatchDate),
    })),
    total,
  };
}

/**
 * Raising a card.
 *
 * Everything the order already knows is copied rather than retyped — the
 * design, the customer, the quantity and the day they ordered — because the
 * office raising a card has that screen open in front of them and typing it
 * twice is how the two come to disagree.
 */
export async function createJobCard(input: JobCardInput, enteredBy: string): Promise<JobCard> {
  const settings = await getSettings(input.date);

  const order = input.orderId
    ? await prisma.order.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          jobId: true,
          jobName: true,
          customerId: true,
          customerName: true,
          quantityKg: true,
          orderDate: true,
        },
      })
    : null;
  if (input.orderId && !order) throw ApiError.badRequest('That order is no longer on record');

  const jobId = input.jobId ?? order?.jobId ?? null;
  const job = jobId
    ? await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, jobName: true, customerId: true },
      })
    : null;
  if (jobId && !job) throw ApiError.badRequest('That design is no longer on record');

  const customerId = input.customerId ?? order?.customerId ?? job?.customerId ?? null;
  const customer = customerId
    ? await prisma.customer.findUnique({
        where: { id: customerId },
        select: { companyName: true },
      })
    : null;

  /* The customer's order date is the PO date unless the office typed one, and
     the promised despatch follows it by the works' lead. */
  const poDate = input.poDate ?? (order ? order.orderDate.toISOString().slice(0, 10) : null);
  const dispatchDate =
    input.dispatchDate ?? (poDate ? dispatchDateFrom(poDate, settings.dispatchLeadDays) : null);

  const row = await prisma.jobCard.create({
    data: {
      number: await peekNextNumber(),
      date: asDate(input.date),

      orderId: order?.id ?? null,
      jobId: job?.id ?? null,
      customerId,
      jobName: input.jobName || job?.jobName || order?.jobName || '',
      customerName: customer?.companyName ?? order?.customerName ?? '',

      workOrderNo: input.workOrderNo,
      poDate: poDate ? asDate(poDate) : null,
      dispatchDate: dispatchDate ? asDate(dispatchDate) : null,
      transport: input.transport,
      quantityKg: input.quantityKg || (order ? order.quantityKg : 0),
      jobReceivedBy: input.jobReceivedBy,
      printingNote: input.printingNote,
      /* Seeded from the works' figures so a card opens filled in rather than
         as a row of empty boxes the setter has to know the answers to. */
      printSpeedMPerMin: input.printSpeedMPerMin || settings.printingSpeedMPerMin,
      printMetersOverride: input.printMetersOverride,
      metPetCoatingGsm: input.metPetCoatingGsm,
      polyCoatingGsm: input.polyCoatingGsm,
      pouchingSpeedPerMin: input.pouchingSpeedPerMin,
      otherSettingMinutes: input.otherSettingMinutes || settings.jobSetupMinutes,
      singleRollWeight: input.singleRollWeight,
      pouchSorting: input.pouchSorting,
      specialInstructions: input.specialInstructions,

      preparedBy: input.preparedBy || enteredBy,
      operatedBy: input.operatedBy,
      approvedBy: input.approvedBy,
      enteredBy,
    },
    include: WITH_LINKS,
  });

  return toJobCard(row);
}

export async function updateJobCard(id: string, input: UpdateJobCardInput): Promise<JobCard> {
  const existing = await prisma.jobCard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('That job card is not on record');

  const { date, poDate, dispatchDate, orderId, jobId, customerId, ...rest } = input;

  /*
   * Pointing a card at an order fills in what that order already knows.
   *
   * Done here rather than on the screen so that both ways in — raising the
   * card from the order, and picking the order afterwards — leave the same
   * record. The quantity is only seeded where nobody has typed one: a part
   * delivery is a real card for less than the order.
   */
  const order = orderId
    ? await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          jobId: true,
          jobName: true,
          customerId: true,
          customerName: true,
          quantityKg: true,
          orderDate: true,
        },
      })
    : null;
  if (orderId && !order) throw ApiError.badRequest('That order is no longer on record');

  const current = order
    ? await prisma.jobCard.findUniqueOrThrow({
        where: { id },
        select: { quantityKg: true, poDate: true },
      })
    : null;

  const row = await prisma.jobCard.update({
    where: { id },
    data: {
      ...rest,
      ...(date ? { date: asDate(date) } : {}),
      /* Pulled out of the spread: these arrive as yyyy-mm-dd and the columns
         are DATEs. Null is a real answer — "no PO date recorded". */
      ...(poDate !== undefined ? { poDate: poDate ? asDate(poDate) : null } : {}),
      ...(dispatchDate !== undefined
        ? { dispatchDate: dispatchDate ? asDate(dispatchDate) : null }
        : {}),
      ...(orderId !== undefined ? { orderId } : {}),
      ...(jobId !== undefined ? { jobId } : {}),
      ...(customerId !== undefined ? { customerId } : {}),
      ...(order && current
        ? {
            jobId: jobId ?? order.jobId,
            jobName: rest.jobName || order.jobName,
            customerId: customerId ?? order.customerId,
            customerName: order.customerName,
            ...(Number(current.quantityKg) > 0 ? {} : { quantityKg: order.quantityKg }),
            ...(current.poDate ? {} : { poDate: order.orderDate }),
          }
        : {}),
    },
    include: WITH_LINKS,
  });

  return toJobCard(row);
}

export async function deleteJobCard(id: string): Promise<{ id: string }> {
  const existing = await prisma.jobCard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('That job card is not on record');
  await prisma.jobCard.delete({ where: { id } });
  return { id };
}
