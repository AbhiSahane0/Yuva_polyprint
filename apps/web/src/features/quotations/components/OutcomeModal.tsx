import { useEffect, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import type { QuotationSummary } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useRecordOutcome } from '../api/quotation-api';

/**
 * Records what the customer said.
 *
 * Winning is not just a status: it creates the customer if they were only ever
 * a name on this quotation, and turns every line into a job on their record. So
 * the dialog says what it is about to do before it does it, rather than leaving
 * the office to discover new rows appearing elsewhere.
 */
export function OutcomeModal({
  quotation,
  onClose,
}: {
  quotation: QuotationSummary | null;
  onClose: () => void;
}) {
  const open = quotation !== null;
  const [choice, setChoice] = useState<'WON' | 'LOST' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const record = useRecordOutcome();

  useEffect(() => {
    if (!open) return;
    setChoice(null);
    setReason('');
    setError(null);
  }, [open, quotation]);

  function submit() {
    if (!quotation || choice === null) return;
    if (choice === 'LOST' && reason.trim().length < 3) {
      setError('Say briefly why it was turned down.');
      return;
    }
    setError(null);

    record.mutate(
      { id: quotation.id, outcome: choice, lostReason: choice === 'LOST' ? reason.trim() : '' },
      {
        onSuccess: (result) => {
          if (result.status === 'LOST') {
            toast.success(`Quotation #${quotation.number} marked as lost`);
          } else {
            // Say what actually happened, rather than a generic "saved".
            const parts = [`Quotation #${quotation.number} won`];
            if (result.customerCreated) parts.push(`${quotation.customerName} added to customers`);
            if (result.jobsCreated.length > 0)
              parts.push(
                `${result.jobsCreated.length} job${result.jobsCreated.length === 1 ? '' : 's'} added`,
              );
            if (result.jobsSkipped.length > 0)
              parts.push(`${result.jobsSkipped.length} already on file`);
            /* Said outright, because it moved something physical: those
               cylinders are now out of the works and the register says so. */
            if (result.cylindersSent.length > 0)
              parts.push(`${result.cylindersSent.join(', ')} sent for repair`);
            toast.success(parts.join(' · '));
          }
          onClose();
        },
        onError: (cause) =>
          setError(cause instanceof ApiClientError ? cause.message : 'That could not be recorded.'),
      },
    );
  }

  const options = [
    {
      value: 'WON' as const,
      label: 'Accepted',
      hint: 'The customer placed the order',
      icon: CircleCheck,
      active: 'border-success-600 bg-success-50 text-success-600',
    },
    {
      value: 'LOST' as const,
      label: 'Rejected',
      hint: 'They went elsewhere, or dropped it',
      icon: CircleX,
      active: 'border-danger-600 bg-danger-50 text-danger-600',
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={quotation ? `Quotation #${quotation.number}` : 'Outcome'}
      description={quotation ? `What did ${quotation.customerName} say?` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={record.isPending} disabled={choice === null}>
            Record it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setChoice(option.value);
                setError(null);
              }}
              aria-pressed={choice === option.value}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-1 rounded-[var(--radius-md)] border p-3.5 text-left transition-colors',
                choice === option.value
                  ? option.active
                  : 'border-ink-200 text-ink-700 hover:bg-ink-50',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <option.icon className="size-4" />
                {option.label}
              </span>
              <span className="text-ink-500 text-sm">{option.hint}</span>
            </button>
          ))}
        </div>

        {/*
          Only asked for on a rejection, and required there. "We lost it" tells
          nobody anything a year later; the reason is the entire value of
          recording the outcome at all.
        */}
        {choice === 'LOST' ? (
          <Field
            label="Why was it turned down?"
            htmlFor="lostReason"
            required
            hint="A line is enough — price, lead time, went to a competitor."
          >
            <Textarea
              id="lostReason"
              rows={3}
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Price 8% over their current supplier"
            />
          </Field>
        ) : null}

        {choice === 'WON' ? (
          <p className="bg-ink-50 text-ink-600 rounded-[var(--radius-md)] px-3 py-2.5 text-sm">
            <strong className="text-ink-800">{quotation?.customerName}</strong> will be added to
            your customers if they are not there already, and each job on this quotation added to
            their record. Jobs they already have are left alone.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-600 rounded-[var(--radius-md)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {record.isPending ? (
          <p className="text-ink-500 flex items-center gap-2 text-sm">
            <Spinner size="sm" />
            Recording…
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
