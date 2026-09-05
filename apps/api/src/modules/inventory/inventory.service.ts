import {
  batchValue,
  convertQuantity,
  convertRate,
  needsAttention,
  round,
  signedQuantity,
  stockHealth,
  type AdjustStockInput,
  type IssueStockInput,
  type ListStockQuery,
  type MaterialStock,
  type ReceiveStockInput,
  type SetReorderLevelInput,
  type StockBatch,
  type StockList,
  type StockMovement,
  type StockSummary,
  type TransferStockInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Stock, as a ledger.
 *
 * Every change is a movement row, and what is on hand is the sum of them.
 * `stock_batches.quantity` is a cache of that sum, written inside the same
 * transaction as the movement so the two cannot drift — `reconcile` proves it
 * and the tests call it.
 *
 * Nothing here updates or deletes a movement. The balance stored on every later
 * row would be wrong, and a stock ledger that can be rewritten answers nothing.
 * A mistake is corrected by an ADJUSTMENT, which leaves both the error and the
 * correction on the record.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

const toNullableNumber = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

/** yyyy-mm-dd, matching the rest of the app's date handling. */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** DATE columns are stored at UTC midnight, which has no DST, so this is exact. */
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * The rate a material is currently priced at, for materials in one go.
 *
 * The rates table is a history, so "current" is the newest row on or before
 * today. Fetched for the whole page at once rather than per material — a
 * per-row lookup on a list of eighty-six materials is eighty-six queries.
 */
async function currentRates(materialIds: string[]): Promise<Map<string, number | null>> {
  if (materialIds.length === 0) return new Map();

  const rows = await prisma.materialRate.findMany({
    where: { materialId: { in: materialIds }, effectiveDate: { lte: new Date() } },
    orderBy: [{ materialId: 'asc' }, { effectiveDate: 'desc' }],
    select: { materialId: true, rate: true, effectiveDate: true },
  });

  const rates = new Map<string, number | null>();
  // Ordered newest-first per material, so the first one seen wins.
  for (const row of rows)
    if (!rates.has(row.materialId)) rates.set(row.materialId, Number(row.rate));
  return rates;
}

type BatchRow = Prisma.StockBatchGetPayload<{
  include: { material: { select: { name: true; unit: true } } };
}>;

function toBatch(row: BatchRow, currentRate: number | null): StockBatch {
  const quantity = toNumber(row.quantity);
  const ratePerUnit = toNullableNumber(row.ratePerUnit);
  return {
    id: row.id,
    materialId: row.materialId,
    materialName: row.material.name,
    unit: row.material.unit,
    batchCode: row.batchCode,
    location: row.location,
    receivedOn: toISODate(row.receivedOn),
    initialQuantity: toNumber(row.initialQuantity),
    quantity,
    purchaseQuantity: toNullableNumber(row.purchaseQuantity),
    purchaseUnit: row.purchaseUnit,
    ratePerUnit,
    reference: row.reference,
    notes: row.notes,
    value: batchValue(quantity, ratePerUnit, currentRate),
    createdAt: row.createdAt.toISOString(),
  };
}

type MovementRow = Prisma.StockMovementGetPayload<{
  include: { batch: { select: { batchCode: true } }; job: { select: { jobName: true } } };
}>;

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    batchId: row.batchId,
    batchCode: row.batch.batchCode,
    materialId: row.materialId,
    kind: row.kind,
    quantity: toNumber(row.quantity),
    balanceAfter: toNumber(row.balanceAfter),
    jobId: row.jobId,
    jobName: row.job?.jobName ?? null,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    reference: row.reference,
    notes: row.notes,
    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The material's total across every batch, and the batch's own total.
 *
 * Read inside the writing transaction, so two people receiving at once cannot
 * both compute a balance from the same starting figure. Postgres serialises the
 * two transactions on the batch row each of them updates.
 */
async function totalsFor(tx: Prisma.TransactionClient, materialId: string): Promise<number> {
  const result = await tx.stockBatch.aggregate({
    where: { materialId },
    _sum: { quantity: true },
  });
  return round(toNumber(result._sum.quantity), 3);
}

/**
 * Writes one movement and moves the cached quantity with it.
 *
 * The only path that changes stock. Everything public below funnels through
 * here, so there is exactly one place where a balance is computed and exactly
 * one place that could get it wrong.
 */
async function record(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    materialId: string;
    kind: StockMovement['kind'];
    /** Signed. Already through `signedQuantity`. */
    quantity: number;
    jobId?: string | null;
    fromLocation?: string;
    toLocation?: string;
    reference?: string;
    notes?: string;
    enteredBy: string;
  },
): Promise<void> {
  if (input.quantity !== 0) {
    await tx.stockBatch.update({
      where: { id: input.batchId },
      data: { quantity: { increment: input.quantity } },
    });
  }

  // After the batch has moved, so the balance is the one this movement left.
  const balanceAfter = await totalsFor(tx, input.materialId);

  await tx.stockMovement.create({
    data: {
      batchId: input.batchId,
      materialId: input.materialId,
      kind: input.kind,
      quantity: input.quantity,
      balanceAfter,
      jobId: input.jobId ?? null,
      fromLocation: input.fromLocation ?? '',
      toLocation: input.toLocation ?? '',
      reference: input.reference ?? '',
      notes: input.notes ?? '',
      enteredBy: input.enteredBy,
    },
  });
}

/**
 * The batch, or a clear refusal.
 *
 * Locked for the rest of the transaction, so a concurrent issue against the
 * same batch waits rather than reading a quantity that is about to change.
 */
async function lockedBatch(tx: Prisma.TransactionClient, batchId: string) {
  const batch = await tx.stockBatch.findUnique({
    where: { id: batchId },
    select: { id: true, materialId: true, quantity: true, location: true, batchCode: true },
  });
  if (!batch) throw ApiError.notFound('That batch no longer exists');

  // Takes the row lock. Prisma has no SELECT ... FOR UPDATE, and a no-op write
  // to the row is the portable equivalent — it blocks any other transaction
  // touching the same batch until this one commits.
  await tx.stockBatch.update({ where: { id: batchId }, data: { updatedAt: new Date() } });
  return batch;
}

/**
 * Material arrived: a new batch, and the receipt that created it.
 *
 * The delivery may be in a different unit from the one the material is stocked
 * in — film comes by the tonne — so the quantity and the rate are both
 * converted here, before anything is written. Everything downstream measures in
 * the stocked unit and none of it has to know a conversion happened.
 */
export async function receiveStock(
  input: ReceiveStockInput,
  enteredBy: string,
  /**
   * The caller's transaction, when a receipt is part of something larger.
   *
   * A purchase delivery writes both a stock batch and the receipt that points
   * at it, and neither should survive the other failing — a receipt naming a
   * batch that was never created is worse than no receipt. Prisma has no nested
   * transactions, so a caller already inside one passes it here rather than
   * opening a second that would deadlock against the first.
   */
  client?: Prisma.TransactionClient,
): Promise<StockBatch> {
  const run = async (tx: Prisma.TransactionClient) => {
    /*
     * The material, or a new one created as the delivery is booked in.
     *
     * Created inside the transaction with the batch: a material that exists
     * with no stock against it, because the receipt then failed, is a row
     * somebody has to notice and tidy up.
     */
    let material: { id: string; name: string; unit: string };

    if (input.newMaterial) {
      const clash = await tx.material.findUnique({
        where: { name: input.newMaterial.name },
        select: { id: true, name: true, unit: true, isActive: true },
      });
      if (clash) {
        // Reused rather than refused. Two people booking in the same new film
        // on the same morning should not produce an error neither can explain;
        // reviving a retired one is what receiving it means.
        if (!clash.isActive) {
          await tx.material.update({ where: { id: clash.id }, data: { isActive: true } });
        }
        material = clash;
      } else {
        material = await tx.material.create({
          data: {
            name: input.newMaterial.name,
            category: input.newMaterial.category,
            unit: input.newMaterial.unit,
            // No rate, and no density. Both belong on the Rates screen, where
            // there is room to get them right — what one supplier charged on
            // one day is not the works' rate for the material.
            sortOrder: 999,
          },
          select: { id: true, name: true, unit: true },
        });
      }
    } else {
      const existing = await tx.material.findUnique({
        where: { id: input.materialId ?? '' },
        select: { id: true, name: true, unit: true, isActive: true },
      });
      if (!existing) throw ApiError.notFound('That material is not on the rates list');
      if (!existing.isActive) {
        throw ApiError.badRequest(
          'That material has been retired — bring it back under Rates first',
        );
      }
      material = existing;
    }

    /*
     * The delivery note's figures, in the unit the material is stocked in.
     *
     * Refused rather than guessed when the two units do not convert: litres
     * into kilograms is a property of the substance, and treating one as the
     * other would put a wrong weight into stock and a wrong figure into the
     * inventory value, with nothing on any screen to contradict it.
     */
    const purchaseUnit = input.unit || material.unit;
    const quantity = convertQuantity(input.quantity, purchaseUnit, material.unit);
    if (quantity === null || quantity <= 0) {
      throw ApiError.badRequest(
        `${material.name} is stocked in ${material.unit}, which ${purchaseUnit} does not convert to`,
      );
    }

    // The inverse: Rs. 205,000 a tonne is Rs. 205 a kilogram.
    const ratePerUnit =
      input.ratePerUnit === null
        ? null
        : convertRate(input.ratePerUnit, purchaseUnit, material.unit);

    const clash = await tx.stockBatch.findUnique({
      where: { materialId_batchCode: { materialId: material.id, batchCode: input.batchCode } },
      select: { id: true },
    });
    if (clash) {
      // Named rather than generic: the office is holding a delivery note and
      // needs to know it has already keyed this one in.
      throw ApiError.conflict(`Batch ${input.batchCode} is already on record for this material`);
    }

    const sameUnit = purchaseUnit.toUpperCase() === material.unit.toUpperCase();

    const created = await tx.stockBatch.create({
      data: {
        materialId: material.id,
        batchCode: input.batchCode,
        location: input.location,
        receivedOn: parseDate(input.receivedOn),
        initialQuantity: quantity,
        // Only when it differs — recording "3000 KG arrived as 3000 KG" on
        // every ordinary delivery is noise in the one place it would be read.
        purchaseQuantity: sameUnit ? null : input.quantity,
        purchaseUnit: sameUnit ? null : purchaseUnit.toUpperCase(),
        // Starts empty; the receipt below puts the stock in, so a batch's
        // quantity is the sum of its movements from its very first row.
        quantity: 0,
        ratePerUnit,
        reference: input.reference,
        notes: input.notes,
      },
      select: { id: true },
    });

    await record(tx, {
      batchId: created.id,
      materialId: material.id,
      kind: 'RECEIPT',
      quantity: signedQuantity('RECEIPT', quantity),
      toLocation: input.location,
      reference: input.reference,
      notes: input.notes,
      enteredBy,
    });

    return tx.stockBatch.findUniqueOrThrow({
      where: { id: created.id },
      include: { material: { select: { name: true, unit: true } } },
    });
  };

  const batch = client ? await run(client) : await prisma.$transaction(run);

  const rates = await currentRates([batch.materialId]);
  return toBatch(batch, rates.get(batch.materialId) ?? null);
}

/** Material went to the floor, or was scrapped. */
export async function issueStock(
  input: IssueStockInput,
  enteredBy: string,
): Promise<StockMovement> {
  const movementId = await prisma.$transaction(async (tx) => {
    const batch = await lockedBatch(tx, input.batchId);
    const available = toNumber(batch.quantity);

    /*
     * Refused rather than allowed to go negative.
     *
     * Negative stock is always wrong — the material is either there or it is
     * not — and letting it through hides whichever earlier movement was
     * mistaken. The message says what is actually on hand, because the usual
     * cause is issuing from the wrong batch.
     */
    if (input.quantity > available) {
      throw ApiError.badRequest(
        `Batch ${batch.batchCode} holds ${available}, which is less than the ${input.quantity} being issued`,
      );
    }

    if (input.jobId) {
      const job = await tx.job.findUnique({ where: { id: input.jobId }, select: { id: true } });
      if (!job) throw ApiError.badRequest('That job is no longer on record');
    }

    await record(tx, {
      batchId: batch.id,
      materialId: batch.materialId,
      kind: input.kind,
      quantity: signedQuantity(input.kind, input.quantity),
      jobId: input.jobId,
      fromLocation: batch.location,
      reference: input.reference,
      notes: input.notes,
      enteredBy,
    });

    const latest = await tx.stockMovement.findFirstOrThrow({
      where: { batchId: batch.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest.id;
  });

  return readMovement(movementId);
}

/** A cycle count: the books are moved to what is physically there. */
export async function adjustStock(
  input: AdjustStockInput,
  enteredBy: string,
): Promise<StockMovement> {
  const movementId = await prisma.$transaction(async (tx) => {
    const batch = await lockedBatch(tx, input.batchId);
    const onBooks = toNumber(batch.quantity);
    const difference = round(input.countedQuantity - onBooks, 3);

    /*
     * A count that agrees with the books is still recorded.
     *
     * It is evidence the shelf was checked, which is the point of counting. A
     * zero movement in the history reads as "counted, correct" — dropping it
     * would make a checked shelf indistinguishable from an unchecked one.
     */
    await record(tx, {
      batchId: batch.id,
      materialId: batch.materialId,
      kind: 'ADJUSTMENT',
      quantity: difference,
      fromLocation: batch.location,
      reference: input.reference,
      notes: input.notes,
      enteredBy,
    });

    const latest = await tx.stockMovement.findFirstOrThrow({
      where: { batchId: batch.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest.id;
  });

  return readMovement(movementId);
}

/** The batch moved shelves. Changes where stock is, never how much. */
export async function transferStock(
  input: TransferStockInput,
  enteredBy: string,
): Promise<StockMovement> {
  const movementId = await prisma.$transaction(async (tx) => {
    const batch = await lockedBatch(tx, input.batchId);
    if (batch.location === input.toLocation) {
      throw ApiError.badRequest(`Batch ${batch.batchCode} is already in ${input.toLocation}`);
    }

    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { location: input.toLocation },
    });

    await record(tx, {
      batchId: batch.id,
      materialId: batch.materialId,
      kind: 'TRANSFER',
      quantity: 0,
      fromLocation: batch.location,
      toLocation: input.toLocation,
      notes: input.notes,
      enteredBy,
    });

    const latest = await tx.stockMovement.findFirstOrThrow({
      where: { batchId: batch.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest.id;
  });

  return readMovement(movementId);
}

async function readMovement(id: string): Promise<StockMovement> {
  return toMovement(
    await prisma.stockMovement.findUniqueOrThrow({
      where: { id },
      include: { batch: { select: { batchCode: true } }, job: { select: { jobName: true } } },
    }),
  );
}

/**
 * The inventory screen: every material, with what is on hand.
 *
 * Every material on the rates list appears, including ones with no stock at
 * all. A material missing from the screen because it happens to be empty is
 * exactly the one somebody needs to order.
 */
export async function listStock(query: ListStockQuery): Promise<StockList> {
  const filters: Prisma.MaterialWhereInput[] = [{ isActive: true }];
  if (query.category) filters.push({ category: query.category });
  if (query.q) filters.push({ name: { contains: query.q, mode: 'insensitive' } });

  const materials = await prisma.material.findMany({
    where: { AND: filters },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      reorderLevel: true,
      stockBatches: { select: { quantity: true, ratePerUnit: true, location: true } },
    },
  });

  const ids = materials.map((material) => material.id);
  const rates = await currentRates(ids);

  // One grouped query rather than one per material.
  const lastMoved = await prisma.stockMovement.groupBy({
    by: ['materialId'],
    where: { materialId: { in: ids } },
    _max: { createdAt: true },
  });
  const lastMovedAt = new Map(lastMoved.map((row) => [row.materialId, row._max.createdAt]));

  const items: StockSummary[] = materials.map((material) => {
    const batches = material.stockBatches;
    const currentRate = rates.get(material.id) ?? null;

    const quantity = round(
      batches.reduce((total, batch) => total + toNumber(batch.quantity), 0),
      3,
    );
    const value = round(
      batches.reduce(
        (total, batch) =>
          total +
          batchValue(toNumber(batch.quantity), toNullableNumber(batch.ratePerUnit), currentRate),
        0,
      ),
      2,
    );

    const reorderLevel = toNullableNumber(material.reorderLevel);
    const moved = lastMovedAt.get(material.id) ?? null;
    // Ever moved, not "has stock now" — a material that ran out has a history
    // and is out; one nobody has ever received is simply not stocked here.
    const everStocked = moved !== null;

    return {
      materialId: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      quantity,
      // Batches that still hold something. An emptied batch stays on record for
      // its history but is not somewhere stock can be found.
      batchCount: batches.filter((batch) => toNumber(batch.quantity) > 0).length,
      reorderLevel,
      health: stockHealth(quantity, reorderLevel, everStocked),
      currentRate,
      value,
      locations: [
        ...new Set(
          batches
            .filter((batch) => toNumber(batch.quantity) > 0)
            .map((batch) => batch.location)
            .filter((location) => location && location !== 'NA'),
        ),
      ],
      lastMovedAt: moved ? moved.toISOString() : null,
    };
  });

  /*
   * Totals are over everything the filters matched, not over the page.
   *
   * "Inventory value" that changes when you click a category filter is not a
   * total anybody can use. The list is short enough — the rates master holds
   * seventeen materials — that there is no page to be over.
   */
  const totals = {
    materialsInStock: items.filter((item) => item.quantity > 0).length,
    lowStock: items.filter((item) => needsAttention(item.health)).length,
    withoutLevel: items.filter((item) => item.health === 'UNSET').length,
    totalValue: round(
      items.reduce((total, item) => total + item.value, 0),
      2,
    ),
  };

  const visible = query.lowOnly ? items.filter((item) => needsAttention(item.health)) : items;

  return { items: visible, totals };
}

/** One material in full: its stock, its batches and its history. */
export async function getMaterialStock(materialId: string): Promise<MaterialStock> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true, name: true, category: true, unit: true, reorderLevel: true },
  });
  if (!material) throw ApiError.notFound('Material not found');

  const [batches, movements, rates] = await Promise.all([
    prisma.stockBatch.findMany({
      where: { materialId },
      // Oldest first: the office reaches for the oldest stock, and a batch list
      // in receipt order is the order it should be used in.
      orderBy: [{ receivedOn: 'asc' }, { createdAt: 'asc' }],
      include: { material: { select: { name: true, unit: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { materialId },
      // Newest first: the history is read to answer "what just happened".
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { batch: { select: { batchCode: true } }, job: { select: { jobName: true } } },
    }),
    currentRates([materialId]),
  ]);

  const currentRate = rates.get(materialId) ?? null;
  const mapped = batches.map((batch) => toBatch(batch, currentRate));

  const quantity = round(
    mapped.reduce((total, batch) => total + batch.quantity, 0),
    3,
  );
  const reorderLevel = toNullableNumber(material.reorderLevel);

  return {
    summary: {
      materialId: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      quantity,
      batchCount: mapped.filter((batch) => batch.quantity > 0).length,
      reorderLevel,
      health: stockHealth(quantity, reorderLevel, movements.length > 0),
      currentRate,
      value: round(
        mapped.reduce((total, batch) => total + batch.value, 0),
        2,
      ),
      locations: [
        ...new Set(
          mapped
            .filter((batch) => batch.quantity > 0)
            .map((batch) => batch.location)
            .filter((location) => location && location !== 'NA'),
        ),
      ],
      lastMovedAt: movements[0]?.createdAt.toISOString() ?? null,
    },
    batches: mapped,
    movements: movements.map(toMovement),
  };
}

/** Sets, or clears, the level below which a material reads as low. */
export async function setReorderLevel(
  materialId: string,
  input: SetReorderLevelInput,
): Promise<StockSummary> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true },
  });
  if (!material) throw ApiError.notFound('Material not found');

  await prisma.material.update({
    where: { id: materialId },
    data: { reorderLevel: input.reorderLevel },
  });

  return (await getMaterialStock(materialId)).summary;
}

/**
 * Proves the cache agrees with the ledger.
 *
 * `stock_batches.quantity` is a running total maintained beside the movements
 * that produced it, and a cache that can silently disagree with its source is
 * worse than no cache. This recomputes every batch from its own movements and
 * reports what does not match; the tests call it after every scenario, and it
 * is exported so it can be run against production data if a figure is ever
 * doubted.
 */
export async function reconcile(): Promise<
  { batchId: string; batchCode: string; cached: number; fromLedger: number }[]
> {
  const [batches, sums] = await Promise.all([
    prisma.stockBatch.findMany({ select: { id: true, batchCode: true, quantity: true } }),
    prisma.stockMovement.groupBy({ by: ['batchId'], _sum: { quantity: true } }),
  ]);

  const ledger = new Map(sums.map((row) => [row.batchId, round(toNumber(row._sum.quantity), 3)]));

  return batches
    .map((batch) => ({
      batchId: batch.id,
      batchCode: batch.batchCode,
      cached: round(toNumber(batch.quantity), 3),
      fromLedger: ledger.get(batch.id) ?? 0,
    }))
    .filter((row) => row.cached !== row.fromLedger);
}
