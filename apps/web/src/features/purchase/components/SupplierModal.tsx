import { useEffect, useState } from 'react';
import { supplierSchema, type Supplier } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateSupplier, useUpdateSupplier } from '../api/purchase-api';

const BLANK = {
  name: '',
  contactPerson: '',
  mobile: '',
  email: '',
  address: '',
  gstNumber: '',
  notes: '',
};

/**
 * Adding or editing a supplier.
 *
 * Deliberately short. What they supply and what they last charged are answered
 * by the orders placed with them, so asking for either here would create a
 * second copy that goes stale the first time somebody orders something else.
 */
export function SupplierModal({
  supplierId,
  suppliers,
  onClose,
}: {
  /** Null to add, an id to edit, undefined when closed. */
  supplierId: string | null | undefined;
  suppliers: Supplier[];
  onClose: () => void;
}) {
  const existing = supplierId ? suppliers.find((row) => row.id === supplierId) : undefined;
  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplierId ?? '');

  const [form, setForm] = useState(BLANK);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (supplierId === undefined) return;
    setError(null);
    setIsActive(existing?.isActive ?? true);
    setForm(
      existing
        ? {
            name: existing.name,
            // 'NA' is the importer's placeholder and is shown as empty.
            contactPerson: existing.contactPerson === 'NA' ? '' : existing.contactPerson,
            mobile: existing.mobile === 'NA' ? '' : existing.mobile,
            email: existing.email === 'NA' ? '' : existing.email,
            address: existing.address === 'NA' ? '' : existing.address,
            gstNumber: existing.gstNumber === 'NA' ? '' : existing.gstNumber,
            notes: existing.notes,
          }
        : BLANK,
    );
  }, [supplierId, existing]);

  if (supplierId === undefined) return null;

  const set = (key: keyof typeof BLANK) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit() {
    setError(null);
    const parsed = supplierSchema.safeParse({ ...form, isActive });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.');
      return;
    }

    try {
      if (existing) {
        await update.mutateAsync(parsed.data);
        toast.success(`${parsed.data.name} updated`);
      } else {
        await create.mutateAsync(parsed.data);
        toast.success(`${parsed.data.name} added`);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not save the supplier.');
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add a supplier'}
      description={
        existing
          ? `${existing.orderCount} order${existing.orderCount === 1 ? '' : 's'} placed with them.`
          : 'Who the works buys from.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={busy}>
            {existing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="supplierName">
          <Input
            id="supplierName"
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
            placeholder="Polyfilm Industries"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact person" htmlFor="contactPerson">
            <Input
              id="contactPerson"
              value={form.contactPerson}
              onChange={(event) => set('contactPerson')(event.target.value)}
            />
          </Field>
          <Field label="Mobile" htmlFor="supplierMobile">
            <Input
              id="supplierMobile"
              inputMode="tel"
              value={form.mobile}
              onChange={(event) => set('mobile')(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" htmlFor="supplierEmail">
            <Input
              id="supplierEmail"
              type="email"
              value={form.email}
              onChange={(event) => set('email')(event.target.value)}
            />
          </Field>
          <Field label="GST number" htmlFor="supplierGst">
            <Input
              id="supplierGst"
              value={form.gstNumber}
              onChange={(event) => set('gstNumber')(event.target.value.toUpperCase())}
            />
          </Field>
        </div>

        <Field label="Address" htmlFor="supplierAddress">
          <Input
            id="supplierAddress"
            value={form.address}
            onChange={(event) => set('address')(event.target.value)}
          />
        </Field>

        <Field label="Notes" htmlFor="supplierNotes">
          <Input
            id="supplierNotes"
            value={form.notes}
            onChange={(event) => set('notes')(event.target.value)}
            placeholder="Optional"
          />
        </Field>

        {existing ? (
          <label className="text-ink-600 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="accent-brand-600 size-4"
            />
            {/* Retired, not deleted — orders already placed still name them. */}
            Active. Unticking keeps their past orders and takes them off the list.
          </label>
        ) : null}

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
