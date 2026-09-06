import { useState } from 'react';
import { AlertTriangle, Ban } from 'lucide-react';
import { formatNumber } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useDeleteDesign, useDesignDeletion } from '../api/cylinder-api';

interface Props {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobName: string;
  onDeleted: () => void;
}

/**
 * Deleting a design.
 *
 * The dialog leads with what would actually be destroyed, counted from the
 * database rather than described in general terms. "8 cylinders, 14 events and
 * 1 file" is a decision somebody can make; "are you sure?" is not — and this is
 * the one screen where being sure matters, because none of it comes back.
 */
export function DeleteDesignModal({ open, onClose, jobId, jobName, onDeleted }: Props) {
  const { data: impact, isPending } = useDesignDeletion(jobId, open);
  const remove = useDeleteDesign();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const result = await remove.mutateAsync(jobId);
      toast.success(
        `${result.jobName} deleted` +
          (result.cylinders > 0 ? ` — ${result.cylinders} cylinders removed` : ''),
      );
      onDeleted();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : 'That did not work',
      );
    }
  }

  const busy = remove.isPending;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Delete this design?"
      description={jobName}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {impact?.canDelete ? (
            <Button
              variant="danger"
              loading={busy}
              onClick={() => (confirming ? void submit() : setConfirming(true))}
            >
              {confirming ? 'Press again to delete' : 'Delete design'}
            </Button>
          ) : null}
        </div>
      }
    >
      {isPending || !impact ? (
        <LoadingState label="Checking what this would affect…" />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">
              Deleted with it
            </p>
            <ul className="border-danger-200 divide-danger-100 divide-y rounded-[var(--radius-lg)] border">
              <Line label="Cylinders" value={impact.cylinders} note="and everything they cost" />
              <Line label="Cylinder history" value={impact.cylinderEvents} note="every movement" />
              <Line
                label="Design files"
                value={impact.artworkFiles}
                note="erased from storage, not recoverable"
              />
            </ul>
          </div>

          <div>
            <p className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">Kept</p>
            <ul className="border-ink-200 divide-ink-100 divide-y rounded-[var(--radius-lg)] border">
              {/*
               * The customer is what the office actually worries about here,
               * so it is stated rather than left to be inferred from silence.
               */}
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-ink-700 text-sm">
                  {impact.customerName ?? 'The customer'}
                </span>
                <span className="text-ink-500 text-xs">untouched</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-ink-700 text-sm">
                  {impact.quotationLines === 0
                    ? 'No quotations use this design'
                    : `${formatNumber(impact.quotationLines)} quotation line${
                        impact.quotationLines === 1 ? '' : 's'
                      }`}
                  {impact.quotationNumbers.length > 0
                    ? ` (${impact.quotationNumbers.map((n) => `#${n}`).join(', ')})`
                    : ''}
                </span>
                <span className="text-ink-500 text-xs">
                  {impact.quotationLines === 0 ? '—' : 'keep their own copy'}
                </span>
              </li>
            </ul>
            {impact.quotationLines > 0 ? (
              <p className="text-ink-500 mt-1.5 text-xs">
                A quotation snapshots the design it was priced from, so those documents still read
                exactly as they were sent. Only the link back to this design goes.
              </p>
            ) : null}
          </div>

          {impact.blockedReason ? (
            <p className="border-warning-200 bg-warning-50 text-warning-700 flex items-start gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm">
              <Ban className="mt-0.5 size-4 shrink-0" />
              <span>{impact.blockedReason}</span>
            </p>
          ) : confirming ? (
            <p className="border-danger-200 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>This cannot be undone. Nothing above comes back.</span>
            </p>
          ) : null}

          {error ? <p className="text-danger-600 text-sm">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

function Line({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-ink-700 text-sm">
        {label}
        <span className="text-ink-400 ml-1.5 text-xs">{note}</span>
      </span>
      <span
        className={
          value > 0
            ? 'text-danger-700 text-sm font-semibold tabular-nums'
            : 'text-ink-300 text-sm tabular-nums'
        }
      >
        {formatNumber(value)}
      </span>
    </li>
  );
}
