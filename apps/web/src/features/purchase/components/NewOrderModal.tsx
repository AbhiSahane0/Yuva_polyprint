import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createPurchaseOrderSchema, formatRs, purchaseUnitsFor, unitLabel } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { useMaterials } from '@/features/rates/api/rate-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreatePurchaseOrder, useSuppliers } from '../api/purchase-api';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

interface Line {
  materialId: string;
  quantity: string;
  unit: string;
  ratePerUnit: string;
}

const BLANK_LINE: Line = { materialId: '', quantity: '', unit: '', ratePerUnit: '' };

/**
 * Raising an order.
 *
 * Several lines, because one order to one supplier usually covers more than one
 * material and a part-delivery of one should not block the others. Each line
 * carries its own unit — film is ordered by the tonne — and that unit is the one
 * deliveries against it are entered in, so the order reads the way the supplier
 * invoices it.
 */
export function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: suppliers } = useSuppliers();
  const { data: materials } = useMaterials();
  const create = useCreatePurchaseOrder();

  const [supplierId, setSupplierId] = useState('');
  const [orderedOn, setOrderedOn] = useState(today());
  const [expectedOn, setExpectedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...BLANK_LINE }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSupplierId('');
    setOrderedOn(today());
    setExpectedOn('');
    setNotes('');
    setLines([{ ...BLANK_LINE }]);
  }, [open]);

  const active = (suppliers ?? []).filter((row) => row.isActive);
  const films = materials ?? [];

  function setLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  /** Picking a material defaults the unit to the one it is stocked in. */
  function chooseMaterial(index: number, materialId: string) {
    const material = films.find((row) => row.id === materialId);
    setLine(index, { materialId, unit: material?.unit ?? '' });
  }

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.ratePerUnit) || 0),
    0,
  );

  async function onSubmit() {
    setError(null);
    const parsed = createPurchaseOrderSchema.safeParse({
      supplierId,
      orderedOn,
      expectedOn,
      notes,
      lines,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the order and try again.');
      return;
    }

    try {
      const order = await create.mutateAsync(parsed.data);
      toast.success(`PO-${order.number} raised for ${order.supplierName}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not raise the order.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New purchase order"
      description="What is being ordered, from whom, and when it is due."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={create.isPending}>
            Raise order
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Supplier" htmlFor="supplierId">
          <Select
            id="supplierId"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">— Choose a supplier —</option>
            {active.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ordered on" htmlFor="orderedOn">
            <Input
              id="orderedOn"
              type="date"
              value={orderedOn}
              onChange={(event) => setOrderedOn(event.target.value)}
            />
          </Field>
          {/*
           * Optional, and an order without one is never late. Inventing a
           * deadline the supplier never gave would put orders on the chase list
           * that nobody agreed to chase.
           */}
          <Field label="Expected" htmlFor="expectedOn" hint="Optional — no promise, never late">
            <Input
              id="expectedOn"
              type="date"
              value={expectedOn}
              onChange={(event) => setExpectedOn(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
              Materials
            </span>
            {lines.length < 20 ? (
              <button
                type="button"
                onClick={() => setLines((current) => [...current, { ...BLANK_LINE }])}
                className="border-ink-200 text-ink-600 hover:bg-ink-50 cursor-pointer rounded-[var(--radius-sm)] border bg-white px-2.5 py-1 text-xs font-medium"
              >
                <Plus className="mr-1 inline size-3" />
                Add material
              </button>
            ) : null}
          </div>

          {lines.map((line, index) => {
            const material = films.find((row) => row.id === line.materialId);
            const units = purchaseUnitsFor(line.unit || material?.unit || 'KG');
            const lineTotal = (Number(line.quantity) || 0) * (Number(line.ratePerUnit) || 0);

            return (
              <div key={index} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-4">
                  <Field label={`Material ${index + 1}`} htmlFor={`line-${index}-material`}>
                    <Select
                      id={`line-${index}-material`}
                      value={line.materialId}
                      onChange={(event) => chooseMaterial(index, event.target.value)}
                    >
                      <option value="">— Choose —</option>
                      {films.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Field label="Quantity" htmlFor={`line-${index}-qty`}>
                    <Input
                      id={`line-${index}-qty`}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => setLine(index, { quantity: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Field label="Unit" htmlFor={`line-${index}-unit`}>
                    <Select
                      id={`line-${index}-unit`}
                      value={line.unit}
                      onChange={(event) => setLine(index, { unit: event.target.value })}
                      disabled={!line.materialId}
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unitLabel(unit)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <Field
                    label={`Rate${line.unit ? ` / ${unitLabel(line.unit)}` : ''}`}
                    htmlFor={`line-${index}-rate`}
                    hint={lineTotal > 0 ? formatRs(lineTotal) : undefined}
                  >
                    <Input
                      id={`line-${index}-rate`}
                      inputMode="decimal"
                      value={line.ratePerUnit}
                      onChange={(event) => setLine(index, { ratePerUnit: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-1 pb-2.5">
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove line ${index + 1}`}
                      className="text-ink-400 hover:text-danger-600 cursor-pointer p-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {total > 0 ? (
          <p className="text-ink-600 text-right text-sm">
            Order value <strong className="text-ink-900">{formatRs(total)}</strong>
          </p>
        ) : null}

        <Field label="Notes" htmlFor="orderNotes">
          <Input
            id="orderNotes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 rounded-[var(--radius-md)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
