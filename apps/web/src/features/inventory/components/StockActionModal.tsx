import { useEffect, useMemo, useState } from 'react';
import {
  adjustStockSchema,
  formatNumber,
  issueStockSchema,
  transferStockSchema,
  type CustomerJob,
  type MaterialStock,
  type StockBatch,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useAdjustStock, useIssueStock, useTransferStock } from '../api/inventory-api';

export type StockAction = 'ISSUE' | 'WASTE' | 'ADJUST' | 'TRANSFER';

const TITLES: Record<StockAction, { title: string; description: string; verb: string }> = {
  ISSUE: {
    title: 'Issue material',
    description: 'Takes stock out of a batch and records what it went to.',
    verb: 'Issue',
  },
  WASTE: {
    title: 'Record waste',
    description: 'Stock lost rather than used. Counted separately from what a job consumed.',
    verb: 'Record',
  },
  ADJUST: {
    title: 'Cycle count',
    description: 'Moves the books to what is physically on the shelf.',
    verb: 'Save count',
  },
  TRANSFER: {
    title: 'Transfer batch',
    description: 'Moves a batch to another location. Changes where stock is, not how much.',
    verb: 'Transfer',
  },
};

/**
 * The three actions that take stock out, correct it, or move it.
 *
 * One component because the shape is identical — pick a batch, then one or two
 * fields — and because keeping them together is what stops the batch picker
 * behaving differently on each. What differs is asked for explicitly below.
 */
export function StockActionModal({
  action,
  stock,
  jobs,
  onClose,
}: {
  action: StockAction | null;
  stock: MaterialStock;
  /** The customer's designs, when a job can be named. Empty is fine. */
  jobs: CustomerJob[];
  onClose: () => void;
}) {
  const issue = useIssueStock();
  const adjust = useAdjustStock();
  const transfer = useTransferStock();

  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [jobId, setJobId] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * Batches that still hold something, oldest first.
   *
   * An emptied batch stays on record for its history, but it is not somewhere
   * stock can be taken from — offering it would be offering nothing. A transfer
   * is the exception: an empty batch can still be tidied onto another shelf.
   */
  const available: StockBatch[] = useMemo(
    () =>
      action === 'TRANSFER' ? stock.batches : stock.batches.filter((batch) => batch.quantity > 0),
    [action, stock.batches],
  );

  useEffect(() => {
    if (!action) return;
    setError(null);
    setQuantity('');
    setJobId('');
    setToLocation('');
    setReference('');
    setNotes('');
    // The oldest batch with stock, which is the one that should be used next.
    setBatchId(available[0]?.id ?? '');
    /*
     * `available` is memoised on purpose. Built inline it would be a new array
     * every render, and depending on it here would reset the batch — and every
     * field below it — on each keystroke. Opening the modal or switching
     * material is when a fresh default is wanted; nothing else is.
     */
  }, [action, available]);

  if (!action) return null;

  const chosen = stock.batches.find((batch) => batch.id === batchId);
  const busy = issue.isPending || adjust.isPending || transfer.isPending;
  const copy = TITLES[action];

  async function onSubmit() {
    if (!batchId) {
      setError('Choose which batch.');
      return;
    }
    setError(null);

    /*
     * Captured and re-checked, not asserted.
     *
     * `action` is a prop, so the early return above does not narrow it inside
     * this handler — a function declaration is hoisted past the guard. Testing
     * the local is what makes the narrowing real rather than a cast that would
     * hold until the day the prop can change mid-submit.
     */
    const kind = action;
    if (!kind) return;

    /*
     * Checked here against the same schema the server uses, so the office is
     * told which field is wrong and why.
     *
     * The server validates too — it must, it is the only thing that can be
     * trusted — but its answer for a bad field is the generic "Validation
     * failed", with the useful part in a details object this dialog would have
     * to unpack. Parsing here means "Say briefly what the count found" reaches
     * the screen instead, and without a round trip.
     */
    /** The first thing wrong with it, in the schema's own words. */
    const complain = (issues: { message: string }[]) =>
      setError(issues[0]?.message ?? 'Check the figures and try again.');

    try {
      if (kind === 'ADJUST') {
        const parsed = adjustStockSchema.safeParse({
          batchId,
          countedQuantity: quantity,
          notes,
          reference,
        });
        if (!parsed.success) return complain(parsed.error.issues);
        const movement = await adjust.mutateAsync(parsed.data);
        const delta = movement.quantity;
        toast.success(
          delta === 0
            ? 'Count agrees with the books'
            : `Count recorded — ${delta > 0 ? 'up' : 'down'} ${formatNumber(Math.abs(delta), 3)} ${stock.summary.unit}`,
        );
      } else if (kind === 'TRANSFER') {
        const parsed = transferStockSchema.safeParse({ batchId, toLocation, notes });
        if (!parsed.success) return complain(parsed.error.issues);
        await transfer.mutateAsync(parsed.data);
        toast.success(`Moved to ${toLocation}`);
      } else {
        const parsed = issueStockSchema.safeParse({
          batchId,
          quantity,
          kind,
          jobId: jobId || null,
          reference,
          notes,
        });
        if (!parsed.success) return complain(parsed.error.issues);
        await issue.mutateAsync(parsed.data);
        toast.success(
          `${kind === 'WASTE' ? 'Waste' : 'Issue'} of ${formatNumber(Number(quantity), 2)} ${stock.summary.unit} recorded`,
        );
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not record that.');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={busy}>
            {copy.verb}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Batch"
          htmlFor="stockBatch"
          hint={
            chosen
              ? `${formatNumber(chosen.quantity, 2)} ${stock.summary.unit} in ${chosen.location}`
              : 'Nothing on hand to take from'
          }
        >
          <Select
            id="stockBatch"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
          >
            {available.length === 0 ? <option value="">— No stock —</option> : null}
            {available.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batchCode} — {formatNumber(batch.quantity, 2)} {stock.summary.unit} ·{' '}
                {batch.location}
              </option>
            ))}
          </Select>
        </Field>

        {action === 'TRANSFER' ? (
          <Field label="Move to" htmlFor="toLocation" hint="Where it is going">
            <Input
              id="toLocation"
              value={toLocation}
              onChange={(event) => setToLocation(event.target.value)}
              placeholder="B-01"
            />
          </Field>
        ) : action === 'ADJUST' ? (
          <>
            {/*
             * What was counted, not the difference. The office counts a shelf
             * and types what is on it; working out the correction — and getting
             * its sign right — is exactly the arithmetic a count exists to
             * check, so the server does it.
             */}
            <Field
              label="Counted quantity"
              htmlFor="quantity"
              hint={
                chosen
                  ? `Books say ${formatNumber(chosen.quantity, 2)} ${stock.summary.unit}`
                  : undefined
              }
            >
              <Input
                id="quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field label="What the count found" htmlFor="notes" hint="Required">
              <Input
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Damaged roll set aside"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Quantity" htmlFor="quantity">
              <Input
                id="quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field
              label="For which job"
              htmlFor="jobId"
              hint={
                jobs.length > 0
                  ? 'Optional — lets consumption be totalled per design later'
                  : 'No designs on record yet'
              }
            >
              <Select id="jobId" value={jobId} onChange={(event) => setJobId(event.target.value)}>
                <option value="">— Not against a job —</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes">
              <Input
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional"
              />
            </Field>
          </>
        )}

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
