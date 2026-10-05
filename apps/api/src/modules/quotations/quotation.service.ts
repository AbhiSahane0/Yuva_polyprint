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
  type QuotationItemColour,
  type QuotationItemLayer,
  type QuotationItemQuantity,
  type QuotationTier,
  computeItemGeometry,
  structureGsm,
  adhesiveGsmFor,
  computeTier,
  overriddenRate,
  plyRatePerKg,
  resolveSelectedQuantity,
  totalMicronForLayers,
  type QuotationSummary,
  type QuotationEmail as QuotationEmailRecord,
  type RecordOutcomeInput,
  type RecordOutcomeResult,
  type SendQuotationInput,
  type SendQuotationResult,
  type UpdateQuotationInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ordersFromQuotation } from '../orders/order.service.js';
import { ApiError } from '../../utils/api-error.js';
import { getSettings } from '../settings/settings.service.js';
import { getRateMap } from '../materials/material.service.js';
import { nextJobCode } from '../customers/customer.service.js';
import { jobDataFromQuotationItem } from './quotation-job.js';
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
      colours: { orderBy: { position: 'asc' } },
      quantities: { orderBy: { position: 'asc' } },
      repairs: { orderBy: { position: 'asc' } },
    },
  },
} as const;

type QuotationRow = Prisma.QuotationGetPayload<{ include: typeof QUOTATION_INCLUDE }>;
type ItemRow = QuotationRow['items'][number];

/**
 * One ink, as it was priced.
 *
 * Every figure comes off the row rather than from the ink it names: a quotation
 * has to say what it quoted, and the rate on the price list will have moved.
 * The material link is there so somebody can still get back to the ink — and is
 * null on a special, which names none.
 */
function toColour(row: ItemRow['colours'][number]): QuotationItemColour {
  return {
    id: row.id,
    position: row.position,
    materialId: row.materialId,
    name: row.name,
    kind: row.kind,
    laydownGsm: toNumber(row.laydownGsm),
    solidsPercent: toNumber(row.solidsPercent),
    ratePerKg: toNumber(row.ratePerKg),
  };
}

function toLayer(row: ItemRow['layers'][number]): QuotationItemLayer {
  return {
    position: row.position,
    materialId: row.materialId,
    materialName: row.materialName,
    micron: toNumber(row.micron),
    density: row.density === null ? null : Number(row.density),
    ratePerKg: row.ratePerKg === null ? null : Number(row.ratePerKg),
    /*
     * What the office typed, or null to follow the film's own rate.
     *
     * Rows written before the column existed hold null whatever was typed, so
     * they fall back to the gauge inference that was all there ever was — which
     * keeps every quotation already saved reading exactly as it did.
     */
    rateOverride:
      row.rateOverride !== null
        ? Number(row.rateOverride)
        : overriddenRate({
            materialName: row.materialName,
            micron: toNumber(row.micron),
            ratePerKg: row.ratePerKg === null ? null : Number(row.ratePerKg),
          }),
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
    isGazette: row.isGazette,
    hasDPunch: row.hasDPunch,
    hasVNotch: row.hasVNotch,
    gazetteBottom: toNumber(row.gazetteBottom),
    gazetteLeft: toNumber(row.gazetteLeft),
    gazetteRight: toNumber(row.gazetteRight),
    filmWidthMm: toNumber(row.filmWidthMm),
    filmHeightMm: toNumber(row.filmHeightMm),
    pricingBasis: row.pricingBasis,
    repeatWidth: toNumber(row.repeatWidth),
    repeatHeight: toNumber(row.repeatHeight),
    cylinderCount: row.cylinderCount,
    transportCost: toNumber(row.transportCost),
    chargeCylinders: row.chargeCylinders,
    repairCylinders: row.repairCylinders,
    repairs: byPosition(row.repairs ?? []).map((repair) => ({
      cylinderId: repair.cylinderId,
      position: repair.position,
      code: repair.code,
      colour: repair.colour,
      cost: toNumber(repair.cost),
    })),
    micron: toNumber(row.micron),
    pouchesPerKg: toNumber(row.pouchesPerKg),
    cylinderWidth: toNumber(row.cylinderWidth),
    cylinderCircumference: toNumber(row.cylinderCircumference),
    costPerCylinder: toNumber(row.costPerCylinder),
    totalCylinderCost: toNumber(row.totalCylinderCost),
    materialCostPerKg: row.materialCostPerKg === null ? null : Number(row.materialCostPerKg),
    compositeGsm: toNumber(row.compositeGsm),
    layers: row.layers.map(toLayer),
    colours: row.colours.map(toColour),
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
/**
 * The quantity a quotation's headline figures are taken from.
 *
 * The one the customer accepted, if they have; otherwise **the one the document
 * was written for**. It used to fall back to the first tier, which was the same
 * thing only while every quantity was printed — now that the office picks which
 * one the customer sees, the list would otherwise show a total off a column
 * that was never sent.
 */
function headlineTier(row: {
  wonTierId: string | null;
  selectedQuantity: number;
  tiers: QuotationRow['tiers'];
}) {
  const won = row.tiers.find((t) => t.id === row.wonTierId);
  if (won) return won;

  const byPosition = [...row.tiers].sort((a, b) => a.position - b.position);
  const chosen = resolveSelectedQuantity(row.selectedQuantity, byPosition.length);
  return byPosition[chosen - 1] ?? byPosition[0] ?? null;
}

/**
 * Everything needed to cost a line against a given day's prices: the rate in
 * force per material, and each film's density so a micron figure can become a
 * weight.
 */
async function loadCostingContext(onDate: string) {
  const [settings, rates, materials] = await Promise.all([
    /* The overheads the works held then, not the ones it holds now. */
    getSettings(onDate),
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

/** Child rows come back in insertion order otherwise, which is not their order. */
const byPosition = <T extends { position: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);

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
    selectedQuantity: row.selectedQuantity,
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
    referredBy: row.referredBy,
    enquiryFrom: row.enquiryFrom,
    generatedThrough: row.generatedThrough,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    lostReason: row.lostReason,
    marginPercent: row.marginPercent === null ? null : toNumber(row.marginPercent),
    transportPerKg: row.transportPerKg === null ? null : toNumber(row.transportPerKg),
    pouchMakingPerKg: row.pouchMakingPerKg === null ? null : toNumber(row.pouchMakingPerKg),
    wastagePercent: row.wastagePercent === null ? null : toNumber(row.wastagePercent),
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
     * How the line is sold, as the office chose it on the form. The schema has
     * already resolved it: a line that did not say takes the convention for its
     * style, and a roll is forced to weight whatever the request asked for,
     * because a reel has no pouches to count.
     */
    const pricingBasis = item.pricingBasis;

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
        /*
         * The film's own rate, unless the office agreed one for this job.
         *
         * Shared with the form, so what was on screen is what gets stored. The
         * gauge does not enter into it: the works keeps one rate per film and
         * pays it at every thickness. See `plyRatePerKg`.
         */
        ratePerKg: plyRatePerKg({
          materialName: material?.name ?? null,
          stockRate: costing.rateOfId(layer.materialId ?? null),
          override: layer.rateOverride ?? null,
        }),
        /*
         * Stored as well as applied, so reopening the quotation knows a rate
         * was agreed for this job rather than having to deduce it from the
         * gauge. Deducing it lost every rate typed at the film's OWN gauge —
         * the works agrees PET at 185, 175 and 190, all of them 12µ.
         */
        rateOverride: layer.rateOverride ?? null,
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
        /* Each ply at its own density, as the works' sheet weighs it. */
        gsm: structureGsm(layers, {
          inkGsm: costing.settings.inkGsm,
          adhesiveGsm: adhesiveGsmFor(layers, {
            thinGsm: costing.settings.adhesiveCoatThinGsm,
            thickGsm: costing.settings.adhesiveCoatThickGsm,
            thickPlyMicron: costing.settings.adhesiveThickPlyMicron,
          }),
        }),
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        // Film on a reel is not pouches; the engine reports zero rather than a
        // confident count of something that does not exist.
        makesPouches: item.jobKind !== 'ROLL',
        gazette: item.isGazette
          ? {
              bottom: item.gazetteBottom,
              left: item.gazetteLeft,
              right: item.gazetteRight,
            }
          : undefined,
        repeatWidth: item.repeatWidth,
        repeatHeight: item.repeatHeight,
        cylinderCount: item.cylinderCount,
        transportCost: item.transportCost,
        chargeCylinders: item.chargeCylinders,
        /* Charged whether or not a new set is — see `computeItemGeometry`. */
        repairs: item.repairCylinders ? item.repairs : [],
        /* The engraver's mounting margin, from the Costing screen. */
        mountingMm: costing.settings.cylinderMountingMm,
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

/**
 * How the list is ordered.
 *
 * With no `sort` asked for, **work order**: drafts need finishing, sent ones
 * need chasing, and won or lost are settled — so the list reads as a queue with
 * whatever still needs doing at the top. Sorting on the enum is enough, because
 * Postgres orders enum values by declaration and QuotationStatus is declared
 * DRAFT, SENT, WON, LOST, which is exactly that sequence.
 *
 * Ordering happens **in the database, not the page**. The list is paginated, so
 * re-sorting in the browser would only shuffle the twenty-five rows on screen
 * and quietly lie about which quotation is the oldest.
 *
 * Every sort carries `number: 'desc'` behind it as a tie-break. Without one,
 * two quotations sharing a date — which is most of them, the office writes
 * several a day — have no defined order, and Postgres is free to return them
 * differently on each page. That reads as rows jumping about while paging.
 */
export function listOrderBy(
  query: ListQuotationsQuery,
): Prisma.QuotationOrderByWithRelationInput[] {
  /*
   * **Newest first, by the date on the document.**
   *
   * It used to lead on status — every draft, then every sent one, then the won
   * and the lost — which put a quotation written this morning below eleven
   * from last year because D sorts before S. The office opens this screen to
   * find what they wrote today.
   *
   * The number breaks a tie because two quotations written on one day are
   * ordered by which was raised second, and `id` after that so the page
   * boundary is stable when even those collide.
   */
  if (!query.sort) return [{ date: 'desc' }, { number: 'desc' }, { id: 'desc' }];

  const dir = query.dir ?? 'asc';
  if (query.sort === 'number') return [{ number: dir }];

  /*
   * The snapshot on the quotation, not the customer's current name. It is what
   * the row displays, and a quotation keeps the name it was issued under even
   * after the customer master is corrected — sorting by the live name would
   * order the list by something not on screen.
   */
  return [{ [query.sort]: dir }, { number: 'desc' }];
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

  /*
   * Only the current version of each number. A revision keeps the number, so
   * without this the list grows a second row every time somebody reprices —
   * and two rows reading "121" with different totals is precisely the confusion
   * versioning exists to prevent. Superseded versions are still reachable
   * through GET /quotations/:id/versions.
   */
  filters.push({ isLatest: true });

  const where: Prisma.QuotationWhereInput = { AND: filters };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: QUOTATION_INCLUDE,
      orderBy: listOrderBy(query),
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
  /* Dated, so a quotation written up for an older day carries that day's rates. */
  const settings = await getSettings(input.date);
  const rates = {
    cylinderRate: input.cylinderRate ?? settings.cylinderRate,
    gstPercent: input.gstPercent ?? settings.gstPercent,
    materialAdvancePercent: input.materialAdvancePercent ?? settings.materialAdvancePercent,
    cylinderAdvancePercent: input.cylinderAdvancePercent ?? settings.cylinderAdvancePercent,
  };

  /*
   * Null rather than the works' figure, so a quotation that never overrode one
   * follows the Costing screen as it changes rather than freezing the number
   * that happened to be there the day it was written.
   */
  const costingOverrides = {
    marginPercent: input.marginPercent ?? null,
    transportPerKg: input.transportPerKg ?? null,
    pouchMakingPerKg: input.pouchMakingPerKg ?? null,
    wastagePercent: input.wastagePercent ?? null,
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
        let customerWasCreated = false;

        if (customerId === null && input.saveAsCustomer) {
          const existing = await tx.customer.findUnique({
            where: { companyName: input.customerName },
            select: { id: true },
          });

          if (existing) {
            customerId = existing.id;
          } else {
            /*
             * The three address lines map back one-for-one, because that is how
             * they were filled in: line 1 is the street address, line 2 the
             * city, line 3 the district. They used to be joined into a single
             * `address`, which meant a company created here and reopened showed
             * the whole address in one box and an empty City — the form's own
             * prefill reads them apart again.
             */
            const created = await tx.customer.create({
              data: {
                companyName: input.customerName,
                address: input.addressLine1 || 'NA',
                city: input.addressLine2 || 'NA',
                district: input.addressLine3 || 'NA',
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
            });
            customerId = created.id;
            customerWasCreated = true;
          }
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
            referredBy: input.referredBy,
            enquiryFrom: input.enquiryFrom,
            generatedThrough: input.generatedThrough,
            // Clamped against the quantities that actually arrived — see
            // `resolveSelectedQuantity`.
            selectedQuantity: resolveSelectedQuantity(input.selectedQuantity, tiers.length),
            ...rates,
            ...costingOverrides,
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
              isGazette: entry.input.isGazette,
              hasDPunch: entry.input.hasDPunch,
              hasVNotch: entry.input.hasVNotch,
              gazetteBottom: entry.input.gazetteBottom,
              gazetteLeft: entry.input.gazetteLeft,
              gazetteRight: entry.input.gazetteRight,
              pricingBasis: entry.pricingBasis,
              repeatWidth: entry.input.repeatWidth,
              repeatHeight: entry.input.repeatHeight,
              cylinderCount: entry.input.cylinderCount,
              transportCost: entry.input.transportCost,
              chargeCylinders: entry.input.chargeCylinders,
              repairCylinders: entry.input.repairCylinders,
              repairs: {
                create: (entry.input.repairCylinders ? entry.input.repairs : []).map(
                  (repair, position) => ({
                    cylinderId: repair.cylinderId,
                    position: position + 1,
                    code: repair.code,
                    colour: repair.colour,
                    cost: repair.cost,
                  }),
                ),
              },
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
                  rateOverride: layer.rateOverride,
                  gsm: layer.gsm,
                })),
              },

              colours: {
                create: (entry.input.colours ?? []).map((colour, index) => ({
                  position: index + 1,
                  materialId: colour.materialId,
                  name: colour.name,
                  kind: colour.kind,
                  laydownGsm: colour.laydownGsm,
                  solidsPercent: colour.solidsPercent,
                  ratePerKg: colour.ratePerKg,
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

        /*
         * A new company's designs join their record with the quotation.
         *
         * For an existing customer the wizard already does this as the office
         * steps past each line. A new company has no record to attach to until
         * this transaction creates one, so it happens here instead — otherwise
         * the two paths would disagree, and a customer created from a quotation
         * would arrive with no jobs at all.
         *
         * Idempotent by name within the customer, like the wizard's endpoint:
         * two lines quoting the same design write one row, and re-saving does
         * not add a second.
         */
        if (customerId !== null && customerWasCreated) {
          const takenCodes = new Set<string>();
          const written = new Set<string>();

          for (const item of priced) {
            const name = item.input.jobName.trim();
            const key = name.toLowerCase();
            if (name.length === 0 || written.has(key)) continue;
            written.add(key);

            /*
             * Assembled into the shape the shared mapper reads, so a job created
             * here is identical to one created when a quotation is won. The
             * plies carry their costed GSM, which is the one thing the raw input
             * does not know.
             */
            await tx.job.create({
              data: {
                ...jobDataFromQuotationItem({
                  jobName: name,
                  jobKind: item.input.jobKind,
                  pouchType: item.input.pouchType,
                  widthMm: item.geometry.filmWidthMm,
                  heightMm: item.geometry.filmHeightMm,
                  cylinderCount: item.input.cylinderCount,
                  pouchesPerKg: item.geometry.pouchesPerKg,
                  layers: item.layers.map((layer, position) => ({
                    position: position + 1,
                    micron: layer.micron,
                    gsm: layer.gsm,
                  })),
                } as unknown as QuotationItem),
                jobCode: await nextJobCode(tx, takenCodes),
                customerId,
              },
            });
          }
        }

        return created.id;
      }, TX);

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

  /*
   * An override the update did not mention keeps what it had. Null is a real
   * value here — "follow the works' figure" — so it cannot be told apart from
   * "unchanged" by looking at the stored row alone, and the input is what
   * decides.
   */
  const nullable = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value);
  const costingOverrides = {
    marginPercent:
      input.marginPercent !== undefined ? input.marginPercent : nullable(existing.marginPercent),
    transportPerKg:
      input.transportPerKg !== undefined ? input.transportPerKg : nullable(existing.transportPerKg),
    pouchMakingPerKg:
      input.pouchMakingPerKg !== undefined
        ? input.pouchMakingPerKg
        : nullable(existing.pouchMakingPerKg),
    wastagePercent:
      input.wastagePercent !== undefined ? input.wastagePercent : nullable(existing.wastagePercent),
  };

  // Reprice from whichever line set applies — the new one if sent, else the stored one.
  const items: QuotationItemInput[] =
    input.items ??
    byPosition(existing.items).map((item) => ({
      jobId: item.jobId,
      jobName: item.jobName,
      jobKind: item.jobKind,
      pouchType: item.pouchType,
      pouchTypeNote: item.pouchTypeNote,
      /*
       * Carried through explicitly. It used to be re-derived from the style on
       * every reprice, which was harmless while the style was the only thing
       * that decided it — now that the office chooses, dropping it here would
       * flip a standup pouch sold by the kilogram back to per-piece on any
       * patch that did not resend the lines.
       */
      pricingBasis: item.pricingBasis,
      /*
       * And the colours, for the same reason again. A PATCH that does not
       * resend the lines must reprice on the inks the quotation was written
       * with — re-reading them from the price list would quietly move the rate
       * every time a rate changed, on a document already sent.
       */
      colours: item.colours.map((colour) => ({
        name: colour.name,
        kind: colour.kind,
        materialId: colour.materialId,
        laydownGsm: toNumber(colour.laydownGsm),
        solidsPercent: toNumber(colour.solidsPercent),
        ratePerKg: toNumber(colour.ratePerKg),
      })),
      widthMm: toNumber(item.widthMm),
      heightMm: toNumber(item.heightMm),
      /*
       * Carried through for the same reason pricingBasis is: this path reprices
       * from storage when a PATCH does not resend the lines, and a gusset
       * dropped here would quietly reprice a gazette pouch as a flat bag.
       */
      isGazette: item.isGazette,
      hasDPunch: item.hasDPunch,
      hasVNotch: item.hasVNotch,
      gazetteBottom: toNumber(item.gazetteBottom),
      gazetteLeft: toNumber(item.gazetteLeft),
      gazetteRight: toNumber(item.gazetteRight),
      layers: byPosition(item.layers).map((layer) => ({
        materialId: layer.materialId,
        micron: toNumber(layer.micron),
        /*
         * A rate the office typed cannot be looked up again, so it is carried.
         *
         * This path reprices from storage when a PATCH does not resend the
         * lines. Every other figure can be re-derived from the material; a rate
         * agreed for this job cannot be, and dropping it here would silently
         * reprice the ply at the catalogue price on the next unrelated edit.
         *
         * The stored column where there is one; the old gauge inference for
         * rows written before it existed.
         */
        rateOverride:
          layer.rateOverride !== null
            ? toNumber(layer.rateOverride)
            : overriddenRate({
                materialName: layer.materialName,
                micron: toNumber(layer.micron),
                ratePerKg: layer.ratePerKg === null ? null : toNumber(layer.ratePerKg),
              }),
      })),
      /*
       * Fed back as stored, both units populated. Which pair is actually read
       * depends on the pricing basis above, so handing back the derived half of
       * the pair is harmless.
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
      repairCylinders: item.repairCylinders,
      repairs: byPosition(item.repairs).map((repair) => ({
        cylinderId: repair.cylinderId,
        code: repair.code,
        colour: repair.colour,
        cost: toNumber(repair.cost),
      })),
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
        ...(input.referredBy !== undefined ? { referredBy: input.referredBy } : {}),
        ...(input.enquiryFrom !== undefined ? { enquiryFrom: input.enquiryFrom } : {}),
        ...(input.generatedThrough !== undefined
          ? { generatedThrough: input.generatedThrough }
          : {}),
        ...(input.terms ? { terms: input.terms } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        selectedQuantity: resolveSelectedQuantity(
          input.selectedQuantity ?? existing.selectedQuantity,
          tiers.length,
        ),
        ...(becomingSent ? { sentAt: new Date() } : {}),
        ...rates,
        ...costingOverrides,
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
          isGazette: entry.input.isGazette,
          hasDPunch: entry.input.hasDPunch,
          hasVNotch: entry.input.hasVNotch,
          gazetteBottom: entry.input.gazetteBottom,
          gazetteLeft: entry.input.gazetteLeft,
          gazetteRight: entry.input.gazetteRight,
          pricingBasis: entry.pricingBasis,
          repeatWidth: entry.input.repeatWidth,
          repeatHeight: entry.input.repeatHeight,
          cylinderCount: entry.input.cylinderCount,
          transportCost: entry.input.transportCost,
          chargeCylinders: entry.input.chargeCylinders,
          repairCylinders: entry.input.repairCylinders,
          repairs: {
            create: (entry.input.repairCylinders ? entry.input.repairs : []).map(
              (repair, position) => ({
                cylinderId: repair.cylinderId,
                position: position + 1,
                code: repair.code,
                colour: repair.colour,
                cost: repair.cost,
              }),
            ),
          },
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
              rateOverride: layer.rateOverride,
              gsm: layer.gsm,
            })),
          },

          colours: {
            create: (entry.input.colours ?? []).map((colour, index) => ({
              position: index + 1,
              materialId: colour.materialId,
              name: colour.name,
              kind: colour.kind,
              laydownGsm: colour.laydownGsm,
              solidsPercent: colour.solidsPercent,
              ratePerKg: colour.ratePerKg,
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
  }, TX);

  return getQuotationById(id);
}

/**
 * A revision of an existing quotation.
 *
 * The office reprices rather than renumbers. The customer already has QUO-124
 * on their desk, and a second document with a different number reads as a
 * second offer rather than a corrected one — so a revision keeps the number and
 * takes the next version, and only the newest of them appears in the list.
 *
 * Everything is copied exactly as it stands: plies, quantities, tiers, totals,
 * the rates it was costed against and the date it carries. Nothing is repriced
 * on the way in, because pressing "new version" should not silently move a
 * figure the customer has already been quoted. It reprices on the first save,
 * against whatever date the revision then carries — which is the point at which
 * the office has decided what they are changing.
 */
export async function createQuotationVersion(id: string): Promise<Quotation> {
  const source = await prisma.quotation.findUnique({
    where: { id },
    include: QUOTATION_INCLUDE,
  });
  if (!source) throw ApiError.notFound('Quotation not found');

  /* Every revision hangs off the first version, not off the one it was made from. */
  const rootId = source.rootId ?? source.id;

  /*
   * Retried on a clash, the same as a new quotation. Two people revising the
   * same document at once both read the same highest version, and one of them
   * loses on the (number, version) constraint.
   */
  for (let attempt = 1; ; attempt += 1) {
    try {
      const createdId = await prisma.$transaction(async (tx) => {
        const latest = await tx.quotation.findFirst({
          where: { number: source.number },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latest?.version ?? source.version) + 1;

        // Exactly one version of a number is ever the current one.
        await tx.quotation.updateMany({
          where: { number: source.number },
          data: { isLatest: false },
        });

        const created = await tx.quotation.create({
          data: {
            number: source.number,
            version,
            rootId,
            isLatest: true,
            /*
             * A revision starts as a draft. It has not been sent, and the answer
             * recorded against the version it came from is not its answer —
             * carrying either across would misreport what the customer agreed.
             */
            status: 'DRAFT',
            date: source.date,
            customerId: source.customerId,
            customerName: source.customerName,
            addressLine1: source.addressLine1,
            addressLine2: source.addressLine2,
            addressLine3: source.addressLine3,
            mobile: source.mobile,
            email: source.email,
            gstNumber: source.gstNumber,
            /* A revision is the same enquiry repriced, so whoever sent it comes
               across with the rest of the customer block. */
            referredBy: source.referredBy,
            enquiryFrom: source.enquiryFrom,
            generatedThrough: source.generatedThrough,
            cylinderRate: source.cylinderRate,
            gstPercent: source.gstPercent,
            materialAdvancePercent: source.materialAdvancePercent,
            cylinderAdvancePercent: source.cylinderAdvancePercent,
            terms: source.terms,
            notes: source.notes,
            tiers: {
              create: byPosition(source.tiers).map((tier) => ({
                position: tier.position,
                materialSubtotal: tier.materialSubtotal,
                materialWithGst: tier.materialWithGst,
                cylinderSubtotal: tier.cylinderSubtotal,
                cylinderWithGst: tier.cylinderWithGst,
                grandSubtotal: tier.grandSubtotal,
                grandWithGst: tier.grandWithGst,
                materialAdvance: tier.materialAdvance,
                cylinderAdvance: tier.cylinderAdvance,
                totalAdvance: tier.totalAdvance,
                totalQuantityKg: tier.totalQuantityKg,
                totalPouches: tier.totalPouches,
              })),
            },
          },
          select: { id: true, tiers: { select: { id: true, position: true } } },
        });

        const tierIdAt = new Map(created.tiers.map((tier) => [tier.position, tier.id]));

        for (const item of byPosition(source.items)) {
          await tx.quotationItem.create({
            data: {
              quotationId: created.id,
              position: item.position,
              jobId: item.jobId,
              jobName: item.jobName,
              jobKind: item.jobKind,
              pouchType: item.pouchType,
              pouchTypeNote: item.pouchTypeNote,
              widthMm: item.widthMm,
              heightMm: item.heightMm,
              isGazette: item.isGazette,
              hasDPunch: item.hasDPunch,
              hasVNotch: item.hasVNotch,
              gazetteBottom: item.gazetteBottom,
              gazetteLeft: item.gazetteLeft,
              gazetteRight: item.gazetteRight,
              filmWidthMm: item.filmWidthMm,
              filmHeightMm: item.filmHeightMm,
              pricingBasis: item.pricingBasis,
              repeatWidth: item.repeatWidth,
              repeatHeight: item.repeatHeight,
              cylinderCount: item.cylinderCount,
              transportCost: item.transportCost,
              chargeCylinders: item.chargeCylinders,
              repairCylinders: item.repairCylinders,
              repairs: {
                create: byPosition(item.repairs).map((repair) => ({
                  cylinderId: repair.cylinderId,
                  position: repair.position,
                  code: repair.code,
                  colour: repair.colour,
                  cost: repair.cost,
                })),
              },
              micron: item.micron,
              pouchesPerKg: item.pouchesPerKg,
              cylinderWidth: item.cylinderWidth,
              cylinderCircumference: item.cylinderCircumference,
              costPerCylinder: item.costPerCylinder,
              totalCylinderCost: item.totalCylinderCost,
              materialCostPerKg: item.materialCostPerKg,
              compositeGsm: item.compositeGsm,
              layers: {
                create: byPosition(item.layers).map((layer) => ({
                  position: layer.position,
                  materialId: layer.materialId,
                  materialName: layer.materialName,
                  micron: layer.micron,
                  density: layer.density,
                  ratePerKg: layer.ratePerKg,
                  gsm: layer.gsm,
                })),
              },
              /* Carried across as it was priced, not re-read: a revision of a
                 quotation has to say what the original said. */
              colours: {
                create: byPosition(item.colours).map((colour) => ({
                  position: colour.position,
                  materialId: colour.materialId,
                  name: colour.name,
                  kind: colour.kind,
                  laydownGsm: colour.laydownGsm,
                  solidsPercent: colour.solidsPercent,
                  ratePerKg: colour.ratePerKg,
                })),
              },
              quantities: {
                create: byPosition(item.quantities).map((quantity) => ({
                  position: quantity.position,
                  tierId: tierIdAt.get(quantity.position)!,
                  quantityKg: quantity.quantityKg,
                  ratePerKg: quantity.ratePerKg,
                  quantityPouches: quantity.quantityPouches,
                  ratePerPouch: quantity.ratePerPouch,
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
      }, TX);

      return await getQuotationById(createdId);
    } catch (error) {
      if (!isQuotationNumberClash(error) || attempt >= NUMBER_CLASH_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 25));
    }
  }
}

/** Every version of one quotation number, newest first. */
export async function listQuotationVersions(id: string): Promise<QuotationSummary[]> {
  const source = await prisma.quotation.findUnique({
    where: { id },
    select: { number: true },
  });
  if (!source) throw ApiError.notFound('Quotation not found');

  const rows = await prisma.quotation.findMany({
    where: { number: source.number },
    orderBy: { version: 'desc' },
    include: QUOTATION_INCLUDE,
  });
  return rows.map(toSummary);
}

export async function deleteQuotation(id: string): Promise<{ id: string }> {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, number: true, version: true, isLatest: true, rootId: true },
  });
  if (!existing) throw ApiError.notFound('Quotation not found');

  await prisma.$transaction(async (tx) => {
    /*
     * Revisions hang off the first version through a cascading foreign key, so
     * deleting the root would take every later version with it — somebody
     * tidying away an old v1 would silently destroy the live v3. Re-parent
     * first: the oldest survivor becomes the root and the rest follow it, and
     * the cascade then has nothing to reach.
     */
    if (existing.rootId === null) {
      const heir = await tx.quotation.findFirst({
        where: { rootId: id },
        orderBy: { version: 'asc' },
        select: { id: true },
      });
      if (heir) {
        await tx.quotation.update({ where: { id: heir.id }, data: { rootId: null } });
        await tx.quotation.updateMany({ where: { rootId: id }, data: { rootId: heir.id } });
      }
    }

    // Items, layers, quantities and tiers all cascade with the quotation.
    await tx.quotation.delete({ where: { id } });

    /*
     * Exactly one version of a number is the current one, and the list shows
     * only that. Deleting the current one has to promote the highest survivor,
     * or the number disappears from the list while its earlier versions sit
     * there unreachable.
     */
    if (existing.isLatest) {
      const survivor = await tx.quotation.findFirst({
        where: { number: existing.number },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (survivor) {
        await tx.quotation.update({ where: { id: survivor.id }, data: { isLatest: true } });
      }
    }
  }, TX);

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
        /*
         * Recorded, not delivered.
         *
         * `whatsappSentAt` stays null until a provider actually accepts a
         * message, so this row reads as "meant for these numbers, not yet
         * sent". Writing a timestamp here to keep the columns tidy would make
         * the history claim a delivery that never happened.
         */
        whatsappTo: input.whatsappTo,
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
    whatsappTo: row.whatsappTo,
    whatsappSentAt: row.whatsappSentAt ? row.whatsappSentAt.toISOString() : null,
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
      ordersCreated: [],
      ordersSkipped: [],
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

    /*
     * Jobs the wizard already created, matched by id. The office now saves a
     * new design as it steps past it, so most won quotations arrive here with
     * their jobs already on record. Matching on name alone would miss one that
     * was renamed after it was saved, and create a second copy of it.
     */
    const heldIds = new Set(
      (await tx.job.findMany({ where: { customerId }, select: { id: true } })).map((job) => job.id),
    );

    for (const item of quotation.items) {
      if (item.jobId && heldIds.has(item.jobId)) {
        jobsSkipped.push(item.jobName);
        continue;
      }

      const key = item.jobName.trim().toLowerCase();
      if (heldNames.has(key)) {
        jobsSkipped.push(item.jobName);
        continue;
      }
      heldNames.add(key);

      await tx.job.create({
        data: {
          ...jobDataFromQuotationItem(item),
          jobCode: await nextJobCode(tx, takenCodes),
          customerId,
        },
      });
      jobsCreated.push(item.jobName);
    }

    await tx.quotation.update({
      where: { id },
      data: { status: 'WON', lostReason: '', decidedAt, customerId },
    });

    /*
     * And the orders — one per line, inside the same transaction.
     *
     * A quotation that ends up WON with nothing behind it is the failure this
     * placement prevents: the office would see a won document, no order, and no
     * reason to think anything was missing. Idempotent like the jobs above, so
     * winning twice creates nothing the second time and says which lines it
     * already had orders for.
     */
    const orders = await ordersFromQuotation(tx, id);

    return {
      status: 'WON' as const,
      customerId,
      customerCreated,
      jobsCreated,
      jobsSkipped,
      ordersCreated: orders.created,
      ordersSkipped: orders.skipped,
    };
  }, TX);
}
