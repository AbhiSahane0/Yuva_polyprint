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
  METPET_DENSITY,
  METPET_MICRON_PER_LAYER,
  PET_DENSITY,
  PET_MICRON_PER_LAYER,
  JOB_KIND_LABELS,
  POUCH_TYPE_LABELS,
  pricingBasisFor,
  type QuotationEmail as QuotationEmailRecord,
  type RecordOutcomeInput,
  type RecordOutcomeResult,
  type SendQuotationInput,
  type SendQuotationResult,
  type UpdateQuotationInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { getSettings } from '../settings/settings.service.js';
import { getRateMap } from '../materials/material.service.js';
import { nextJobCode } from '../customers/customer.service.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../../lib/mailer.js';
import { renderQuotationPdf } from './quotation-pdf.js';
import { buildQuotationEmail } from './quotation-email.js';

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
    jobKind: row.jobKind,
    pouchType: row.pouchType,
    pouchTypeNote: row.pouchTypeNote,
    layer: row.layer,
    widthMm: toNumber(row.widthMm),
    heightMm: toNumber(row.heightMm),
    polyMicron: toNumber(row.polyMicron),
    pricingBasis: row.pricingBasis,
    quantityKg: toNumber(row.quantityKg),
    ratePerKg: toNumber(row.ratePerKg),
    quantityPouches: row.quantityPouches,
    ratePerPouch: toNumber(row.ratePerPouch),
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
    metpetRate: rateOf(byName.get(settings.defaultMetpetMaterial)),
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
    gstNumber: row.gstNumber,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    lostReason: row.lostReason,
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
    /*
     * The basis is derived from the style rather than trusted from the client,
     * so a request cannot ask for a standup pouch to be priced by weight.
     */
    const pricingBasis = pricingBasisFor(item.jobKind, item.pouchType);
    const computed = computeItem({ ...item, pricingBasis }, rates.cylinderRate);

    // Costed against the rates in force on the quotation's date, and stored, so
    // the margin a quotation was accepted on never moves when prices do.
    const film = item.filmMaterialId ? costing.byId.get(item.filmMaterialId) : undefined;
    const material = computeMaterialCostPerKg({
      layer: item.layer,
      polyMicron: item.polyMicron,
      polyDensity: film?.density ? Number(film.density) : null,
      petRate: costing.petRate,
      metpetRate: costing.metpetRate,
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
      // The computed weight: on a per-pouch line it is worked out, not typed.
      quantityKg: entry.computed.quantityKg,
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

    /*
     * "New company" adds to the customer master as the quotation saves, so the
     * next enquiry finds it under "Existing company" rather than being retyped.
     *
     * Inside the same transaction as the quotation: a customer created for a
     * quotation that then failed to save would be a ghost record nobody asked
     * for. An existing company of the same name is reused rather than
     * duplicated — companyName is unique, and the office typing a name that
     * already exists means the same firm, not a second one.
     */
    let customerId = input.customerId ?? null;
    if (customerId === null && input.saveAsCustomer) {
      const existing = await tx.customer.findUnique({
        where: { companyName: input.customerName },
        select: { id: true },
      });
      customerId =
        existing?.id ??
        (
          await tx.customer.create({
            data: {
              companyName: input.customerName,
              // The quotation's address is three free-text lines; the customer
              // master keeps one. Joining them loses nothing a human reads.
              address:
                [input.addressLine1, input.addressLine2, input.addressLine3]
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .join(', ') || 'NA',
              mobile: input.mobile || 'NA',
              email: input.email || 'NA',
              gstNumber: input.gstNumber || 'NA',
              source: 'SHEET',
              // What the record was built from. There is no spreadsheet row
              // behind this one, so it says where it really came from.
              sourceRaw: `Created from quotation for ${input.customerName}`,
              // Typed in by hand, so it is as checked as it will ever be.
              isVerified: true,
            },
            select: { id: true },
          })
        ).id;
    }

    const created = await tx.quotation.create({
      data: {
        number,
        date: new Date(input.date),
        status: input.status,
        customerId,
        customerName: input.customerName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        addressLine3: input.addressLine3,
        mobile: input.mobile,
        email: input.email,
        gstNumber: input.gstNumber,
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
            jobKind: entry.input.jobKind,
            pouchType: entry.input.pouchType,
            pouchTypeNote: entry.input.pouchTypeNote,
            layer: entry.input.layer,
            widthMm: entry.input.widthMm,
            heightMm: entry.input.heightMm,
            polyMicron: entry.input.polyMicron,
            pricingBasis: pricingBasisFor(entry.input.jobKind, entry.input.pouchType),
            /*
             * quantityKg and ratePerKg arrive with the `...entry.computed`
             * spread below, already resolved for whichever basis this line
             * uses — listing them here as well would be dead code that TS
             * rightly flags as overwritten.
             */
            quantityPouches: entry.computed.totalPouches,
            ratePerPouch: entry.computed.costPerPouch,
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
        jobKind: item.jobKind,
        pouchType: item.pouchType,
        pouchTypeNote: item.pouchTypeNote,
        // Constrained to 2 or 3 by the schema when the row was written.
        layer: item.layer as 2 | 3,
        widthMm: toNumber(item.widthMm),
        heightMm: toNumber(item.heightMm),
        polyMicron: toNumber(item.polyMicron),
        quantityKg: toNumber(item.quantityKg),
        ratePerKg: toNumber(item.ratePerKg),
        quantityPouches: item.quantityPouches,
        ratePerPouch: toNumber(item.ratePerPouch),
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
        ...(input.gstNumber !== undefined ? { gstNumber: input.gstNumber } : {}),
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
            jobKind: entry.input.jobKind,
            pouchType: entry.input.pouchType,
            pouchTypeNote: entry.input.pouchTypeNote,
            layer: entry.input.layer,
            widthMm: entry.input.widthMm,
            heightMm: entry.input.heightMm,
            polyMicron: entry.input.polyMicron,
            pricingBasis: pricingBasisFor(entry.input.jobKind, entry.input.pouchType),
            /*
             * quantityKg and ratePerKg arrive with the `...entry.computed`
             * spread below, already resolved for whichever basis this line
             * uses — listing them here as well would be dead code that TS
             * rightly flags as overwritten.
             */
            quantityPouches: entry.computed.totalPouches,
            ratePerPouch: entry.computed.costPerPouch,
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

/**
 * Emails a quotation, with the PDF attached, and records that it happened.
 *
 * The PDF is rendered fresh rather than reused from any cache, so what the
 * customer receives is the quotation as it stands right now — a document sent
 * from a stale render would be a quietly wrong price list.
 *
 * The send is recorded and the status advanced only *after* Resend accepts the
 * message. Writing first would leave a quotation marked Sent that never went
 * anywhere, which is the more damaging way to be wrong: the office would stop
 * chasing it.
 */
export async function sendQuotationEmail(
  id: string,
  input: SendQuotationInput,
  sentBy: string,
): Promise<SendQuotationResult> {
  const quotation = await getQuotationById(id);

  const file = await renderQuotationPdf(quotation);
  const { html, text } = buildQuotationEmail(quotation, input.message);

  const safeCustomer = quotation.customerName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const filename = `Quotation_${quotation.number}_${safeCustomer || 'Customer'}.pdf`;

  const providerId = await sendEmail({
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    html,
    text,
    replyTo: env.MAIL_REPLY_TO,
    attachments: [{ filename, content: Buffer.from(file) }],
  });

  const sentAt = new Date();
  const [record] = await prisma.$transaction([
    prisma.quotationEmail.create({
      data: {
        quotationId: id,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        providerId,
        sentBy,
      },
      select: { createdAt: true },
    }),
    prisma.quotation.update({
      where: { id },
      data: {
        // Only a draft advances. A quotation already Won must not be dragged
        // back to Sent just because someone forwarded a copy.
        ...(quotation.status === 'DRAFT' ? { status: 'SENT' as const } : {}),
        // sentAt records the *first* send, so it is never overwritten.
        ...(quotation.sentAt === null ? { sentAt } : {}),
      },
      select: { status: true },
    }),
  ]);

  return {
    sentTo: input.to,
    sentAt: record.createdAt.toISOString(),
    status: quotation.status === 'DRAFT' ? 'SENT' : quotation.status,
  };
}

/** Every recorded send for one quotation, newest first. */
export async function listQuotationEmails(id: string): Promise<QuotationEmailRecord[]> {
  const rows = await prisma.quotationEmail.findMany({
    where: { quotationId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((row) => ({
    id: row.id,
    to: row.to,
    cc: row.cc,
    subject: row.subject,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Records the customer's answer, and — on a win — turns the quotation into
 * standing records.
 *
 * A won quotation is the moment an enquiry becomes a real customer with real
 * jobs, and doing that by hand means retyping a specification that is already
 * on screen. So winning it:
 *
 *   1. attaches the quotation to a customer, creating one from its own
 *      snapshot if it was never linked to the master;
 *   2. adds each line as a job on that customer, so the next quotation can be
 *      prefilled from it.
 *
 * A job the customer already has under the same name is left alone and
 * reported, never overwritten. That makes winning the same quotation twice
 * harmless, and protects a job record the office has been maintaining from
 * being flattened by a quotation line, which carries far fewer fields.
 *
 * Losing records why. "We lost it" teaches nothing a year later.
 */
export async function recordOutcome(
  id: string,
  input: RecordOutcomeInput,
): Promise<RecordOutcomeResult> {
  const quotation = await getQuotationById(id);
  const decidedAt = new Date();

  if (input.outcome === 'LOST') {
    await prisma.quotation.update({
      where: { id },
      data: { status: 'LOST', lostReason: input.lostReason, decidedAt },
    });
    return {
      status: 'LOST',
      customerId: quotation.customerId,
      customerCreated: false,
      jobsCreated: [],
      jobsSkipped: [],
    };
  }

  return prisma.$transaction(async (tx) => {
    let customerId = quotation.customerId;
    let customerCreated = false;

    if (customerId === null) {
      // Reuse a company of the same name rather than making a second one —
      // companyName is unique, and the same name means the same firm.
      const existing = await tx.customer.findUnique({
        where: { companyName: quotation.customerName },
        select: { id: true },
      });
      if (existing) {
        customerId = existing.id;
      } else {
        const created = await tx.customer.create({
          data: {
            companyName: quotation.customerName,
            address:
              [quotation.addressLine1, quotation.addressLine2, quotation.addressLine3]
                .map((line) => line.trim())
                .filter((line) => line && line !== 'NA')
                .join(', ') || 'NA',
            mobile: quotation.mobile || 'NA',
            email: quotation.email || 'NA',
            gstNumber: quotation.gstNumber || 'NA',
            source: 'SHEET',
            sourceRaw: `Created when quotation #${quotation.number} was won`,
            isVerified: true,
          },
          select: { id: true },
        });
        customerId = created.id;
        customerCreated = true;
      }
    }

    const held = await tx.job.findMany({
      where: { customerId },
      select: { jobName: true },
    });
    const heldNames = new Set(held.map((job) => job.jobName.trim().toLowerCase()));

    const jobsCreated: string[] = [];
    const jobsSkipped: string[] = [];
    const takenCodes = new Set<string>();

    for (const item of quotation.items) {
      const key = item.jobName.trim().toLowerCase();
      if (heldNames.has(key)) {
        jobsSkipped.push(item.jobName);
        continue;
      }
      heldNames.add(key);

      const petMicron = PET_MICRON_PER_LAYER;
      const metPetMicron = item.layer === 3 ? METPET_MICRON_PER_LAYER : null;

      await tx.job.create({
        data: {
          jobCode: await nextJobCode(tx, takenCodes),
          jobName: item.jobName,
          // 0 means "not from the imported spreadsheet", the same marker the
          // customer editor uses for a job added by hand.
          sourceRow: 0,
          customerId,
          customerSource: 'EXPLICIT',
          needsCustomer: false,
          // A roll has no pouch style; the jobs table predates the enum and
          // stores 'NA' for anything unknown.
          pouchType: item.pouchType ? POUCH_TYPE_LABELS[item.pouchType] : 'NA',
          jobType: JOB_KIND_LABELS[item.jobKind],
          layer: item.layer,
          petMicron,
          metPetMicron,
          polyMicron: item.polyMicron,
          designOpenWidth: item.widthMm,
          designHeight: item.heightMm,
          totalCylinders: item.cylinderCount,
          petGsm: round(petMicron * PET_DENSITY, 3),
          metPetGsm: metPetMicron === null ? null : round(metPetMicron * METPET_DENSITY, 3),
          // Only known when a film was chosen; the density comes from it.
          polyGsm: null,
          // The imported jobs table stores this as text, not a number.
          pouchesPerKg: String(item.pouchesPerKg),
        },
      });
      jobsCreated.push(item.jobName);
    }

    await tx.quotation.update({
      where: { id },
      data: { status: 'WON', lostReason: '', decidedAt, customerId },
    });

    return { status: 'WON' as const, customerId, customerCreated, jobsCreated, jobsSkipped };
  });
}
