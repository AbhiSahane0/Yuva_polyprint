import {
  costJobSheet,
  JOB_SHEET_CREW,
  JOB_SHEET_LINES,
  JOB_SHEET_STAGE_DEFAULTS,
  mixDrumFor,
  type JobSheet,
  type JobSheetInput,
  type JobSheetLineTemplate,
  type JobSheetStage,
  type JobSheetSummary,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { issueMaterialFifo } from '../inventory/inventory.service.js';
import { releaseFor } from '../production/material-reservation.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * **Job sheets: what a run actually cost.**
 *
 * The costing itself lives in `@yuva/shared` and is checked against all
 * fourteen of the works' own September 2026 tabs. What this file does is
 * everything around it — where the rates come from, what a blank sheet starts
 * as, and what happens to stock when a sheet is closed.
 *
 * Two decisions are worth stating here because they are invisible in the code.
 *
 * **A sheet keeps its own copy of every overhead rate.** It does not read
 * settings when it is displayed. A sheet is the record of what the works
 * decided that week — electricity was Rs 4,000 a day on the March tabs and
 * Rs 6,000 on the September ones — and a record that reprices itself when
 * somebody edits a setting is not a record of anything.
 *
 * **Rates come from the catalogue as at the day of the run,** not as at today.
 * The works' own tabs show PET at 149 on one job and 170 on another two months
 * later, and pricing an August run at November's PET would make every old sheet
 * disagree with the paper it was copied from.
 */

const SHEET_INCLUDE = {
  customer: { select: { companyName: true } },
  /* Only its number: the sheet names the card it costs, it does not restate it. */
  productionOrder: { select: { number: true } },
  lines: { orderBy: { position: 'asc' } },
  labour: { orderBy: { position: 'asc' } },
  stages: { orderBy: { stage: 'asc' } },
} satisfies Prisma.JobSheetInclude;

type SheetRow = Prisma.JobSheetGetPayload<{ include: typeof SHEET_INCLUDE }>;

const num = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);
const maybe = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);
const day = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * The name the office knows a customer by.
 *
 * A proprietorship registers as a person and trades as a brand, and the office
 * knows most customers by the second — so the brand wins wherever there is one,
 * matching the customer list and the quotation.
 */
const customerName = (customer: { companyName: string } | null | undefined): string =>
  customer?.companyName ?? '';
const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function toJobSheet(row: SheetRow): JobSheet {
  return {
    id: row.id,
    number: row.number,
    date: day(row.date),
    status: row.status,

    jobId: row.jobId,
    jobName: row.jobName,
    customerId: row.customerId,
    customerName: customerName(row.customer),

    productionOrderId: row.productionOrderId,
    productionOrderNumber: row.productionOrder?.number ?? null,

    operatorName: row.operatorName,

    filmType: row.filmType,
    webWidthMm: maybe(row.webWidthMm),
    micron: maybe(row.micron),
    circumferenceMm: maybe(row.circumferenceMm),
    cylinderCount: row.cylinderCount,

    printMixIssuedKg: num(row.printMixIssuedKg),
    printMixReturnedKg: num(row.printMixReturnedKg),
    lamMixIssuedKg: num(row.lamMixIssuedKg),
    lamMixReturnedKg: num(row.lamMixReturnedKg),

    makeReadyDays: num(row.makeReadyDays),
    productionDays: num(row.productionDays),

    printedGrossKg: num(row.printedGrossKg),
    printedCoreKg: num(row.printedCoreKg),
    producedGrossKg: num(row.producedGrossKg),
    producedCoreKg: num(row.producedCoreKg),
    producedKg: num(row.producedGrossKg) - num(row.producedCoreKg),
    finalOutputKg: num(row.finalOutputKg),
    pouchingWeightKg: num(row.pouchingWeightKg),

    electricityPerDay: num(row.electricityPerDay),
    transportPerKg: num(row.transportPerKg),
    pouchingPerKg: num(row.pouchingPerKg),
    packagingCost: num(row.packagingCost),
    emiPerDay: num(row.emiPerDay),
    profitPercent: num(row.profitPercent),
    expectedWastagePercent: num(row.expectedWastagePercent),

    electricityOverride: maybe(row.electricityOverride),
    salaryOverride: maybe(row.salaryOverride),
    transportOverride: maybe(row.transportOverride),
    pouchingOverride: maybe(row.pouchingOverride),
    emiOverride: maybe(row.emiOverride),
    profitOverride: maybe(row.profitOverride),

    materialKg: num(row.materialKg),
    materialCost: num(row.materialCost),
    basicValuePerKg: num(row.basicValuePerKg),

    electricityCost: num(row.electricityCost),
    salaryCost: num(row.salaryCost),
    transportCost: num(row.transportCost),
    pouchingCost: num(row.pouchingCost),
    emiCost: num(row.emiCost),
    profit: num(row.profit),
    overheadCost: num(row.overheadCost),

    effectivePrice: num(row.effectivePrice),
    costPerKg: num(row.costPerKg),

    expectedWastageKg: num(row.expectedWastageKg),
    actualWastageKg: num(row.actualWastageKg),
    wastagePercent: num(row.wastagePercent),
    excessCost: num(row.excessCost),

    stockPostedAt: row.stockPostedAt?.toISOString() ?? null,

    notes: row.notes,
    enteredBy: row.enteredBy,

    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      section: line.section,
      kind: line.kind,
      materialId: line.materialId,
      name: line.name,
      issuedKg: num(line.issuedKg),
      returnedKg: num(line.returnedKg),
      mixIssuedKg: num(line.mixIssuedKg),
      mixReturnedKg: num(line.mixReturnedKg),
      mixSharePercent: num(line.mixSharePercent),
      computedKg: num(line.computedKg),
      consumedOverrideKg: maybe(line.consumedOverrideKg),
      consumedKg: num(line.consumedKg),
      ratePerKg: num(line.ratePerKg),
      amount: num(line.amount),
    })),
    labour: row.labour.map((line) => ({
      id: line.id,
      position: line.position,
      role: line.role,
      headcount: num(line.headcount),
      ratePerDay: num(line.ratePerDay),
      days: num(line.days),
      amount: num(line.amount),
    })),
    stages: row.stages.map((stage) => ({
      id: stage.id,
      stage: stage.stage,
      sharePercent: num(stage.sharePercent),
      days: num(stage.days),
      shifts: num(stage.shifts),
      amount: num(stage.amount),
    })),

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The next sheet number.
 *
 * One past the highest there is, so a deleted sheet does not hand its number to
 * the next one and leave two pieces of paper in the office claiming to be 862.
 */
export async function peekNextNumber(): Promise<number> {
  const top = await prisma.jobSheet.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (top?.number ?? 850) + 1;
}

/** Every material a blank sheet wants a rate for, looked up by the works' own names. */
async function ratesForTemplate(
  onDate: string,
): Promise<Map<string, { id: string; rate: number }>> {
  const names = [...new Set(JOB_SHEET_LINES.map((line) => line.materialName).filter(Boolean))];
  if (names.length === 0) return new Map();

  const materials = await prisma.material.findMany({
    where: { name: { in: names } },
    select: {
      id: true,
      name: true,
      /*
       * The rate in force ON THE DAY OF THE RUN, newest first. Pricing an
       * August sheet at November's PET would make every old sheet disagree
       * with the paper it was copied from.
       */
      rates: {
        where: { effectiveDate: { lte: asDate(onDate) } },
        orderBy: { effectiveDate: 'desc' },
        take: 1,
        select: { rate: true },
      },
    },
  });

  return new Map(
    materials.map((material) => [
      material.name,
      { id: material.id, rate: num(material.rates[0]?.rate) },
    ]),
  );
}

/** What the mix columns of a line start as, given which drum it draws from. */
function mixFor(template: JobSheetLineTemplate): { share: number } {
  return { share: template.mixSource === 'NONE' ? 0 : template.mixSharePercent };
}

/**
 * A blank sheet, with the works' twenty-one rows already on it.
 *
 * Not an empty list somebody adds materials to. The person filling this in is
 * reading down a printed form and typing what the drum in front of them says,
 * and a form that starts empty is a form they have to build before they can use
 * it. Most of the twelve colours stay at zero on most jobs, which is fine — a
 * zero row costs nothing and keeps the sheet the same shape every time.
 */
export async function createJobSheet(input: JobSheetInput, enteredBy: string): Promise<JobSheet> {
  const settings = await getSettings(input.date);
  const rates = await ratesForTemplate(input.date);

  const job = input.jobId
    ? await prisma.job.findUnique({
        where: { id: input.jobId },
        select: { id: true, jobName: true, customerId: true },
      })
    : null;
  if (input.jobId && !job) throw ApiError.badRequest('That job is no longer on record');

  /*
   * Raised straight off a job card, which is the ordinary path once the floor
   * has finished a run: the card knows the design and the customer, so the
   * office is not asked to retype what is already on the screen.
   */
  const fromCard = input.productionOrderId
    ? await resolveCardLink(prisma, null, input.productionOrderId)
    : null;

  const number = await peekNextNumber();

  const created = await prisma.jobSheet.create({
    data: {
      number,
      date: asDate(input.date),
      status: 'OPEN',

      jobId: job?.id ?? fromCard?.jobId ?? null,
      jobName: input.jobName || job?.jobName || fromCard?.jobName || '',
      customerId: input.customerId ?? job?.customerId ?? fromCard?.customerId ?? null,

      productionOrderId: input.productionOrderId ?? null,

      operatorName: input.operatorName,
      filmType: input.filmType,
      webWidthMm: input.webWidthMm,
      micron: input.micron,
      circumferenceMm: input.circumferenceMm,
      cylinderCount: input.cylinderCount,

      electricityPerDay: settings.jobSheetElectricityPerDay,
      transportPerKg: settings.jobSheetTransportPerKg,
      pouchingPerKg: settings.jobSheetPouchingPerKg,
      emiPerDay: settings.jobSheetEmiPerDay,
      profitPercent: settings.jobSheetProfitPercent,
      expectedWastagePercent: settings.jobSheetWastagePercent,

      notes: input.notes,
      enteredBy,

      lines: {
        create: JOB_SHEET_LINES.map((template, index) => {
          const material = template.materialName ? rates.get(template.materialName) : undefined;
          return {
            position: index + 1,
            section: template.section,
            kind: template.kind,
            materialId: material?.id ?? null,
            name: template.name,
            mixSharePercent: mixFor(template).share,
            ratePerKg: material?.rate ?? 0,
          };
        }),
      },
      labour: {
        create: JOB_SHEET_CREW.map((role, index) => ({
          position: index + 1,
          role: role.role,
          headcount: role.headcount,
          ratePerDay: role.ratePerDay,
          days: 0,
        })),
      },
      stages: {
        create: JOB_SHEET_STAGE_DEFAULTS.map((stage) => ({
          stage: stage.stage,
          sharePercent: stage.sharePercent,
          shifts: stage.shifts,
          days: 0,
        })),
      },
    },
    select: { id: true },
  });

  return recost(created.id);
}

/**
 * Re-runs the costing and writes what it came to back onto the sheet.
 *
 * Stored rather than computed on read, because the figure is quoted from: a
 * cost per kilogram that silently moves when a rate is edited months later is
 * worse than a stale one, since nobody can tell it has moved.
 */
export async function recost(id: string): Promise<JobSheet> {
  const row = await prisma.jobSheet.findUnique({ where: { id }, include: SHEET_INCLUDE });
  if (!row) throw ApiError.notFound('That job sheet no longer exists');

  const sheet = toJobSheet(row);

  const cost = costJobSheet({
    lines: sheet.lines.map((line) => {
      const pool = mixDrumFor(line, sheet);
      return {
        name: line.name,
        issuedKg: line.issuedKg,
        returnedKg: line.returnedKg,
        mixIssuedKg: line.mixSharePercent > 0 ? pool.issued : 0,
        mixReturnedKg: line.mixSharePercent > 0 ? pool.returned : 0,
        mixSharePercent: line.mixSharePercent,
        consumedOverrideKg: line.consumedOverrideKg,
        ratePerKg: line.ratePerKg,
      };
    }),
    electricityPerDay: sheet.electricityPerDay,
    stages: sheet.stages.map((stage) => ({
      stage: stage.stage,
      sharePercent: stage.sharePercent,
      days: stage.days,
      shifts: stage.shifts,
    })),
    labour: sheet.labour.map((line) => ({
      role: line.role,
      headcount: line.headcount,
      ratePerDay: line.ratePerDay,
      days: line.days,
    })),
    transportPerKg: sheet.transportPerKg,
    pouchingPerKg: sheet.pouchingPerKg,
    pouchingWeightKg: sheet.pouchingWeightKg,
    packagingCost: sheet.packagingCost,
    emiPerDay: sheet.emiPerDay,
    emiDays: sheet.productionDays,
    profitPercent: sheet.profitPercent,
    overrides: {
      electricity: sheet.electricityOverride,
      salary: sheet.salaryOverride,
      transport: sheet.transportOverride,
      pouching: sheet.pouchingOverride,
      emi: sheet.emiOverride,
      profit: sheet.profitOverride,
    },
    producedKg: sheet.producedKg,
    finalOutputKg: sheet.finalOutputKg,
    expectedWastagePercent: sheet.expectedWastagePercent,
  });

  /*
   * The interactive form, not the array one.
   *
   * A re-cost rewrites twenty-one line rows, the labour, the stages and the
   * sheet — and the ARRAY form of $transaction takes no timeout, so against a
   * database across a network it aborted at five seconds with no way to say
   * otherwise. Written out in order, it can be given the room it needs.
   */
  await prisma.$transaction(async (tx) => {
    for (const write of [
      ...cost.lines.map((line, index) =>
        tx.jobSheetLine.update({
          where: { id: sheet.lines[index]!.id },
          data: {
            /* Written back so the row explains itself without the sheet. */
            mixIssuedKg: line.mixIssuedKg,
            mixReturnedKg: line.mixReturnedKg,
            computedKg: line.computedKg,
            consumedKg: line.consumedKg,
            amount: line.amount,
          },
        }),
      ),
      ...cost.labour.map((line, index) =>
        tx.jobSheetLabour.update({
          where: { id: sheet.labour[index]!.id },
          data: { amount: line.amount },
        }),
      ),
      ...cost.stages.map((stage, index) =>
        tx.jobSheetStageUsage.update({
          where: { id: sheet.stages[index]!.id },
          data: { amount: stage.amount },
        }),
      ),
      tx.jobSheet.update({
        where: { id },
        data: {
          materialKg: cost.materialKg,
          materialCost: cost.materialCost,
          basicValuePerKg: cost.basicValuePerKg,
          electricityCost: cost.electricityCost,
          salaryCost: cost.salaryCost,
          transportCost: cost.transportCost,
          pouchingCost: cost.pouchingCost,
          emiCost: cost.emiCost,
          profit: cost.profit,
          overheadCost: cost.overheadCost,
          effectivePrice: cost.effectivePrice,
          costPerKg: cost.costPerKg,
          expectedWastageKg: cost.expectedWastageKg,
          actualWastageKg: cost.actualWastageKg,
          wastagePercent: cost.wastagePercent,
          excessCost: cost.excessCost,
        },
      }),
    ]) {
      await write;
    }
  }, TX);

  const fresh = await prisma.jobSheet.findUniqueOrThrow({ where: { id }, include: SHEET_INCLUDE });
  return toJobSheet(fresh);
}

/** A sheet whose stock has been posted is a fact, not a draft. */
async function editable(id: string) {
  const row = await prisma.jobSheet.findUnique({
    where: { id },
    select: { id: true, status: true, stockPostedAt: true },
  });
  if (!row) throw ApiError.notFound('That job sheet no longer exists');
  if (row.stockPostedAt) {
    throw ApiError.badRequest(
      'This sheet has been taken off stock and can no longer be changed. Raise a stock adjustment instead.',
    );
  }
  return row;
}

/**
 * Checks a sheet may claim that job card, and says what the card can fill in.
 *
 * **One run, one costing.** A second sheet against the same card would be a
 * second answer to "what did this run cost", and nothing could say which was
 * right — so the unique index refuses it and this turns that into a sentence
 * somebody can act on.
 *
 * The card also carries the design and the customer, so a sheet linked to one
 * stops asking for what the card already knows. Only blanks are filled: an
 * office that typed a name meant it.
 */
async function resolveCardLink(
  tx: Prisma.TransactionClient,
  sheetId: string | null,
  productionOrderId: string,
): Promise<{ jobId: string | null; jobName: string; customerId: string | null }> {
  const card = await tx.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: {
      id: true,
      number: true,
      jobId: true,
      jobName: true,
      jobSheet: { select: { id: true, number: true } },
    },
  });
  if (!card) throw ApiError.badRequest('That job card is no longer on record');
  if (card.jobSheet && card.jobSheet.id !== sheetId) {
    throw ApiError.conflict(
      `Job sheet ${card.jobSheet.number} already costs job card #${card.number}`,
    );
  }

  /* The customer comes off the order rather than the card: the card snapshots a
     NAME for the floor to read, and a name is not a link. */
  const order = await tx.order.findFirst({
    where: { productionOrders: { some: { id: card.id } } },
    select: { customerId: true },
  });

  return { jobId: card.jobId, jobName: card.jobName, customerId: order?.customerId ?? null };
}

export async function updateJobSheet(
  id: string,
  input: Partial<JobSheetInput>,
  _enteredBy: string,
): Promise<JobSheet> {
  await editable(id);

  await prisma.$transaction(async (tx) => {
    const { lines, labour, stages, date, jobId, productionOrderId, ...rest } = input;

    /*
     * Pulled out of the spread on purpose. Linking a sheet to a card is the
     * only field here that can be refused, and letting it through with the
     * rest would make it the one write nothing checked.
     */
    let fromCard: { jobId: string | null; jobName: string; customerId: string | null } | null =
      null;
    if (productionOrderId) fromCard = await resolveCardLink(tx, id, productionOrderId);

    const current = fromCard
      ? await tx.jobSheet.findUniqueOrThrow({
          where: { id },
          select: { jobId: true, jobName: true, customerId: true },
        })
      : null;

    await tx.jobSheet.update({
      where: { id },
      data: {
        ...rest,
        /* Pulled out of the spread: it arrives as yyyy-mm-dd and the column
           is a DATE. */
        ...(date ? { date: asDate(date) } : {}),
        ...(jobId !== undefined ? { jobId } : {}),
        ...(productionOrderId !== undefined ? { productionOrderId } : {}),
        /* Blanks only — an office that typed a name meant it. */
        ...(fromCard && current
          ? {
              ...(current.jobId ? {} : { jobId: fromCard.jobId }),
              ...(current.jobName ? {} : { jobName: fromCard.jobName }),
              ...(current.customerId ? {} : { customerId: fromCard.customerId }),
            }
          : {}),
      },
    });

    /*
     * Positions, not ids. The sheet is a fixed form: the twenty-one rows are
     * always the same twenty-one, so an update is a write to each of them
     * rather than a diff that could leave a colour behind.
     */
    for (const line of lines ?? []) {
      await tx.jobSheetLine.updateMany({
        where: { sheetId: id, position: line.position },
        data: {
          materialId: line.materialId,
          name: line.name,
          issuedKg: line.issuedKg,
          returnedKg: line.returnedKg,
          mixIssuedKg: line.mixIssuedKg,
          mixReturnedKg: line.mixReturnedKg,
          mixSharePercent: line.mixSharePercent,
          consumedOverrideKg: line.consumedOverrideKg,
          ratePerKg: line.ratePerKg,
        },
      });
    }

    for (const role of labour ?? []) {
      await tx.jobSheetLabour.updateMany({
        where: { sheetId: id, position: role.position },
        data: {
          role: role.role,
          headcount: role.headcount,
          ratePerDay: role.ratePerDay,
          days: role.days,
        },
      });
    }

    for (const stage of stages ?? []) {
      await tx.jobSheetStageUsage.updateMany({
        where: { sheetId: id, stage: stage.stage as JobSheetStage },
        data: { sharePercent: stage.sharePercent, days: stage.days, shifts: stage.shifts },
      });
    }
  }, TX);

  return recost(id);
}

export async function getJobSheet(id: string): Promise<JobSheet> {
  const row = await prisma.jobSheet.findUnique({ where: { id }, include: SHEET_INCLUDE });
  if (!row) throw ApiError.notFound('That job sheet no longer exists');
  return toJobSheet(row);
}

export async function listJobSheets(query: {
  page: number;
  pageSize: number;
  search: string;
  status?: 'OPEN' | 'COSTED' | 'CLOSED';
  from?: string;
  to?: string;
}): Promise<{ items: JobSheetSummary[]; total: number }> {
  const where: Prisma.JobSheetWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: asDate(query.from) } : {}),
            ...(query.to ? { lte: asDate(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { jobName: { contains: query.search, mode: 'insensitive' as const } },
            { customer: { companyName: { contains: query.search, mode: 'insensitive' as const } } },
            ...(Number.isFinite(Number(query.search)) && query.search.trim() !== ''
              ? [{ number: Number(query.search) }]
              : []),
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.jobSheet.count({ where }),
    prisma.jobSheet.findMany({
      where,
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        number: true,
        date: true,
        status: true,
        jobName: true,
        customer: { select: { companyName: true } },
        /* Only its number: the sheet names the card it costs, it does not restate it. */
        productionOrder: { select: { number: true } },
        pouchingWeightKg: true,
        finalOutputKg: true,
        materialCost: true,
        effectivePrice: true,
        costPerKg: true,
        wastagePercent: true,
        stockPostedAt: true,
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      date: day(row.date),
      status: row.status,
      jobName: row.jobName,
      customerName: customerName(row.customer),
      isPouchForm: num(row.pouchingWeightKg) > 0,
      finalOutputKg: num(row.finalOutputKg),
      materialCost: num(row.materialCost),
      effectivePrice: num(row.effectivePrice),
      costPerKg: num(row.costPerKg),
      wastagePercent: num(row.wastagePercent),
      stockPostedAt: row.stockPostedAt?.toISOString() ?? null,
    })),
    total,
  };
}

/** Settling a sheet: the cost per kilogram is now the works' answer. */
export async function costSheet(id: string): Promise<JobSheet> {
  await editable(id);
  const sheet = await recost(id);
  if (sheet.finalOutputKg <= 0) {
    throw ApiError.badRequest('Enter the final output weight before costing the sheet');
  }
  await prisma.jobSheet.update({ where: { id }, data: { status: 'COSTED' } });
  return getJobSheet(id);
}

/**
 * Takes the run's consumption off stock, and closes the sheet.
 *
 * One transaction, oldest batch first, and once. Posting writes real movements
 * against real batches; un-posting would mean reversing them, and a sheet that
 * could be posted twice would take the same material off twice. So this runs
 * once and the sheet is then closed to editing.
 *
 * Lines with no material chosen are skipped rather than refused — LDPE is
 * bought under half a dozen names and the works may not have matched it to a
 * catalogue row. The result says what was skipped, so it is a visible gap
 * rather than a silent one.
 */
export async function postToStock(
  id: string,
  enteredBy: string,
): Promise<{ sheet: JobSheet; posted: number; skipped: string[] }> {
  const sheet = await getJobSheet(id);
  if (sheet.stockPostedAt) throw ApiError.badRequest('This sheet has already been taken off stock');
  if (sheet.status === 'OPEN') {
    throw ApiError.badRequest('Cost the sheet before taking its material off stock');
  }

  const skipped: string[] = [];
  let posted = 0;

  await prisma.$transaction(async (tx) => {
    for (const line of sheet.lines) {
      if (line.consumedKg <= 0) continue;
      if (!line.materialId) {
        skipped.push(line.name);
        continue;
      }
      await issueMaterialFifo(tx, {
        materialId: line.materialId,
        quantity: line.consumedKg,
        jobId: sheet.jobId,
        reference: `Job sheet ${sheet.number}`,
        notes: line.name,
        enteredBy,
      });
      posted += 1;
    }

    await tx.jobSheet.update({
      where: { id },
      data: { status: 'CLOSED', stockPostedAt: new Date() },
    });

    /*
     * **Where the claim ends.**
     *
     * The job card held this film so nothing else could be promised it. The
     * lines above have just issued what the run actually took, against real
     * batches and real movements — so from this moment the claim and the issue
     * would both be standing against the same material, and free stock would
     * read low by the whole run.
     *
     * Releasing it here rather than waiting for the card to be completed is
     * what closes that window. A card with no sheet still releases on
     * completion; this is the earlier and more accurate of the two.
     */
    if (sheet.productionOrderId) await releaseFor(tx, sheet.productionOrderId);
    /* Twenty-one rows issued FIFO across batches, and a claim released. */
  }, TX);

  return { sheet: await getJobSheet(id), posted, skipped };
}

/**
 * Deletes a sheet nobody has posted.
 *
 * A posted sheet is refused: its movements are in the ledger and deleting the
 * paper would leave stock that went nowhere.
 */
export async function deleteJobSheet(id: string): Promise<{ id: string }> {
  const row = await prisma.jobSheet.findUnique({
    where: { id },
    select: { id: true, number: true, stockPostedAt: true },
  });
  if (!row) throw ApiError.notFound('That job sheet no longer exists');
  if (row.stockPostedAt) {
    throw ApiError.badRequest(
      `Job sheet ${row.number} has been taken off stock and cannot be deleted`,
    );
  }
  await prisma.jobSheet.delete({ where: { id } });
  return { id };
}
