import type {
  CreateMaterialInput,
  Material,
  MaterialRateHistoryEntry,
  RatesSaveResult,
  SaveRatesInput,
  UpdateMaterialInput,
} from '@yuva/shared';
import { round } from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, TX } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';

const toNumber = (value: Prisma.Decimal | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

/** yyyy-mm-dd in local terms, so "today" means the office's today. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses yyyy-mm-dd into the UTC midnight Postgres stores for a DATE. */
function parseDate(value: string | undefined): Date {
  const iso = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toISODate(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

/** DATE columns are stored at UTC midnight, which has no DST, so this is exact. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far back one carry-forward will fill. If the system sits unused for
 * longer than this, the older part of the gap stays empty rather than writing
 * thousands of rows on whichever page load happens to notice. Costing is
 * unaffected: rates resolve with `lte`, so the last rate stays in force whether
 * or not the days between were ever written.
 */
const MAX_CARRY_FORWARD_DAYS = 90;

/**
 * Recorded as the author of a row nobody typed. Kept in `entered_by` so the
 * provenance survives without a schema change — the history list still shows
 * every day, this just does not claim the office keyed it in.
 */
const CARRIED_FORWARD = 'Carried forward';

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/**
 * The days that need a copy of `lastPriced`'s rate: everything after it, up to
 * and including `through`, capped at the most recent `maxDays`.
 *
 * Pure and exported so the awkward part — gap arithmetic across month ends and
 * the cap — is testable without a database.
 */
export function carryForwardDates(
  lastPriced: Date,
  through: Date,
  maxDays: number = MAX_CARRY_FORWARD_DAYS,
): Date[] {
  const earliest = addDays(through, -(maxDays - 1));
  let cursor = addDays(lastPriced, 1);
  if (cursor.getTime() < earliest.getTime()) cursor = earliest;

  const dates: Date[] = [];
  for (; cursor.getTime() <= through.getTime(); cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

/**
 * Copies each active material's last known rate forward, one row per day, up to
 * `through` (today by default). Returns how many rows were created.
 *
 * Rates rarely move day to day, and the office should not have to retype
 * yesterday's numbers just to record that nothing changed. Quotation costing
 * never needed this — it already resolves the most recent rate on or before the
 * date — but a row per day means the Rates screen opens on today already filled
 * in and ready to edit, and a material's price history reads as a continuous
 * series rather than a handful of scattered entries.
 *
 * This runs when rates are read rather than on a schedule, for two reasons. It
 * is idempotent, because the (material, date) unique key means a second call or
 * a second open tab inserts nothing. And Render's free tier stops the service
 * while it is idle, so a midnight cron would routinely not fire — filling the
 * gap when someone next looks produces exactly the same rows, however many days
 * were missed.
 */
export async function carryForwardRates(through: Date = parseDate(undefined)): Promise<number> {
  const latest = await prisma.materialRate.groupBy({
    by: ['materialId'],
    where: { effectiveDate: { lte: through }, material: { isActive: true } },
    _max: { effectiveDate: true },
  });

  const behind = latest.flatMap((row) => {
    const on = row._max.effectiveDate;
    return on !== null && on.getTime() < through.getTime()
      ? [{ materialId: row.materialId, effectiveDate: on }]
      : [];
  });
  if (behind.length === 0) return 0;

  // The value to copy is whatever stood on each material's last priced day.
  const sources = await prisma.materialRate.findMany({
    where: { OR: behind },
    select: { materialId: true, rate: true, effectiveDate: true },
  });

  const rows = sources.flatMap((source) =>
    carryForwardDates(source.effectiveDate, through).map((effectiveDate) => ({
      materialId: source.materialId,
      rate: source.rate,
      effectiveDate,
      enteredBy: CARRIED_FORWARD,
    })),
  );
  if (rows.length === 0) return 0;

  const { count } = await prisma.materialRate.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/**
 * Materials with the rate in force on `onDate`, plus the one before it.
 *
 * "In force" means the most recent rate on or before that date — not the rate
 * keyed in on that exact day. Rates are not entered every single morning, and a
 * quotation made on a Sunday must still cost against Friday's price.
 */
export async function listMaterials(options: {
  onDate?: string;
  includeInactive?: boolean;
}): Promise<Material[]> {
  // Bring every material up to today before reading, so the screen opens on a
  // row for today even when nobody has touched it since last week.
  await carryForwardRates();

  const on = parseDate(options.onDate);

  const materials = await prisma.material.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      rates: {
        where: { effectiveDate: { lte: on } },
        orderBy: { effectiveDate: 'desc' },
        take: 2,
      },
      /* Named, not just pointed at: the screen has to say "General Poly + 6"
         rather than make the office match two ids by eye. */
      baseMaterial: { select: { name: true } },
    },
  });

  return materials.map((material) => {
    const [current, previous] = material.rates;
    const currentRate = current ? toNumber(current.rate) : null;
    const previousRate = previous ? toNumber(previous.rate) : null;

    return {
      id: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      density: toNumber(material.density),
      solidsPercent: toNumber(material.solidsPercent),
      laydownGsm: toNumber(material.laydownGsm),
      inkKind: material.inkKind,
      isActive: material.isActive,
      sortOrder: material.sortOrder,
      baseMaterialId: material.baseMaterialId,
      baseMaterialName: material.baseMaterial?.name ?? null,
      ratePremium: toNumber(material.ratePremium),
      currentRate,
      currentRateDate: current ? toISODate(current.effectiveDate) : null,
      previousRate,
      previousRateDate: previous ? toISODate(previous.effectiveDate) : null,
      changePercent:
        currentRate !== null && previousRate !== null && previousRate > 0
          ? round(((currentRate - previousRate) / previousRate) * 100, 2)
          : null,
    };
  });
}

/**
 * Saves the day's rates.
 *
 * A blank entry means "no change today", not "zero" — the previous rate simply
 * stays in force. Re-saving the same day overwrites rather than duplicating, so
 * correcting a typo an hour later does the obvious thing.
 *
 * **A base film carries its grades with it.** The works sells twelve LDPE
 * grades at General Poly plus a fixed amount each, so keying General Poly
 * writes all eleven derived rates for the same day — see `writeDerivedRates`.
 * A derived rate is refused if it is typed directly: there is one number to
 * key, and quietly accepting a second would leave the two disagreeing until
 * the next time the base moved.
 */
export async function saveRates(input: SaveRatesInput): Promise<RatesSaveResult> {
  const effectiveDate = parseDate(input.effectiveDate);
  const entries = input.entries.filter((entry) => entry.rate !== null);

  if (entries.length === 0) {
    return { effectiveDate: toISODate(effectiveDate), created: 0, updated: 0, unchanged: 0 };
  }

  const materialIds = entries.map((entry) => entry.materialId);
  const known = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: {
      id: true,
      name: true,
      baseMaterialId: true,
      baseMaterial: { select: { name: true } },
    },
  });
  if (known.length !== new Set(materialIds).size) {
    throw ApiError.badRequest('One or more materials no longer exist');
  }

  /* Typed where it is worked out. Said by name, because the office is looking
     at a screen full of films and needs to know which one to key instead. */
  const derived = known.filter((row) => row.baseMaterialId !== null);
  if (derived.length > 0) {
    const first = derived[0]!;
    throw ApiError.badRequest(
      `${first.name} follows ${first.baseMaterial?.name ?? 'its base film'} — set that rate instead`,
    );
  }

  const existing = await prisma.materialRate.findMany({
    where: { materialId: { in: materialIds }, effectiveDate },
    select: { materialId: true, rate: true },
  });
  const existingByMaterial = new Map(existing.map((row) => [row.materialId, Number(row.rate)]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const rate = entry.rate as number;
      const previous = existingByMaterial.get(entry.materialId);

      if (previous !== undefined && previous === rate) {
        unchanged += 1;
        continue;
      }

      await tx.materialRate.upsert({
        where: {
          materialId_effectiveDate: { materialId: entry.materialId, effectiveDate },
        },
        create: {
          materialId: entry.materialId,
          rate,
          effectiveDate,
          enteredBy: input.enteredBy,
        },
        update: { rate, enteredBy: input.enteredBy },
      });

      if (previous === undefined) created += 1;
      else updated += 1;
    }

    const grades = await writeDerivedRates(
      tx,
      entries.map((entry) => entry.materialId),
      effectiveDate,
      input.enteredBy,
    );
    created += grades.created;
    updated += grades.updated;
    unchanged += grades.unchanged;
  }, TX);

  return { effectiveDate: toISODate(effectiveDate), created, updated, unchanged };
}

/**
 * Writes the grades that follow each of these materials, for the same day.
 *
 * Called inside the same transaction as the rates that triggered it, so the
 * base and its grades are never on file apart: a quotation costed between the
 * two writes would read a General Poly that had moved and a frosty film that
 * had not.
 *
 * Counted the same way as a typed rate so the office is told the truth about
 * how many rows its one number wrote.
 */
async function writeDerivedRates(
  tx: Prisma.TransactionClient,
  baseIds: string[],
  effectiveDate: Date,
  enteredBy: string,
): Promise<{ created: number; updated: number; unchanged: number }> {
  const grades = await tx.material.findMany({
    where: { baseMaterialId: { in: baseIds }, ratePremium: { not: null } },
    select: { id: true, baseMaterialId: true, ratePremium: true },
  });
  if (grades.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  /* The rate just written, not the one that was there before — these rows are
     being derived from the figure this very call put on file. */
  const bases = await tx.materialRate.findMany({
    where: { materialId: { in: baseIds }, effectiveDate },
    select: { materialId: true, rate: true },
  });
  const baseRate = new Map(bases.map((row) => [row.materialId, Number(row.rate)]));

  const existing = await tx.materialRate.findMany({
    where: { materialId: { in: grades.map((grade) => grade.id) }, effectiveDate },
    select: { materialId: true, rate: true },
  });
  const was = new Map(existing.map((row) => [row.materialId, Number(row.rate)]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const grade of grades) {
    const base = baseRate.get(grade.baseMaterialId as string);
    if (base === undefined) continue;

    /* Four places, like every other rate on file. A premium of 7.5 on a base
       that is itself fractional must not round its way into a different film's
       price. */
    const rate = round(base + Number(grade.ratePremium), 4);
    const previous = was.get(grade.id);
    if (previous === rate) {
      unchanged += 1;
      continue;
    }

    await tx.materialRate.upsert({
      where: { materialId_effectiveDate: { materialId: grade.id, effectiveDate } },
      create: { materialId: grade.id, rate, effectiveDate, enteredBy },
      update: { rate, enteredBy },
    });

    if (previous === undefined) created += 1;
    else updated += 1;
  }

  return { created, updated, unchanged };
}

export async function getRateHistory(
  materialId: string,
  limit = 60,
): Promise<MaterialRateHistoryEntry[]> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true },
  });
  if (!material) throw ApiError.notFound('Material not found');

  const rows = await prisma.materialRate.findMany({
    where: { materialId },
    orderBy: { effectiveDate: 'desc' },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    rate: Number(row.rate),
    effectiveDate: toISODate(row.effectiveDate),
    enteredBy: row.enteredBy,
  }));
}

export async function createMaterial(input: CreateMaterialInput): Promise<Material> {
  /*
   * A name that belongs to a material taken OFF the price list brings it back.
   *
   * Taking one off keeps the row, because quotations priced against it must
   * still be able to say what they were costed on — but the name stays taken
   * and the row is off the screen, so adding it again failed against a material
   * nobody could see. Reviving is what was asked for, and it keeps the id, so
   * the rate history and everything pointing at it survive.
   */
  const clash = await prisma.material.findUnique({
    where: { name: input.name },
    select: { id: true, isActive: true },
  });
  if (clash) {
    if (clash.isActive) {
      throw ApiError.conflict(`A material named "${input.name}" already exists`);
    }
    await prisma.material.update({
      where: { id: clash.id },
      data: {
        ...input,
        density: input.density ?? null,
        solidsPercent: input.solidsPercent ?? null,
        laydownGsm: input.laydownGsm ?? null,
        inkKind: input.inkKind ?? null,
        isActive: true,
      },
    });
    return readBack(clash.id);
  }

  const created = await prisma.material.create({
    data: {
      ...input,
      density: input.density ?? null,
      solidsPercent: input.solidsPercent ?? null,
      laydownGsm: input.laydownGsm ?? null,
      inkKind: input.inkKind ?? null,
    },
    select: { id: true },
  });

  return readBack(created.id);
}

/** The full shape the list serves, which is what a caller expects back. */
async function readBack(id: string): Promise<Material> {
  const found = (await listMaterials({ includeInactive: true })).find(
    (material) => material.id === id,
  );
  if (!found) throw ApiError.internal('Material was saved but could not be read back');
  return found;
}

/**
 * Removes a material, and says what is in the way when it cannot.
 *
 * Deleting is for a mistake — a name typed wrong, a film added and thought
 * better of. Two things are never deleted around: a **quotation** ply and a
 * **purchase** line. Those are documents the works sent out, and each has to
 * stay able to say what it was priced on. A purchase line is `Restrict` so the
 * database would refuse it anyway, with a foreign-key error nobody can act on;
 * a quotation ply is `SetNull`, so the database would happily allow it and the
 * link would vanish without a word. Both are refused here, by name.
 *
 * **Stock is different.** A batch is the works' own record of what it holds,
 * not a promise made to anybody, and a material received by mistake has to be
 * removable. So stock does not refuse outright — it refuses until the caller
 * says to discard it, which the Inventory screen does after showing exactly
 * how much goes. Rates cascade; the batches and their movements are deleted
 * here, in one transaction with the material, so a half-deleted material
 * cannot be left behind.
 */
export async function deleteMaterial(
  id: string,
  options: { discardStock?: boolean } = {},
): Promise<{ id: string }> {
  const material = await prisma.material.findUnique({
    where: { id },
    select: { id: true, name: true, unit: true },
  });
  if (!material) throw ApiError.notFound('Material not found');

  const [onQuotations, purchaseLines, batches, movements, held] = await Promise.all([
    prisma.quotationItemLayer.count({ where: { materialId: id } }),
    prisma.purchaseOrderLine.count({ where: { materialId: id } }),
    prisma.stockBatch.count({ where: { materialId: id } }),
    prisma.stockMovement.count({ where: { materialId: id } }),
    prisma.stockBatch.aggregate({ where: { materialId: id }, _sum: { quantity: true } }),
  ]);

  const used: string[] = [];
  if (onQuotations > 0) used.push(`${onQuotations} quotation ${plural(onQuotations, 'line')}`);
  if (purchaseLines > 0) used.push(`${purchaseLines} purchase ${plural(purchaseLines, 'line')}`);

  if (used.length > 0) {
    throw ApiError.conflict(
      `${material.name} is on ${used.join(' and ')}. Take it off the price list instead — ` +
        'deleting it would leave those unable to say what they were priced on.',
    );
  }

  const stocked = batches > 0 || movements > 0;
  if (stocked && !options.discardStock) {
    const quantity = Number(held._sum.quantity ?? 0);
    throw ApiError.conflict(
      `${material.name} is on the inventory — ${quantity} ${material.unit} across ` +
        `${batches} stock ${plural(batches, 'batch', 'batches')}. Delete it from Inventory, ` +
        'where what goes with it is shown before you confirm.',
    );
  }

  /*
   * One transaction: movements point at batches, batches at the material, and
   * a material deleted while its ledger survived would leave rows nothing can
   * name. Rates cascade in the database, so they are not listed here.
   */
  await prisma.$transaction(async (tx) => {
    if (stocked) {
      await tx.stockMovement.deleteMany({ where: { materialId: id } });
      await tx.stockBatch.deleteMany({ where: { materialId: id } });
    }
    await tx.material.delete({ where: { id } });
  }, TX);

  return { id };
}

/** "1 line" but "2 lines", without a dependency for it. */
function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

export async function updateMaterial(id: string, input: UpdateMaterialInput): Promise<Material> {
  const existing = await prisma.material.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Material not found');

  if (input.name) {
    const clash = await prisma.material.findFirst({
      where: { name: input.name, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict(`A material named "${input.name}" already exists`);
  }

  await prisma.material.update({ where: { id }, data: input });

  const found = (await listMaterials({ includeInactive: true })).find((m) => m.id === id);
  if (!found) throw ApiError.notFound('Material not found');
  return found;
}

/**
 * Rates in force on a date, keyed by material id — what quotation costing needs.
 */
export async function getRateMap(onDate: string): Promise<Map<string, number>> {
  const on = parseDate(onDate);

  const rows = await prisma.materialRate.findMany({
    where: { effectiveDate: { lte: on } },
    orderBy: { effectiveDate: 'desc' },
    select: { materialId: true, rate: true },
  });

  // Ordered newest first, so the first entry seen per material is the one in force.
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!map.has(row.materialId)) map.set(row.materialId, Number(row.rate));
  }
  return map;
}
