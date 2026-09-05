import { useEffect, useState } from 'react';
import {
  formatNumber,
  receivePurchaseLineSchema,
  unitLabel,
  type PurchaseOrderLine,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useReceivePurchaseLine } from '../api/purchase-api';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A delivery arriving against one line.
 *
 * Two quantities, because a lorry rarely arrives perfect: what was **accepted**
 * opens a stock batch, and what was **rejected** is recorded and goes no
 * further. Faulty goods are not inventory — counting them would overstate what
 * the works can actually print with.
 *
 * The batch code is asked for only when something was accepted. A delivery
 * turned away entirely opens no batch, so there is nothing to name.
 */
export function ReceiveLineModal({
  line,
  onClose,
}: {
  line: PurchaseOrderLine | null;
  onClose: () => void;
}) {
  const receive = useReceivePurchaseLine();

  const [receivedOn, setReceivedOn] = useState(today());
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [reason, setReason] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setError(null);
    setReceivedOn(today());
    // Defaulted to what is still owed, which is what usually turns up.
    setAccepted(String(line.outstanding));
    setRejected('');
    setReason('');
    setBatchCode('');
    setLocation('');
    setNotes('');
  }, [line]);

  if (!line) return null;

  const unit = unitLabel(line.unit);
  const acceptedNumber = Number(accepted) || 0;
  const rejectedNumber = Number(rejected) || 0;
  const remaining = Math.max(0, line.outstanding - acceptedNumber - rejectedNumber);

  async function onSubmit() {
    if (!line) return;
    setError(null);

    const parsed = receivePurchaseLineSchema.safeParse({
      lineId: line.id,
      receivedOn,
      acceptedQuantity: accepted || 0,
      rejectedQuantity: rejected || 0,
      rejectionReason: reason,
      batchCode,
      location,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the figures and try again.');
      return;
    }

    try {
      await receive.mutateAsync(parsed.data);
      toast.success(
        acceptedNumber > 0
          ? `${formatNumber(acceptedNumber, 2)} ${unit} of ${line.materialName} into stock`
          : `Delivery of ${line.materialName} turned away`,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not record the delivery.');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive ${line.materialName}`}
      description={`${formatNumber(line.outstanding, 2)} ${unit} still expected on this line.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={receive.isPending}>
            Record delivery
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Delivered on" htmlFor="receivedOn">
          <Input
            id="receivedOn"
            type="date"
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Accepted (${unit})`}
            htmlFor="acceptedQuantity"
            hint={
              acceptedNumber > 0 && line.unit.toUpperCase() !== line.stockUnit.toUpperCase()
                ? `Into stock in ${line.stockUnit}`
                : 'Goes into stock'
            }
          >
            <Input
              id="acceptedQuantity"
              inputMode="decimal"
              value={accepted}
              onChange={(event) => setAccepted(event.target.value)}
            />
          </Field>
          {/*
           * Recorded, never stocked. What the works sent back is not something
           * it can print with, and counting it would overstate the shelf.
           */}
          <Field
            label={`Rejected (${unit})`}
            htmlFor="rejectedQuantity"
            hint="Faulty or short — never enters stock"
          >
            <Input
              id="rejectedQuantity"
              inputMode="decimal"
              value={rejected}
              onChange={(event) => setRejected(event.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        {rejectedNumber > 0 ? (
          <Field
            label="What was wrong with it"
            htmlFor="rejectionReason"
            hint="Required — this is what gets taken up with the supplier"
          >
            <Input
              id="rejectionReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Water damage to two rolls"
            />
          </Field>
        ) : null}

        {acceptedNumber > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch or lot" htmlFor="batchCode" hint="From the delivery note">
              <Input
                id="batchCode"
                value={batchCode}
                onChange={(event) => setBatchCode(event.target.value)}
                placeholder="PET-2026-081"
              />
            </Field>
            <Field label="Location" htmlFor="location" hint="Where it is stored">
              <Input
                id="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Warehouse A"
              />
            </Field>
          </div>
        ) : null}

        <Field label="Notes" htmlFor="receiptNotes">
          <Input
            id="receiptNotes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
          />
        </Field>

        {remaining > 0 && acceptedNumber + rejectedNumber > 0 ? (
          <p className="text-ink-500 text-sm">
            {formatNumber(remaining, 2)} {unit} would still be outstanding — the line stays open for
            it.
          </p>
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
