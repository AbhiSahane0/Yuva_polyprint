import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { receiveStockSchema, type ReceiveStockInput } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { useMaterials } from '@/features/rates/api/rate-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useReceiveStock } from '../api/inventory-api';

/** Today, in the yyyy-mm-dd the date input and the schema both want. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A delivery arriving.
 *
 * The only action that creates a batch, and the only one that asks what was
 * paid — the rate on a delivery is what the stock is worth, and it is not
 * always the rate on the morning's rates screen.
 */
export function ReceiveStockModal({
  open,
  onClose,
  materialId,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixed when opened from a material's own page. */
  materialId?: string;
}) {
  const { data: materials } = useMaterials();
  const receive = useReceiveStock();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReceiveStockInput>({
    resolver: zodResolver(receiveStockSchema) as never,
    defaultValues: { receivedOn: today(), location: '', materialId: materialId ?? '' },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset({ receivedOn: today(), location: '', materialId: materialId ?? '' } as ReceiveStockInput);
  }, [open, materialId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const batch = await receive.mutateAsync(values);
      toast.success(`Received ${batch.quantity} ${batch.unit} of ${batch.materialName}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not record the delivery.');
    }
  });

  const films = materials ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive material"
      description="Records the delivery and opens a batch for it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={receive.isPending}>
            Receive
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Material" htmlFor="materialId" error={errors.materialId?.message}>
          <Select id="materialId" disabled={Boolean(materialId)} {...register('materialId')}>
            <option value="">— Choose a material —</option>
            {films.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Batch or lot"
            htmlFor="batchCode"
            hint="From the delivery note"
            error={errors.batchCode?.message}
          >
            <Input id="batchCode" placeholder="PET-2026-081" {...register('batchCode')} />
          </Field>
          <Field label="Received on" htmlFor="receivedOn" error={errors.receivedOn?.message}>
            <Input id="receivedOn" type="date" {...register('receivedOn')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="quantity" error={errors.quantity?.message}>
            <Input id="quantity" inputMode="decimal" {...register('quantity')} />
          </Field>
          {/*
           * What was paid, not today's rate. Optional, because the office does
           * not always have the invoice when the lorry arrives — the catalogue
           * rate stands in for valuation until somebody fills it in.
           */}
          <Field
            label="Rate paid"
            htmlFor="ratePerUnit"
            hint="Optional — today's rate is used if blank"
            error={errors.ratePerUnit?.message}
          >
            <Input
              id="ratePerUnit"
              inputMode="decimal"
              placeholder="Rs. / unit"
              {...register('ratePerUnit')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location" htmlFor="location" hint="Where it is stored">
            <Input id="location" placeholder="Warehouse A" {...register('location')} />
          </Field>
          <Field label="Reference" htmlFor="reference" hint="PO or invoice number">
            <Input id="reference" placeholder="PO-4471" {...register('reference')} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes">
          <Input id="notes" placeholder="Optional" {...register('notes')} />
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
