import {
  isDelayed,
  lineOutstanding,
  lineSettled,
  lineTotal,
  round,
  statusFromReceipts,
  type CreatePurchaseOrderInput,
  type ListPurchaseOrdersQuery,
  type ListSuppliersQuery,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderList,
  type PurchaseOrderSummary,
  type PurchaseReceipt,
  type ReceivePurchaseLineInput,
  type Supplier,
  type SupplierInput,
  type UpdatePurchaseOrderInput,
  type UpdateSupplierInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import { receiveStock } from '../inventory/inventory.service.js';

/**
 * Buying, and the join to holding.
 *
 * The load-bearing decision here is that **accepting a delivery does not write
 * stock itself** — it calls `receiveStock`, the same path a manual receipt
 * takes. One way stock comes into existence, one ledger recording it, one place
 * that converts units and one place that could get a balance wrong. A second
 * implementation living here would drift from it within a month.
 *
 * The other is that an order's progress is **derived from its receipts**, never
 * ticked by hand. An order somebody forgot to mark as received is exactly the
 * order they are chasing.
 */

const toNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today, in the office's terms — what "late" is measured against. */
const today = () => toISODate(new Date());

const ORDER_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  lines: {
    orderBy: { position: 'asc' },
    include: {
      material: { select: { name: true, unit: true } },
      receipts: { orderBy: { receivedOn: 'asc' } },
    },
  },
  receipts: {
    orderBy: { createdAt: 'desc' },
    include: {
      line: { include: { material: { select: { name: true } } } },
      batch: { select: { batchCode: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

type OrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** One line, with what its receipts add up to. */
function toLine(row: OrderRow['lines'][number]): PurchaseOrderLine {
  const quantity = toNumber(row.quantity);
  const accepted = round(
    row.receipts.reduce((total, receipt) => total + toNumber(receipt.acceptedQuantity), 0),
    3,
  );
  const rejected = round(
    row.receipts.reduce((total, receipt) => total + toNumber(receipt.rejectedQuantity), 0),
    3,
  );
  const closed = row.closedAt !== null;

  return {
    id: row.id,
    position: row.position,
    materialId: row.materialId,
    materialName: row.material.name,
    stockUnit: row.material.unit,
    quantity,
    unit: row.unit,
    ratePerUnit: toNumber(row.ratePerUnit),
    total: lineTotal(quantity, toNumber(row.ratePerUnit)),
    acceptedQuantity: accepted,
    rejectedQuantity: rejected,
    outstanding: lineOutstanding({ quantity, accepted, rejected, closed }),
    settled: lineSettled({ quantity, accepted, rejected, closed }),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedReason: row.closedReason,
  };
}

function toReceipt(row: OrderRow['receipts'][number]): PurchaseReceipt {
  return {
    id: row.id,
    lineId: row.lineId,
    materialName: row.line.material.name,
    receivedOn: toISODate(row.receivedOn),
    acceptedQuantity: toNumber(row.acceptedQuantity),
    rejectedQuantity: toNumber(row.rejectedQuantity),
    rejectionReason: row.rejectionReason,
    unit: row.line.unit,
    batchId: row.batchId,
    batchCode: row.batch?.batchCode ?? null,
    notes: row.notes,
    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSummary(row: OrderRow): PurchaseOrderSummary {
  const lines = row.lines.map(toLine);
  const expectedOn = row.expectedOn ? toISODate(row.expectedOn) : null;

  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    status: row.status,
    isDelayed: isDelayed({ status: row.status, expectedOn }, today()),
    orderedOn: toISODate(row.orderedOn),
    expectedOn,
    lineCount: lines.length,
    total: round(
      lines.reduce((sum, line) => sum + line.total, 0),
      2,
    ),
    // What was actually accepted, at the rate agreed. Rejected goods are not
    // spend — they were sent back.
    receivedValue: round(
      lines.reduce((sum, line) => sum + line.acceptedQuantity * line.ratePerUnit, 0),
      2,
    ),
    raisedBy: row.raisedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOrder(row: OrderRow): PurchaseOrder {
  return {
    ...toSummary(row),
    notes: row.notes,
    lines: row.lines.map(toLine),
    receipts: row.receipts.map(toReceipt),
  };
}

/* --- Suppliers ----------------------------------------------------------- */

export async function listSuppliers(query: ListSuppliersQuery): Promise<Supplier[]> {
  const filters: Prisma.SupplierWhereInput[] = [];
  if (!query.includeInactive) filters.push({ isActive: true });
  if (query.q) filters.push({ name: { contains: query.q, mode: 'insensitive' } });

  const rows = await prisma.supplier.findMany({
    where: filters.length > 0 ? { AND: filters } : {},
    orderBy: { name: 'asc' },
    include: {
      /*
       * What they supply and what they last charged come from the orders
       * placed with them. Storing either would be a second copy of a fact,
       * and it is the copy nobody would keep up to date.
       */
      purchaseOrders: {
        orderBy: { orderedOn: 'desc' },
        select: {
          status: true,
          orderedOn: true,
          lines: {
            orderBy: { position: 'asc' },
            select: { ratePerUnit: true, unit: true, material: { select: { name: true } } },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const materials = [
      ...new Set(row.purchaseOrders.flatMap((o) => o.lines.map((l) => l.material.name))),
    ];
    // The newest order carrying a line, since an order may have none.
    const newest = row.purchaseOrders.find((order) => order.lines.length > 0);
    const line = newest?.lines[0];

    return {
      id: row.id,
      name: row.name,
      contactPerson: row.contactPerson,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      gstNumber: row.gstNumber,
      notes: row.notes,
      isActive: row.isActive,
      materials,
      orderCount: row.purchaseOrders.length,
      lastRate:
        newest && line
          ? {
              material: line.material.name,
              ratePerUnit: toNumber(line.ratePerUnit),
              unit: line.unit,
              on: toISODate(newest.orderedOn),
            }
          : null,
      openOrders: row.purchaseOrders.filter(
        (order) => order.status !== 'RECEIVED' && order.status !== 'CANCELLED',
      ).length,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const clash = await prisma.supplier.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  // Named rather than generic: two suppliers with one name cannot be told apart
  // on an order, and the usual cause is somebody adding one that already exists.
  if (clash) throw ApiError.conflict(`${input.name} is already on the supplier list`);

  const created = await prisma.supplier.create({ data: input, select: { id: true } });
  const [supplier] = await listSuppliers({ page: 1, pageSize: 1, q: input.name });
  if (!supplier) throw ApiError.notFound('Supplier not found after creating it');
  return { ...supplier, id: created.id };
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Supplier not found');

  if (input.name) {
    const clash = await prisma.supplier.findUnique({
      where: { name: input.name },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      throw ApiError.conflict(`${input.name} is already on the supplier list`);
    }
  }

  await prisma.supplier.update({ where: { id }, data: input });
  const suppliers = await listSuppliers({ page: 1, pageSize: 500, includeInactive: true });
  const supplier = suppliers.find((row) => row.id === id);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  return supplier;
}

/**
 * Removes a supplier nobody has ordered from.
 *
 * An order names who it was placed with, and a purchase order is a document
 * that left the building — so a supplier with any order against them is
 * refused and retired instead, which is what the switch on their card does.
 * The database agrees: `purchase_orders.supplier_id` is `Restrict`. This says
 * it in words first, because a foreign-key error is not an answer.
 *
 * What is left is the case this exists for: a name typed wrong, or a supplier
 * added and never used.
 */
export async function deleteSupplier(id: string): Promise<{ id: string }> {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!supplier) throw ApiError.notFound('Supplier not found');

  const orders = await prisma.purchaseOrder.count({ where: { supplierId: id } });
  if (orders > 0) {
    throw ApiError.conflict(
      `${supplier.name} is on ${orders} purchase ${orders === 1 ? 'order' : 'orders'}. ` +
        'Retire them instead — an order has to stay able to say who it was placed with.',
    );
  }

  await prisma.supplier.delete({ where: { id } });
  return { id };
}

/* --- Orders -------------------------------------------------------------- */

/** The number the next order will take. A peek, not a reservation. */
export async function peekNextNumber(): Promise<number> {
  const latest = await prisma.purchaseOrder.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (latest?.number ?? 4470) + 1;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  raisedBy: string,
): Promise<PurchaseOrder> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, isActive: true, name: true },
  });
  if (!supplier) throw ApiError.notFound('That supplier is not on the list');
  if (!supplier.isActive) {
    throw ApiError.badRequest(`${supplier.name} has been retired — bring them back first`);
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: input.lines.map((line) => line.materialId) } },
    select: { id: true, name: true, unit: true, isActive: true },
  });
  const byId = new Map(materials.map((material) => [material.id, material]));

  for (const line of input.lines) {
    const material = byId.get(line.materialId);
    if (!material) throw ApiError.badRequest('One of those materials is not on the rates list');
    if (!material.isActive) {
      throw ApiError.badRequest(`${material.name} has been retired — bring it back under Rates`);
    }
  }

  const id = await prisma.$transaction(async (tx) => {
    /*
     * Numbered inside the transaction, so two orders raised in the same second
     * cannot take the same number. The unique index is the real guarantee; this
     * makes the collision rare enough that a retry is never needed in practice.
     */
    const latest = await tx.purchaseOrder.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const created = await tx.purchaseOrder.create({
      data: {
        number: (latest?.number ?? 4470) + 1,
        supplierId: input.supplierId,
        orderedOn: parseDate(input.orderedOn),
        expectedOn: input.expectedOn ? parseDate(input.expectedOn) : null,
        notes: input.notes,
        raisedBy,
        lines: {
          create: input.lines.map((line, index) => ({
            position: index + 1,
            materialId: line.materialId,
            quantity: line.quantity,
            // Blank means the material's own — the ordinary case, where the
            // supplier invoices in the unit the works stocks in.
            unit: (line.unit || byId.get(line.materialId)!.unit).toUpperCase(),
            ratePerUnit: line.ratePerUnit,
          })),
        },
      },
      select: { id: true },
    });

    return created.id;
  });

  /*
   * Read back outside the transaction, deliberately.
   *
   * `ORDER_INCLUDE` is three levels deep, and Prisma issues a deep include as
   * several queries which it may run concurrently — on a transaction's single
   * connection that is a use-after-busy, and `pg` warns about it. Nothing here
   * needs the read to be transactional: the order is committed by this point.
   */
  return getPurchaseOrder(id);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const row = await prisma.purchaseOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!row) throw ApiError.notFound('Purchase order not found');
  return toOrder(row);
}

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, status: true, number: true },
  });
  if (!existing) throw ApiError.notFound('Purchase order not found');

  /*
   * An order that has started arriving cannot be walked back to "ordered".
   *
   * Its status is a fact about the deliveries against it, and stock has already
   * been created from them — changing the label would make the order disagree
   * with the ledger without undoing anything.
   */
  const arrived = existing.status === 'PARTIALLY_RECEIVED' || existing.status === 'RECEIVED';
  if (input.status && arrived) {
    throw ApiError.badRequest(
      `PO-${existing.number} has deliveries against it — its status follows those, not the other way round`,
    );
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.expectedOn !== undefined
        ? { expectedOn: input.expectedOn ? parseDate(input.expectedOn) : null }
        : {}),
    },
  });

  return getPurchaseOrder(id);
}

/* --- Receiving: where buying becomes holding ----------------------------- */

/**
 * Recomputes an order's status from its lines, inside the caller's transaction.
 *
 * Never sets ORDERED, IN_TRANSIT or CANCELLED — those are the office's, and an
 * order cancelled while a delivery was in the yard should stay cancelled for
 * somebody to look at rather than being silently reopened.
 */
async function restatus(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { orderId },
    select: {
      quantity: true,
      closedAt: true,
      receipts: { select: { acceptedQuantity: true, rejectedQuantity: true } },
    },
  });

  const next = statusFromReceipts(
    lines.map((line) => ({
      quantity: toNumber(line.quantity),
      accepted: line.receipts.reduce((sum, r) => sum + toNumber(r.acceptedQuantity), 0),
      rejected: line.receipts.reduce((sum, r) => sum + toNumber(r.rejectedQuantity), 0),
      closed: line.closedAt !== null,
    })),
  );

  if (next) await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: next } });
}

/**
 * A delivery against one line.
 *
 * **The accepted quantity becomes stock through `receiveStock`** — the same
 * path a manual receipt takes, so units convert once, the ledger is written
 * once, and there is one place a balance could be got wrong. Rejected material
 * is recorded here and goes no further: faulty goods are not inventory, and
 * counting them would overstate what the works can actually print with.
 */
export async function receivePurchaseLine(
  input: ReceivePurchaseLineInput,
  enteredBy: string,
): Promise<PurchaseOrder> {
  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: input.lineId },
    include: {
      material: { select: { id: true, name: true } },
      order: { select: { id: true, number: true, status: true } },
      receipts: { select: { acceptedQuantity: true, rejectedQuantity: true } },
    },
  });
  if (!line) throw ApiError.notFound('That order line no longer exists');

  if (line.order.status === 'CANCELLED') {
    throw ApiError.badRequest(
      `PO-${line.order.number} was cancelled — reopen it before booking a delivery in`,
    );
  }
  if (line.closedAt) {
    throw ApiError.badRequest(
      `That line was closed: ${line.closedReason || 'no more expected'}. Reopen it to receive against it.`,
    );
  }

  const ordered = toNumber(line.quantity);
  const already = round(
    line.receipts.reduce(
      (sum, r) => sum + toNumber(r.acceptedQuantity) + toNumber(r.rejectedQuantity),
      0,
    ),
    3,
  );
  const arriving = round(input.acceptedQuantity + input.rejectedQuantity, 3);

  /*
   * More than was ordered, and by more than a rounding wobble.
   *
   * Refused rather than accepted quietly: a supplier who sends 4,000 against an
   * order for 400 has made a mistake somebody needs to ring them about, and the
   * cost of finding out from the stock figure a week later is far higher than
   * the cost of an extra order line today.
   */
  if (already + arriving > ordered + 0.001) {
    throw ApiError.badRequest(
      `PO-${line.order.number} ordered ${ordered} ${line.unit} of ${line.material.name}; ` +
        `${already} already arrived and this would make ${round(already + arriving, 3)}`,
    );
  }

  const orderId = await prisma.$transaction(async (tx) => {
    /*
     * Stock first, then the receipt that points at it.
     *
     * Both are in this transaction, so neither survives the other failing —
     * a receipt naming a batch that was never created would be worse than no
     * receipt at all.
     */
    let batchId: string | null = null;

    if (input.acceptedQuantity > 0) {
      const batch = await receiveStock(
        {
          materialId: line.materialId,
          newMaterial: null,
          unit: line.unit,
          batchCode: input.batchCode.trim(),
          quantity: input.acceptedQuantity,
          location: input.location,
          receivedOn: input.receivedOn,
          // What the order agreed, per the unit it was ordered in. The stock
          // module converts it to the stocked unit alongside the quantity.
          ratePerUnit: toNumber(line.ratePerUnit),
          reference: `PO-${line.order.number}`,
          notes: input.notes,
        },
        enteredBy,
        tx,
      );
      batchId = batch.id;
    }

    await tx.purchaseReceipt.create({
      data: {
        lineId: line.id,
        orderId: line.order.id,
        receivedOn: parseDate(input.receivedOn),
        acceptedQuantity: input.acceptedQuantity,
        rejectedQuantity: input.rejectedQuantity,
        rejectionReason: input.rejectionReason,
        batchId,
        notes: input.notes,
        enteredBy,
      },
    });

    await restatus(tx, line.order.id);
    return line.order.id;
  });

  return getPurchaseOrder(orderId);
}

/**
 * Give up on the balance of a line.
 *
 * A supplier who sends 380 of 400 and will not send the rest leaves a line that
 * is neither open nor complete. Without this it sits on the pending list
 * forever, and a pending list with permanent residents stops being read.
 */
export async function closePurchaseLine(lineId: string, reason: string): Promise<PurchaseOrder> {
  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: lineId },
    select: { id: true, orderId: true, closedAt: true },
  });
  if (!line) throw ApiError.notFound('That order line no longer exists');
  if (line.closedAt) throw ApiError.badRequest('That line is already closed');

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.update({
      where: { id: lineId },
      data: { closedAt: new Date(), closedReason: reason },
    });
    await restatus(tx, line.orderId);
  });

  return getPurchaseOrder(line.orderId);
}

/* --- The list ------------------------------------------------------------ */

export async function listPurchaseOrders(
  query: ListPurchaseOrdersQuery,
): Promise<PurchaseOrderList> {
  const filters: Prisma.PurchaseOrderWhereInput[] = [];
  if (query.status) filters.push({ status: query.status });
  if (query.supplierId) filters.push({ supplierId: query.supplierId });
  if (query.q) {
    const asNumber = Number(query.q.replace(/^PO-?/i, ''));
    filters.push({
      OR: [
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
        ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ number: Math.trunc(asNumber) }] : []),
      ],
    });
  }

  const rows = await prisma.purchaseOrder.findMany({
    where: filters.length > 0 ? { AND: filters } : {},
    include: ORDER_INCLUDE,
    /*
     * Work order, like the quotation list: what still needs chasing first, then
     * newest. Postgres orders an enum by declaration, and the statuses are
     * declared ORDERED, IN_TRANSIT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED —
     * which is exactly open-first, settled-last.
     */
    orderBy: [{ status: 'asc' }, { number: 'desc' }],
  });

  const all = rows.map(toSummary);
  const day = today();

  const [activeSuppliers, spendThisMonth] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    monthSpend(day),
  ]);

  const open = all.filter((order) => order.status !== 'RECEIVED' && order.status !== 'CANCELLED');

  const totals = {
    activeSuppliers,
    openOrders: open.length,
    delayed: all.filter((order) => order.isDelayed).length,
    /*
     * Ordered but not yet delivered, at the rates agreed. Deliberately not
     * called spend: this money has not been spent, it has been committed, and
     * conflating the two makes a cash position look worse than it is.
     */
    outstandingValue: round(
      open.reduce((sum, order) => sum + (order.total - order.receivedValue), 0),
      2,
    ),
    spendThisMonth,
  };

  const visible = query.delayedOnly ? all.filter((order) => order.isDelayed) : all;
  return { items: visible, totals };
}

/**
 * What has actually been accepted this calendar month, at the rates agreed.
 *
 * Accepted, not ordered: an order placed today for delivery next month is not
 * this month's spend, and rejected material was sent back rather than bought.
 */
async function monthSpend(day: string): Promise<number> {
  const from = new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`);

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { receivedOn: { gte: from } },
    select: { acceptedQuantity: true, line: { select: { ratePerUnit: true } } },
  });

  return round(
    receipts.reduce(
      (sum, receipt) =>
        sum + toNumber(receipt.acceptedQuantity) * toNumber(receipt.line.ratePerUnit),
      0,
    ),
    2,
  );
}
