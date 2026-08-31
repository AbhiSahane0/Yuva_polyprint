import {
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
  type QuotationItemLayer,
  type QuotationItemQuantity,
  type QuotationTier,
  computeItemGeometry,
  computeTier,
  totalMicronForLayers,
  type QuotationSummary,
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

/*
 * Everything a document needs, in one shape. The includes are deep because a
 * quotation is read whole — the screen, the PDF and the email all want the same
 * thing — and three round trips to assemble one document is worse than one.
 */
const QUOTATION_INCLUDE = {
  tiers: { orderBy: { position: 'asc' } },
  items: {
    orderBy: { position: 'asc' },
    include: {
      layers: { orderBy: { position: 'asc' } },
      quantities: { orderBy: { position: 'asc' } },
    },
  },
} as const;

type QuotationRow = Prisma.QuotationGetPayload<{ include: typeof QUOTATION_INCLUDE }>;
type ItemRow = QuotationRow['items'][number];

function toLayer(row: ItemRow['layers'][number]): QuotationItemLayer {
  return {
    position: row.position,
    materialId: row.materialId,
    materialName: row.materialName,
    micron: toNumber(row.micron),
    density: row.density === null ? null : Number(row.density),
    ratePerKg: row.ratePerKg === null ? null : Number(row.ratePerKg),
    gsm: toNumber(row.gsm),
  };
}

function toQuantity(row: ItemRow['quantities'][number]): QuotationItemQuantity {
  return {
    position: row.position,
    quantityKg: toNumber(row.quantityKg),
    ratePerKg: toNumber(row.ratePerKg),
    quantityPouches: row.quantityPouches,
    ratePerPouch: toNumber(row.ratePerPouch),
    totalPouches: toNumber(row.totalPouches),
    totalAmount: toNumber(row.totalAmount),
    costPerPouch: toNumber(row.costPerPouch),
    materialCost: row.materialCost === null ? null : Number(row.materialCost),
    marginPercent: row.marginPercent === null ? null : Number(row.marginPercent),
  };
}

function toTier(row: QuotationRow['tiers'][number]): QuotationTier {
  return {
    id: row.id,
    position: row.position,
    materialSubtotal: toNumber(row.materialSubtotal),
    materialWithGst: toNumber(row.materialWithGst),
    cylinderSubtotal: toNumber(row.cylinderSubtotal),
    cylinderWithGst: toNumber(row.cylinderWithGst),
    grandSubtotal: toNumber(row.grandSubtotal),
    grandWithGst: toNumber(row.grandWithGst),
    materialAdvance: toNumber(row.materialAdvance),
    cylinderAdvance: toNumber(row.cylinderAdvance),
    totalAdvance: toNumber(row.totalAdvance),
    totalQuantityKg: toNumber(row.totalQuantityKg),
    totalPouches: toNumber(row.totalPouches),
  };
}

function toItem(row: ItemRow): QuotationItem {
  return {
    id: row.id,
    position: row.position,
    jobId: row.jobId,
    jobName: row.jobName,
    jobKind: row.jobKind,
    pouchType: row.pouchType,
    pouchTypeNote: row.pouchTypeNote,
    widthMm: toNumber(row.widthMm),
    heightMm: toNumber(row.heightMm),
    pricingBasis: row.pricingBasis,
    repeatWidth: toNumber(row.repeatWidth),
    repeatHeight: toNumber(row.repeatHeight),
    cylinderCount: row.cylinderCount,
    transportCost: toNumber(row.transportCost),
    chargeCylinders: row.chargeCylinders,
    micron: toNumber(row.micron),
    pouchesPerKg: toNumber(row.pouchesPerKg),
    cylinderWidth: toNumber(row.cylinderWidth),
    cylinderCircumference: toNumber(row.cylinderCircumference),
    costPerCylinder: toNumber(row.costPerCylinder),
    totalCylinderCost: toNumber(row.totalCylinderCost),
    materialCostPerKg: row.materialCostPerKg === null ? null : Number(row.materialCostPerKg),
    compositeGsm: toNumber(row.compositeGsm),
    layers: row.layers.map(toLayer),
    quantities: row.quantities.map(toQuantity),
  };
}

/**
 * The tier a summary should quote.
 *
 * Whichever the customer accepted, or the smallest when the answer is still
 * open — a list row needs one number, and "what they agreed to" beats "the
 * biggest figure on the page" every time.
 */
function headlineTier(row: { wonTierId: string | null; tiers: QuotationRow['tiers'] }) {
  return row.tiers.find((t) => t.id === row.wonTierId) ?? row.tiers[0] ?? null;
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
    version: row.version,
    isLatest: row.isLatest,
    tierCount: row.tiers.length,
    // The tier they agreed to, or the smallest while the answer is open.
    grandWithGst: toNumber(headlineTier(row)?.grandWithGst ?? 0),
    totalAdvance: toNumber(headlineTier(row)?.totalAdvance ?? 0),
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
    wonTierId: row.wonTierId,
    rootId: row.rootId,
    tiers: [...row.tiers].sort((a, b) => a.position - b.position).map(toTier),
    terms: row.terms,
    notes: row.notes,
    items: [...row.items].sort((a, b) => a.position - b.position).map(toItem),
  };
}

/**
 * Prices every line, at every quantity, and the document totals for each.
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

    /*
     * The plies as the office stated them, each costed against its own
     * material's rate on the quotation's date and snapshotted, so the margin a
     * quotation was accepted on never moves when prices do.
     */
    const layers = item.layers.map((layer, position) => {
      const material = layer.materialId ? costing.byId.get(layer.materialId) : undefined;
      const density = material?.density ? Number(material.density) : null;
      const micron = layer.micron;

      return {
        position: position + 1,
        materialId: material?.id ?? null,
        // A ply left unchosen is named rather than blank, so the stored line
        // still reads as a structure when someone opens it a year later.
        name: material?.name ?? 'Not chosen',
        micron,
        density,
        ratePerKg: costing.rateOfId(layer.materialId ?? null),
        gsm: density === null ? 0 : round(micron * density, 3),
      };
    });

    const material = computeMaterialCostPerKg({
      layers,
      inkRate: costing.inkRate,
      adhesiveRate: costing.adhesiveRate,
      inkGsm: costing.settings.inkGsm,
      adhesiveGsm: costing.settings.adhesiveGsm,
    });

    // Geometry holds for every quantity; only the money below changes.
    const geometry = computeItemGeometry(
      {
        layerCount: layers.length,
        micron: totalMicronForLayers(layers),
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        repeatWidth: item.repeatWidth,
        repeatHeight: item.repeatHeight,
        cylinderCount: item.cylinderCount,
        transportCost: item.transportCost,
        chargeCylinders: item.chargeCylinders,
      },
      rates.cylinderRate,
    );

    const quantities = item.quantities.map((quantity, position) => {
      const tier = computeTier(geometry.pouchesPerKg, { ...quantity, pricingBasis });

      /*
       * Cost and margin come from the tier, never from the raw input. A
       * per-pouch line leaves quantityKg and ratePerKg at zero — the office
       * types a pouch count and a rate per pouch, and the engine works the
       * weight and the equivalent rate back out. Reading the input here
       * multiplied the cost by zero and asked for a margin on a rate of zero.
       */
      return {
        position: position + 1,
        input: quantity,
        ...tier,
        materialCost:
          material.costPerKg === null ? null : round(material.costPerKg * tier.quantityKg, 2),
        marginPercent: computeMargin(tier.ratePerKg, material.costPerKg),
      };
    });

    return {
      input: item,
      position: index + 1,
      pricingBasis,
      layers,
      material,
      geometry,
      quantities,
    };
  });

  /*
   * One set of totals per quantity. The cylinders are the same figure in every
   * column — they do not scale with the order — which is what makes the
   * per-pouch price fall as the quantity rises.
   *
   * The schema guarantees every line carries the same number of quantities, so
   * the first line's count is the document's.
   */
  const tierCount = priced[0]?.quantities.length ?? 1;

  const tiers = Array.from({ length: tierCount }, (_, index) => {
    const lines = priced.map((entry) => ({
      quantityKg: entry.quantities[index]!.quantityKg,
      cylinderCount: entry.input.cylinderCount,
      totalAmount: entry.quantities[index]!.totalAmount,
      totalCylinderCost: entry.geometry.totalCylinderCost,
    }));

    const { totalCylinderCount: _cylinders, ...totals } = computeTotals(lines, rates);

    return {
      position: index + 1,
      ...totals,
      totalPouches: round(
        priced.reduce((sum, entry) => sum + entry.quantities[index]!.totalPouches, 0),
        2,
      ),
    };
  });

  return { priced, tiers };
}

/**
 * Next quotation number.
 *
 * The client's existing series is already past #118, so the counter starts
 * from the highest number present rather than from 1.
 */
/**
 * How many times to re-attempt a save that lost the race for a number.
 *
 * `nextQuotationNumber` reads MAX(number) + 1, and under Postgres' default READ
 * COMMITTED two saves landing together read the same maximum; one commits and
 * the other dies on the unique constraint, losing the user's work behind an
 * opaque 500.
 *
 * Retrying is the right shape of fix here. The number is the client's own paper
 * series, so it must stay sequential and gapless — a random id or a sequence
 * would not do. Serialising instead, with an advisory lock, was measurably
 * worse: holding a lock for the length of a transaction also pins a database
 * connection, so a burst exhausted the pool and failed even harder.
 *
 * Eight attempts is far more than an office of this size will ever need.
 */
const NUMBER_CLASH_RETRIES = 8;

/**
 * True when a write failed because another save took the number first.
 *
 * Prisma reports which column collided in two different places depending on how
 * it reached the database. Through a driver adapter — which this app uses — the
 * classic `meta.target` is absent and the field list sits under
 * `meta.driverAdapterError.cause.constraint.fields` instead. Both are checked,
 * so this keeps working if the adapter is ever dropped.
 *
 * Narrowing to the `number` column matters: `companyName` is unique too, and a
 * genuine duplicate-company error must surface rather than be retried eight
 * times and then surface anyway.
 */
function isQuotationNumberClash(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
    };
  };
  if (e?.code !== 'P2002') return false;

  const candidates = [e.meta?.target, e.meta?.driverAdapterError?.cause?.constraint?.fields];
  return candidates.some((c) => (Array.isArray(c) ? c.includes('number') : c === 'number'));
}

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
      include: QUOTATION_INCLUDE,
      /*
       * Work order, not date order: drafts need finishing, sent ones need
       * chasing, and won or lost are settled. So the list reads as a queue
       * with whatever still needs doing at the top.
       *
       * Sorting on the enum itself is enough — Postgres orders enum values by
       * the order they were declared, and QuotationStatus is declared
       * DRAFT, SENT, WON, LOST, which is exactly this sequence. Sorting in the
       * database rather than the page matters because the list is paginated;
       * re-ordering one page in the browser would only shuffle that page.
       */
      orderBy: [{ status: 'asc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);

  return { items: rows.map(toSummary), total };
}

export async function getQuotationById(id: string): Promise<Quotation> {
  const row = await prisma.quotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });
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
  const { priced, tiers } = priceQuotation(input.items, rates, costing);

  /*
   * Retried rather than serialised. Each attempt is a short, independent
   * transaction, so concurrent saves stay parallel and none of them holds a
   * database connection while waiting on another.
   */
  for (let attempt = 1; ; attempt += 1) {
    try {
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

        /*
         * The tiers are created with the quotation, because a line's quantities
         * point at them and nothing can reference a row that does not exist yet.
         * That ordering is the only reason this is three writes rather than one
         * nested tree.
         */
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
            terms: input.terms.length > 0 ? input.terms : DEFAULT_TERMS,
            notes: input.notes,
            ...(input.status === 'SENT' ? { sentAt: new Date() } : {}),
            tiers: { create: tiers },
          },
          select: { id: true, tiers: { select: { id: true, position: true } } },
        });

        const tierIdAt = new Map(created.tiers.map((tier) => [tier.position, tier.id]));

        for (const entry of priced) {
          await tx.quotationItem.create({
            data: {
              quotationId: created.id,
              position: entry.position,
              jobId: entry.input.jobId ?? null,
              jobName: entry.input.jobName,
              jobKind: entry.input.jobKind,
              pouchType: entry.input.pouchType,
              pouchTypeNote: entry.input.pouchTypeNote,
              widthMm: entry.input.widthMm,
              heightMm: entry.input.heightMm,
              pricingBasis: entry.pricingBasis,
              repeatWidth: entry.input.repeatWidth,
              repeatHeight: entry.input.repeatHeight,
              cylinderCount: entry.input.cylinderCount,
              transportCost: entry.input.transportCost,
              chargeCylinders: entry.input.chargeCylinders,
              // micron, pouchesPerKg and the four cylinder figures.
              ...entry.geometry,
              materialCostPerKg: entry.material.costPerKg,
              compositeGsm: entry.material.compositeGsm,

              layers: {
                create: entry.layers.map((layer) => ({
                  position: layer.position,
                  materialId: layer.materialId,
                  materialName: layer.name,
                  micron: layer.micron,
                  density: layer.density,
                  ratePerKg: layer.ratePerKg,
                  gsm: layer.gsm,
                })),
              },

              quantities: {
                create: entry.quantities.map((quantity) => ({
                  position: quantity.position,
                  tierId: tierIdAt.get(quantity.position)!,
                  /*
                   * Both units, always resolved rather than as typed. A per-kg
                   * line never fills the pouch pair in and a per-pouch line
                   * never fills the kilogram pair, but the film is ordered by
                   * weight and sold by the piece — every reader needs both.
                   */
                  quantityKg: quantity.quantityKg,
                  ratePerKg: quantity.ratePerKg,
                  quantityPouches: Math.round(quantity.totalPouches),
                  ratePerPouch: quantity.costPerPouch,
                  totalPouches: quantity.totalPouches,
                  totalAmount: quantity.totalAmount,
                  costPerPouch: quantity.costPerPouch,
                  materialCost: quantity.materialCost,
                  marginPercent: quantity.marginPercent,
                })),
              },
            },
            select: { id: true },
          });
        }

        return created.id;
      });

      return await getQuotationById(id);
    } catch (error) {
      if (!isQuotationNumberClash(error) || attempt >= NUMBER_CLASH_RETRIES) throw error;
      // Stagger the retries so two losers do not collide again in step.
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 25));
    }
  }
}

export async function updateQuotation(id: string, input: UpdateQuotationInput): Promise<Quotation> {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    include: QUOTATION_INCLUDE,
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

  const byPosition = <T extends { position: number }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.position - b.position);

  // Reprice from whichever line set applies — the new one if sent, else the stored one.
  const items: QuotationItemInput[] =
    input.items ??
    byPosition(existing.items).map((item) => ({
      jobId: item.jobId,
      jobName: item.jobName,
      jobKind: item.jobKind,
      pouchType: item.pouchType,
      pouchTypeNote: item.pouchTypeNote,
      widthMm: toNumber(item.widthMm),
      heightMm: toNumber(item.heightMm),
      layers: byPosition(item.layers).map((layer) => ({
        materialId: layer.materialId,
        micron: toNumber(layer.micron),
      })),
      /*
       * Fed back as stored, both units populated. Which pair is actually read
       * depends on the pricing basis, which is derived from the pouch style —
       * so handing back the derived half of the pair is harmless.
       */
      quantities: byPosition(item.quantities).map((quantity) => ({
        quantityKg: toNumber(quantity.quantityKg),
        ratePerKg: toNumber(quantity.ratePerKg),
        quantityPouches: quantity.quantityPouches,
        ratePerPouch: toNumber(quantity.ratePerPouch),
      })),
      repeatWidth: toNumber(item.repeatWidth),
      repeatHeight: toNumber(item.repeatHeight),
      cylinderCount: item.cylinderCount,
      transportCost: toNumber(item.transportCost),
      chargeCylinders: item.chargeCylinders,
    }));

  const costing = await loadCostingContext(input.date ?? toISODate(existing.date));
  const { priced, tiers } = priceQuotation(items, rates, costing);

  const becomingSent = input.status === 'SENT' && existing.status !== 'SENT';

  /*
   * Which quantity the customer accepted, remembered by position. The tiers are
   * about to be deleted and recreated, and the foreign key would quietly null
   * this out — losing the one fact that says what was actually agreed.
   */
  const wonPosition =
    existing.tiers.find((tier) => tier.id === existing.wonTierId)?.position ?? null;

  await prisma.$transaction(async (tx) => {
    /*
     * Lines and tiers are replaced wholesale: positions shift and both get
     * removed, so reconciling by id would be more fragile than rewriting the
     * set. Items go first — their layers and quantities cascade with them, and
     * a quantity also hangs off a tier, so nothing is left pointing at a row
     * that is about to disappear.
     */
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    await tx.quotationTier.deleteMany({ where: { quotationId: id } });

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
        tiers: { create: tiers },
      },
    });

    const rebuilt = await tx.quotationTier.findMany({
      where: { quotationId: id },
      select: { id: true, position: true },
    });
    const tierIdAt = new Map(rebuilt.map((tier) => [tier.position, tier.id]));

    for (const entry of priced) {
      await tx.quotationItem.create({
        data: {
          quotationId: id,
          position: entry.position,
          jobId: entry.input.jobId ?? null,
          jobName: entry.input.jobName,
          jobKind: entry.input.jobKind,
          pouchType: entry.input.pouchType,
          pouchTypeNote: entry.input.pouchTypeNote,
          widthMm: entry.input.widthMm,
          heightMm: entry.input.heightMm,
          pricingBasis: entry.pricingBasis,
          repeatWidth: entry.input.repeatWidth,
          repeatHeight: entry.input.repeatHeight,
          cylinderCount: entry.input.cylinderCount,
          transportCost: entry.input.transportCost,
          chargeCylinders: entry.input.chargeCylinders,
          ...entry.geometry,
          materialCostPerKg: entry.material.costPerKg,
          compositeGsm: entry.material.compositeGsm,

          layers: {
            create: entry.layers.map((layer) => ({
              position: layer.position,
              materialId: layer.materialId,
              materialName: layer.name,
              micron: layer.micron,
              density: layer.density,
              ratePerKg: layer.ratePerKg,
              gsm: layer.gsm,
            })),
          },

          quantities: {
            create: entry.quantities.map((quantity) => ({
              position: quantity.position,
              tierId: tierIdAt.get(quantity.position)!,
              quantityKg: quantity.quantityKg,
              ratePerKg: quantity.ratePerKg,
              quantityPouches: Math.round(quantity.totalPouches),
              ratePerPouch: quantity.costPerPouch,
              totalPouches: quantity.totalPouches,
              totalAmount: quantity.totalAmount,
              costPerPouch: quantity.costPerPouch,
              materialCost: quantity.materialCost,
              marginPercent: quantity.marginPercent,
            })),
          },
        },
        select: { id: true },
      });
    }

    // Re-point the accepted quantity at the tier that now holds that position.
    if (wonPosition !== null) {
      const wonTierId = tierIdAt.get(wonPosition) ?? null;
      await tx.quotation.update({ where: { id }, data: { wonTierId } });
    }
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

      /*
       * The jobs table predates stated plies: it has three fixed slots, for the
       * printed ply, an optional metallised one, and the sealant. Map the line's
       * structure onto them by position — outermost first, sealant last, and
       * anything between them into the middle slot. A four-ply laminate loses
       * its third ply here, which is the jobs table's limitation rather than the
       * quotation's; the quotation itself keeps every ply.
       */
      const plies = [...item.layers].sort((a, b) => a.position - b.position);
      const outer = plies[0] ?? null;
      const middle = plies.length >= 3 ? plies[1] : null;
      const sealant = plies.length >= 2 ? plies[plies.length - 1] : null;

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
          layer: plies.length,
          petMicron: outer?.micron ?? null,
          metPetMicron: middle?.micron ?? null,
          polyMicron: sealant?.micron ?? 0,
          designOpenWidth: item.widthMm,
          designHeight: item.heightMm,
          totalCylinders: item.cylinderCount,
          // Zero GSM means the ply's material had no density recorded, in which
          // case the line was never costed and there is nothing truthful to
          // store — null says that, 0 would read as "weighs nothing".
          petGsm: outer?.gsm || null,
          metPetGsm: middle?.gsm || null,
          polyGsm: sealant?.gsm || null,
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
