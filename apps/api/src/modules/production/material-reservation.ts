import {
  availabilityFor,
  filmRequirements,
  shortages,
  wastagePercentFor,
  type MaterialAvailability,
  type MaterialRequirement,
  type Reel,
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
     * Every roll, not a sum. A claim names the roll it is on now, so what is
     * left of a roll is a fact about that roll rather than a share of a total —
     * and that is what lets the floor be told which rolls to fetch.
     */
    tx.stockBatch.findMany({
      where: { materialId: { in: materialIds }, quantity: { gt: 0 } },
      select: {
        id: true,
        materialId: true,
        batchCode: true,
        widthMm: true,
        receivedOn: true,
        quantity: true,
      },
    }),
    /*
     * Claims, by roll and by card, so each card can be measured against
     * everyone ELSE's. The rows written before reels were named have no batch
     * and are counted against the material as a whole — see below.
     */
    tx.stockReservation.groupBy({
      by: ['materialId', 'batchId', 'productionOrderId'],
      where: { materialId: { in: materialIds }, status: 'HELD' },
      _sum: { quantity: true },
    }),
  ]);

  /** What each roll is claimed for, and by whom. */
  const onRoll = new Map<string, number>();
  /** Claims from before reels were named: material-wide, roll unknown. */
  const looseByMaterial = new Map<string, number>();

  for (const row of held) {
    const quantity = toNumber(row._sum.quantity);
    if (row.batchId) onRoll.set(`${row.productionOrderId}:${row.batchId}`, quantity);
    else {
      const key = `${row.productionOrderId}:${row.materialId}`;
      looseByMaterial.set(key, (looseByMaterial.get(key) ?? 0) + quantity);
    }
  }

  const heldOnRoll = new Map<string, number>();
  for (const [key, quantity] of onRoll) {
    const batchId = key.slice(key.indexOf(':') + 1);
    heldOnRoll.set(batchId, (heldOnRoll.get(batchId) ?? 0) + quantity);
  }

  for (const card of cards) {
    const lines = requirements.get(card.id) ?? [];

    const reels = new Map<string, Reel[]>();
    for (const batch of batches) {
      const rows = reels.get(batch.materialId) ?? [];
      const onHand = toNumber(batch.quantity);
      /* Everyone else's claims on THIS roll — this card's own are left out, or
         a card would report itself short against itself. */
      const mine = onRoll.get(`${card.id}:${batch.id}`) ?? 0;
      const others = (heldOnRoll.get(batch.id) ?? 0) - mine;
      rows.push({
        batchId: batch.id,
        batchCode: batch.batchCode,
        widthMm: batch.widthMm === null ? null : toNumber(batch.widthMm),
        receivedOn: batch.receivedOn.toISOString().slice(0, 10),
        onHand,
        free: Math.max(0, onHand - others),
      });
      reels.set(batch.materialId, rows);
    }

    /*
     * A claim from before reels were named cannot be taken off the roll it is
     * on, because nothing knows which. It comes off the material's oldest rolls
     * instead — the same order a claim would have been allocated in — so it
     * still counts and still cannot be double-spent.
     */
    for (const line of lines) {
      let loose = 0;
      for (const [key, quantity] of looseByMaterial) {
        if (key.endsWith(`:${line.materialId}`) && !key.startsWith(`${card.id}:`))
          loose += quantity;
      }
      if (loose <= 0) continue;
      const rows = (reels.get(line.materialId) ?? []).sort((a, b) =>
        a.receivedOn < b.receivedOn ? -1 : 1,
      );
      for (const row of rows) {
        if (loose <= 0) break;
        const take = Math.min(row.free, loose);
        row.free = Math.max(0, row.free - take);
        loose -= take;
      }
    }

    out.set(card.id, availabilityFor(lines, { reels }));
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
  lines: MaterialAvailability[],
): Promise<void> {
  /*
   * Cleared and rewritten rather than reconciled.
   *
   * A card's claim is a set of rolls, and which rolls it should be on changes
   * whenever the quantity changes or somebody else takes a roll first. Working
   * out the difference between two sets of rolls is a great deal of code for a
   * card that holds three of them, and the state it produces is the same.
   *
   * The release is a status change rather than a delete: a claim that was
   * standing yesterday is worth being able to read.
   */
  await tx.stockReservation.updateMany({
    where: { productionOrderId: cardId, status: 'HELD' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });

  for (const line of lines) {
    for (const reel of line.reels) {
      /*
       * Upserted rather than created: the row just released may be this exact
       * (card, roll) pair, and the unique key would refuse a second one.
       */
      await tx.stockReservation.upsert({
        where: {
          productionOrderId_batchId: { productionOrderId: cardId, batchId: reel.batchId },
        },
        create: {
          productionOrderId: cardId,
          materialId: line.materialId,
          batchId: reel.batchId,
          quantity: reel.quantity,
          status: 'HELD',
        },
        update: { quantity: reel.quantity, status: 'HELD', releasedAt: null },
      });
    }
  }
}

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
