import {
  computeItem,
  computeMargin,
  computeMaterialCostPerKg,
  computeTotals,
  DEFAULT_TERMS,
  round,
  type CreateQuotationInput,
  type ListQuotationsQuery,
  type Quotation,
  type QuotationItem,
  type QuotationItemInput,
  type QuotationSummary,
  type UpdateQuotationInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { getSettings } from '../settings/settings.service.js';
import { getRateMap } from '../materials/material.service.js';

/** Prisma hands back Decimal objects; the API contract is plain numbers. */
const toNumber = (value: Prisma.Decimal | number | null): number =>
  value === null ? 0 : Number(value);

type QuotationRow = Prisma.QuotationGetPayload<{ include: { items: true } }>;

function toItem(row: QuotationRow['items'][number]): QuotationItem {
  return {
    id: row.id,
    position: row.position,
    jobId: row.jobId,
    filmMaterialId: row.filmMaterialId,
    filmMaterialName: null,
    jobName: row.jobName,
    layer: row.layer,
    widthMm: toNumber(row.widthMm),
    heightMm: toNumber(row.heightMm),
    polyMicron: toNumber(row.polyMicron),
    quantityKg: toNumber(row.quantityKg),
    ratePerKg: toNumber(row.ratePerKg),
    repeatWidth: toNumber(row.repeatWidth),
    repeatHeight: toNumber(row.repeatHeight),
    cylinderCount: row.cylinderCount,
    transportCost: toNumber(row.transportCost),
    micron: toNumber(row.micron),
    pouchesPerKg: toNumber(row.pouchesPerKg),
    totalPouches: toNumber(row.totalPouches),
    totalAmount: toNumber(row.totalAmount),
    cylinderWidth: toNumber(row.cylinderWidth),
    cylinderCircumference: toNumber(row.cylinderCircumference),
    costPerCylinder: toNumber(row.costPerCylinder),
    totalCylinderCost: toNumber(row.totalCylinderCost),
    costPerPouch: toNumber(row.costPerPouch),
    materialCostPerKg: row.materialCostPerKg === null ? null : Number(row.materialCostPerKg),
    materialCost: row.materialCost === null ? null : Number(row.materialCost),
    marginPercent: row.marginPercent === null ? null : Number(row.marginPercent),
  };
}

/**
 * Everything needed to cost a line against a given day's prices: the rate in
 * force per material, and each film's density so a micron figure can become a
 * weight.
 */
async function loadCostingContext(onDate: string) {
  const [settings, rates, materials] = await Promise.all([
    getSettings(),
    getRateMap(onDate),
    prisma.material.findMany({ select: { id: true, name: true, density: true } }),
  ]);

  const byId = new Map(materials.map((m) => [m.id, m]));
  const byName = new Map(materials.map((m) => [m.name, m]));
  const rateOf = (material?: { id: string }) =>
    material ? (rates.get(material.id) ?? null) : null;

  return {
    settings,
    byId,
    petRate: rateOf(byName.get(settings.defaultPetMaterial)),
    inkRate: rateOf(byName.get(settings.defaultInkMaterial)),
    adhesiveRate: rateOf(byName.get(settings.defaultAdhesiveMaterial)),
    rateOfId: (id: string | null | undefined) => (id ? (rates.get(id) ?? null) : null),
  };
}

/** yyyy-mm-dd, so the client never has to deal with timezone drift. */
const toISODate = (date: Date): string => date.toISOString().slice(0, 10);

function toSummary(row: QuotationRow): QuotationSummary {
  return {
    id: row.id,
    number: row.number,
    date: toISODate(row.date),
    status: row.status,
    customerId: row.customerId,
    customerName: row.customerName,
    itemCount: row.items.length,
    grandWithGst: toNumber(row.grandWithGst),
    totalAdvance: toNumber(row.totalAdvance),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQuotation(row: QuotationRow): Quotation {
  return {
    ...toSummary(row),
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressLine3: row.addressLine3,
    mobile: row.mobile,
    email: row.email,
    cylinderRate: toNumber(row.cylinderRate),
    gstPercent: toNumber(row.gstPercent),
    materialAdvancePercent: toNumber(row.materialAdvancePercent),
    cylinderAdvancePercent: toNumber(row.cylinderAdvancePercent),
    materialSubtotal: toNumber(row.materialSubtotal),
    materialAdvance: toNumber(row.materialAdvance),
    cylinderAdvance: toNumber(row.cylinderAdvance),
    materialWithGst: toNumber(row.materialWithGst),
    cylinderSubtotal: toNumber(row.cylinderSubtotal),
    cylinderWithGst: toNumber(row.cylinderWithGst),
    grandSubtotal: toNumber(row.grandSubtotal),
    terms: row.terms,
    notes: row.notes,
    items: [...row.items].sort((a, b) => a.position - b.position).map(toItem),
  };
}

/**
 * Prices every line and the document totals.
 *
 * Always computed here, never taken from the client — the numbers on a
 * quotation are the whole point of the document.
 */
function priceQuotation(
  items: QuotationItemInput[],
  rates: {
    cylinderRate: number;
    gstPercent: number;
    materialAdvancePercent: number;
    cylinderAdvancePercent: number;
  },
  costing: Awaited<ReturnType<typeof loadCostingContext>>,
) {
  const priced = items.map((item, index) => {
    const computed = computeItem(item, rates.cylinderRate);

    // Costed against the rates in force on the quotation's date, and stored, so
    // the margin a quotation was accepted on never moves when prices do.
    const film = item.filmMaterialId ? costing.byId.get(item.filmMaterialId) : undefined;
    const material = computeMaterialCostPerKg({
      layer: item.layer,
      polyMicron: item.polyMicron,
      polyDensity: film?.density ? Number(film.density) : null,
      petRate: costing.petRate,
      polyRate: costing.rateOfId(item.filmMaterialId ?? null),
      inkRate: costing.inkRate,
      adhesiveRate: costing.adhesiveRate,
      inkGsm: costing.settings.inkGsm,
      adhesiveGsm: costing.settings.adhesiveGsm,
    });

    const materialCostPerKg = material.costPerKg;
    return {
      input: item,
      computed,
      position: index + 1,
      cost: {
        materialCostPerKg,
        materialCost:
          materialCostPerKg === null ? null : round(materialCostPerKg * item.quantityKg, 2),
        marginPercent: computeMargin(item.ratePerKg, materialCostPerKg),
      },
    };
  });

  const allTotals = computeTotals(
    priced.map((entry) => ({
      ...entry.computed,
      quantityKg: entry.input.quantityKg,
      cylinderCount: entry.input.cylinderCount,
    })),
    rates,
  );

  // totalQuantityKg and totalCylinderCount are derived on render, not stored —
  // keep them out of the object that gets spread into Prisma.
  const { totalQuantityKg: _qty, totalCylinderCount: _cyls, ...totals } = allTotals;

  return { priced, totals };
}

/**
 * Next quotation number.
 *
 * The client's existing series is already past #118, so the counter starts
 * from the highest number present rather than from 1.
 */
async function nextQuotationNumber(tx: Prisma.TransactionClient): Promise<number> {
  const [latest, settings] = await Promise.all([
    tx.quotation.findFirst({ orderBy: { number: 'desc' }, select: { number: true } }),
    getSettings(),
  ]);
  // Whichever is higher: the next in sequence, or the configured start.
  return Math.max((latest?.number ?? 0) + 1, settings.quotationStartNumber);
}

export async function listQuotations(query: ListQuotationsQuery) {
  const filters: Prisma.QuotationWhereInput[] = [];

  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' } as const;
    const asNumber = Number(query.q);
    filters.push({
      OR: [
        { customerName: contains },
        { items: { some: { jobName: contains } } },
        ...(Number.isFinite(asNumber) ? [{ number: Math.trunc(asNumber) }] : []),
      ],
    });
  }
  if (query.status) filters.push({ status: query.status });

  const where: Prisma.QuotationWhereInput = filters.length > 0 ? { AND: filters } : {};

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { items: true },
      orderBy: { number: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);

  return { items: rows.map(toSummary), total };
}

export async function getQuotationById(id: string): Promise<Quotation> {
  const row = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!row) throw ApiError.notFound('Quotation not found');
  return toQuotation(row);
}

export async function createQuotation(input: CreateQuotationInput): Promise<Quotation> {
  const settings = await getSettings();
  const rates = {
    cylinderRate: input.cylinderRate ?? settings.cylinderRate,
    gstPercent: input.gstPercent ?? settings.gstPercent,
    materialAdvancePercent: input.materialAdvancePercent ?? settings.materialAdvancePercent,
    cylinderAdvancePercent: input.cylinderAdvancePercent ?? settings.cylinderAdvancePercent,
  };

  const costing = await loadCostingContext(input.date);
  const { priced, totals } = priceQuotation(input.items, rates, costing);

  const id = await prisma.$transaction(async (tx) => {
    const number = await nextQuotationNumber(tx);

    const created = await tx.quotation.create({
      data: {
        number,
        date: new Date(input.date),
        status: input.status,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        addressLine3: input.addressLine3,
        mobile: input.mobile,
        email: input.email,
        ...rates,
        ...totals,
        terms: input.terms.length > 0 ? input.terms : DEFAULT_TERMS,
        notes: input.notes,
        ...(input.status === 'SENT' ? { sentAt: new Date() } : {}),
        items: {
          create: priced.map((entry) => ({
            position: entry.position,
            jobId: entry.input.jobId ?? null,
            jobName: entry.input.jobName,
            layer: entry.input.layer,
            widthMm: entry.input.widthMm,
            heightMm: entry.input.heightMm,
            polyMicron: entry.input.polyMicron,
            quantityKg: entry.input.quantityKg,
            ratePerKg: entry.input.ratePerKg,
            repeatWidth: entry.input.repeatWidth,
            repeatHeight: entry.input.repeatHeight,
            cylinderCount: entry.input.cylinderCount,
            transportCost: entry.input.transportCost,
            filmMaterialId: entry.input.filmMaterialId ?? null,
            ...entry.computed,
            ...entry.cost,
          })),
        },
      },
      select: { id: true },
    });

    return created.id;
  });

  return getQuotationById(id);
}

export async function updateQuotation(id: string, input: UpdateQuotationInput): Promise<Quotation> {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) throw ApiError.notFound('Quotation not found');

  const rates = {
    cylinderRate: input.cylinderRate ?? toNumber(existing.cylinderRate),
    gstPercent: input.gstPercent ?? toNumber(existing.gstPercent),
    materialAdvancePercent:
      input.materialAdvancePercent ?? toNumber(existing.materialAdvancePercent),
    cylinderAdvancePercent:
      input.cylinderAdvancePercent ?? toNumber(existing.cylinderAdvancePercent),
  };

  // Reprice from whichever line set applies — the new one if sent, else the stored one.
  const items: QuotationItemInput[] =
    input.items ??
    [...existing.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        jobId: item.jobId,
        filmMaterialId: item.filmMaterialId,
        jobName: item.jobName,
        // Constrained to 2 or 3 by the schema when the row was written.
        layer: item.layer as 2 | 3,
        widthMm: toNumber(item.widthMm),
        heightMm: toNumber(item.heightMm),
        polyMicron: toNumber(item.polyMicron),
        quantityKg: toNumber(item.quantityKg),
        ratePerKg: toNumber(item.ratePerKg),
        repeatWidth: toNumber(item.repeatWidth),
        repeatHeight: toNumber(item.repeatHeight),
        cylinderCount: item.cylinderCount,
        transportCost: toNumber(item.transportCost),
      }));

  const costing = await loadCostingContext(input.date ?? toISODate(existing.date));
  const { priced, totals } = priceQuotation(items, rates, costing);

  const becomingSent = input.status === 'SENT' && existing.status !== 'SENT';

  await prisma.$transaction(async (tx) => {
    // Lines are replaced wholesale: positions shift and lines get removed, so
    // reconciling by id would be more fragile than rewriting the set.
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });

    await tx.quotation.update({
      where: { id },
      data: {
        ...(input.date ? { date: new Date(input.date) } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.customerName ? { customerName: input.customerName } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
        ...(input.addressLine3 !== undefined ? { addressLine3: input.addressLine3 } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.terms ? { terms: input.terms } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(becomingSent ? { sentAt: new Date() } : {}),
        ...rates,
        ...totals,
        items: {
          create: priced.map((entry) => ({
            position: entry.position,
            jobId: entry.input.jobId ?? null,
            jobName: entry.input.jobName,
            layer: entry.input.layer,
            widthMm: entry.input.widthMm,
            heightMm: entry.input.heightMm,
            polyMicron: entry.input.polyMicron,
            quantityKg: entry.input.quantityKg,
            ratePerKg: entry.input.ratePerKg,
            repeatWidth: entry.input.repeatWidth,
            repeatHeight: entry.input.repeatHeight,
            cylinderCount: entry.input.cylinderCount,
            transportCost: entry.input.transportCost,
            filmMaterialId: entry.input.filmMaterialId ?? null,
            ...entry.computed,
            ...entry.cost,
          })),
        },
      },
    });
  });

  return getQuotationById(id);
}

export async function deleteQuotation(id: string): Promise<{ id: string }> {
  const existing = await prisma.quotation.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Quotation not found');
  // Items cascade.
  await prisma.quotation.delete({ where: { id } });
  return { id };
}

/** Number the next quotation will get, for showing on a blank form. */
export async function peekNextNumber(): Promise<number> {
  const [latest, settings] = await Promise.all([
    prisma.quotation.findFirst({ orderBy: { number: 'desc' }, select: { number: true } }),
    getSettings(),
  ]);
  return Math.max((latest?.number ?? 0) + 1, settings.quotationStartNumber);
}
