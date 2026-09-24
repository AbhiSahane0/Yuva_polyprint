import {
  availabilityFor,
  filmRequirements,
  shortages,
  wastagePercentFor,
  type MaterialAvailability,
  type MaterialRequirement,
  type ReelStock,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { getSettings } from '../settings/settings.service.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * **Film, committed to a job card without being taken off stock.**
 *
 * The works already has one thing that reduces stock — the job sheet, which
 * posts what was actually weighed at the machine. This does not do that again.
 * A reservation writes a row saying *this card has claimed this much*, and the
 * only thing that changes is what the next card sees as free:
 *
 *     free = on hand − everything held by cards that have not finished
 *
 * So a job that cannot be made is stopped at the point it is raised, the film
 * behind it stops being promised to anything else, and the batches and the
 * ledger are still moved exactly once, later, by the sheet. **There is no path
 * through this file that deducts stock.**
 */

const toNumber = (value: Prisma.Decimal | number | null): number => Number(value ?? 0);
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** A card, as everything here needs to see one. */
export interface CardForStock {
  id: string;
  orderId: string;
  quantityKg: number;
}

/**
 * What a set of cards needs off the shelf, from the quotation lines they were
 * priced on.
 *
 * **Only a quotation line carries materials.** Its plies name the actual
 * material rows and the GSM each contributes, which is what makes a requirement
 * a fact rather than a guess. The job master records gauges and GSMs but not
 * which film they are, and an order typed over the phone records neither.
 *
 * Those cards reserve nothing, and the screen says so. Reserving the wrong film
 * would be worse than reserving none: it would hold stock a different job
 * needs, and the shortage it raised would be about a material nobody chose.
 *
 * Batched over cards rather than done one at a time, because the list screen
 * asks this of twenty-five at once and the page would otherwise cost
 * twenty-five round trips to say the same thing.
 */
export async function requirementsForCards(
  tx: Prisma.TransactionClient,
  cards: CardForStock[],
): Promise<Map<string, MaterialRequirement[]>> {
  const out = new Map<string, MaterialRequirement[]>();
  if (cards.length === 0) return out;

  const orders = await tx.order.findMany({
    where: { id: { in: [...new Set(cards.map((card) => card.orderId))] } },
    select: {
      id: true,
      quotationItem: {
        select: {
          pouchType: true,
          compositeGsm: true,
          /* The web this job runs at: film width × lanes + trim. A reel
             narrower than that cannot run it — film is slit down, never
             widened. */
          filmWidthMm: true,
          repeatWidth: true,
          quotation: { select: { wastagePercent: true, date: true } },
          layers: {
            orderBy: { position: 'asc' },
            select: { materialId: true, materialName: true, gsm: true },
          },
        },
      },
    },
  });
  const byOrder = new Map(orders.map((order) => [order.id, order.quotationItem]));

  /*
   * The wastage each job was PRICED at, resolved the way the costing resolves
   * it — the quotation's own override, else the works' figure for that kind of
   * job. Read on the quotation's own date, because a card raised today against
   * a line quoted in March must ask for the film that line was costed on. One
   * settings read per distinct date, not per card.
   */
  const dates = [
    ...new Set(
      orders
        .map((order) => order.quotationItem?.quotation.date.toISOString().slice(0, 10))
        .filter((date): date is string => Boolean(date)),
    ),
  ];
  const settingsByDate = new Map(
    await Promise.all(dates.map(async (date) => [date, await getSettings(date)] as const)),
  );

  for (const card of cards) {
    const item = byOrder.get(card.orderId);
    if (!item) {
      out.set(card.id, []);
      continue;
    }
    const settings = settingsByDate.get(item.quotation.date.toISOString().slice(0, 10));
    if (!settings) {
      out.set(card.id, []);
      continue;
    }

    out.set(
      card.id,
      filmRequirements({
        layers: item.layers.map((layer) => ({
          materialId: layer.materialId,
          name: layer.materialName,
          gsm: toNumber(layer.gsm),
        })),
        quantityKg: card.quantityKg,
        structureGsm: toNumber(item.compositeGsm),
        needsWidthMm: round2(
          toNumber(item.filmWidthMm) * Math.max(1, toNumber(item.repeatWidth)) +
            settings.defaultTrimMm,
        ),
        wastagePercent: wastagePercentFor({
          pouchType: item.pouchType,
          override:
            item.quotation.wastagePercent === null ? null : toNumber(item.quotation.wastagePercent),
          defaultWastagePercent: settings.defaultWastagePercent,
          pouchWastagePercent: settings.pouchWastagePercent,
        }),
      }),
    );
  }

  return out;
}

/** One card's requirement. */
export async function requirementsFor(
  tx: Prisma.TransactionClient,
  card: CardForStock,
): Promise<MaterialRequirement[]> {
  return (await requirementsForCards(tx, [card])).get(card.id) ?? [];
}

/**
 * What each card needs, against what the works can actually put behind it.
 *
 * A card's own hold is left out of the held figure it is measured against.
 * Otherwise a card that already holds its film would report itself short
 * against itself — every time, and nobody could get past it.
 */
export async function availabilityForCards(
  tx: Prisma.TransactionClient,
  cards: CardForStock[],
): Promise<Map<string, MaterialAvailability[]>> {
  const requirements = await requirementsForCards(tx, cards);
  const materialIds = [
    ...new Set([...requirements.values()].flatMap((lines) => lines.map((l) => l.materialId))),
  ];

  const out = new Map<string, MaterialAvailability[]>();
  if (materialIds.length === 0) {
    for (const card of cards) out.set(card.id, []);
    return out;
  }

  const [batches, held] = await Promise.all([
    /*
     * Grouped by WIDTH as well as material, because film is not fungible by
     * weight: a job running at 650 mm cannot use a 340 mm reel however many
     * kilograms are on it. One row per (material, width) keeps this to a few
     * dozen rows rather than one per batch — the works has 266 batches of LDPE
     * across fourteen widths.
     */
    tx.stockBatch.groupBy({
      by: ['materialId', 'widthMm'],
      where: { materialId: { in: materialIds } },
      _sum: { quantity: true },
    }),
    /* Grouped by card as well as material, so each card can be measured
       against everyone ELSE's claims. */
    tx.stockReservation.groupBy({
      by: ['materialId', 'productionOrderId'],
      where: { materialId: { in: materialIds }, status: 'HELD' },
      _sum: { quantity: true },
    }),
  ]);

  const reels = new Map<string, ReelStock[]>();
  for (const row of batches) {
    const rows = reels.get(row.materialId) ?? [];
    rows.push({
      widthMm: row.widthMm === null ? null : toNumber(row.widthMm),
      quantity: toNumber(row._sum.quantity),
    });
    reels.set(row.materialId, rows);
  }
  const heldTotal = new Map<string, number>();
  const heldByCard = new Map<string, number>();
  for (const row of held) {
    const quantity = toNumber(row._sum.quantity);
    heldTotal.set(row.materialId, (heldTotal.get(row.materialId) ?? 0) + quantity);
    heldByCard.set(`${row.productionOrderId}:${row.materialId}`, quantity);
  }

  for (const card of cards) {
    const lines = requirements.get(card.id) ?? [];
    const others = new Map(
      lines.map((line) => [
        line.materialId,
        (heldTotal.get(line.materialId) ?? 0) -
          (heldByCard.get(`${card.id}:${line.materialId}`) ?? 0),
      ]),
    );
    out.set(card.id, availabilityFor(lines, { reels, held: others }));
  }

  return out;
}

/** One card's. */
export async function availabilityForCard(
  tx: Prisma.TransactionClient,
  card: CardForStock,
): Promise<MaterialAvailability[]> {
  return (await availabilityForCards(tx, [card])).get(card.id) ?? [];
}

/**
 * Writes the card's claim on the film.
 *
 * Upserted on (card, material), so raising a card, editing its quantity and
 * re-checking it all converge on one row per material rather than stacking
 * claims — which would hold the same film twice and make the works look short
 * of stock it has.
 */
export async function holdFor(
  tx: Prisma.TransactionClient,
  cardId: string,
  requirements: MaterialRequirement[],
): Promise<void> {
  for (const requirement of requirements) {
    await tx.stockReservation.upsert({
      where: {
        productionOrderId_materialId: {
          productionOrderId: cardId,
          materialId: requirement.materialId,
        },
      },
      create: {
        productionOrderId: cardId,
        materialId: requirement.materialId,
        quantity: requirement.quantity,
        status: 'HELD',
      },
      update: { quantity: requirement.quantity, status: 'HELD', releasedAt: null },
    });
  }

  /* A ply edited off the line, or a quantity dropped to nothing: whatever this
     card no longer needs stops being held. */
  await tx.stockReservation.updateMany({
    where: {
      productionOrderId: cardId,
      status: 'HELD',
      materialId: { notIn: requirements.map((r) => r.materialId) },
    },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}

/**
 * Lets the film go.
 *
 * Called when a card completes and when one is deleted. **The completing card
 * is where the two halves meet**: the job sheet posts what the run actually
 * took off stock, and the claim that was standing in for it until then stops
 * counting. Releasing before the sheet is posted would let a second card
 * promise film this one has already used; not releasing at all would hold it
 * for ever.
 */
export async function releaseFor(tx: Prisma.TransactionClient, cardId: string): Promise<void> {
  await tx.stockReservation.updateMany({
    where: { productionOrderId: cardId, status: 'HELD' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}

/**
 * Whether this card's material question is already settled.
 *
 * True once its job sheet has been posted: the run's real consumption is in the
 * ledger by then, against real batches. After that a claim must never be
 * written again — it would stand alongside the issue and take the same film off
 * free stock twice — and there is nothing left to refuse a start over.
 */
export async function materialIsSettled(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<boolean> {
  const sheet = await tx.jobSheet.findUnique({
    where: { productionOrderId: cardId },
    select: { stockPostedAt: true },
  });
  return Boolean(sheet?.stockPostedAt);
}

/** The sentence the floor reads when a job cannot be made. */
export function shortageMessage(lines: MaterialAvailability[]): string {
  const short = shortages(lines);
  /*
   * The sentence names the SIZE problem where there is one, because "2,900 kg
   * free and none of it usable" reads as a bug otherwise — and because the two
   * problems have different answers. One is solved by buying more film, the
   * other by buying it differently.
   */
  const said = short
    .map((line) =>
      line.tooNarrowKg > 0
        ? `${line.name} — needs ${line.quantity} kg on a reel ${line.needsWidthMm} mm or wider, ` +
          `${line.usable} kg usable (${line.tooNarrowKg} kg is too narrow)`
        : `${line.name} — needs ${line.quantity} kg, ${line.usable} kg free`,
    )
    .join('; ');
  return `Not enough material for this job: ${said}`;
}

/**
 * Refuses the move unless the works has the film, or somebody has said in
 * writing why it should go ahead anyway.
 *
 * **Blocking alone was not the right answer.** A hard stop on a floor that
 * knows a delivery is an hour away gets worked around — the card is raised
 * against the wrong order, or the system stops being used for that job — and
 * then the data stops being true, which costs more than the stop saved. So the
 * block is real, and there is one way through it that records who went through
 * and why.
 */
export function refuseUnlessOverridden(
  lines: MaterialAvailability[],
  override: { materialOverrideReason: string },
): void {
  const short = shortages(lines);
  if (short.length === 0) return;
  if (override.materialOverrideReason.trim()) return;
  throw ApiError.conflict(shortageMessage(lines));
}
