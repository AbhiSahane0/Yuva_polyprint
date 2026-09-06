import { useState } from 'react';
import { AlertTriangle, Archive, Trash2 } from 'lucide-react';
import { formatBytes, type Artwork } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { usePurgeArtwork, useRemoveArtwork } from '../api/artwork-api';

interface Props {
  file: Artwork | null;
  onClose: () => void;
  /** So the warning can say what may have been engraved from this file. */
  cylinderCount: number;
}

/**
 * The two ways a file leaves the screen, put side by side.
 *
 * They are genuinely different decisions and the office should see both before
 * choosing. **Remove** is filing — the file stays in the bucket and Put back
 * returns it. **Delete** erases the bytes and cannot be undone.
 *
 * Deliberately not a flag on one button. The destructive choice needs its own
 * words on its own control, because the reversible one is the one people click
 * without reading.
 */
export function RemoveArtworkModal({ file, onClose, cylinderCount }: Props) {
  const remove = useRemoveArtwork();
  const purge = usePurgeArtwork();
  const [error, setError] = useState<string | null>(null);
  /* The second press. Erasing a customer's artwork should take two. */
  const [confirming, setConfirming] = useState(false);

  if (!file) return null;

  async function run(kind: 'remove' | 'delete') {
    if (!file) return;
    setError(null);
    try {
      if (kind === 'remove') {
        await remove.mutateAsync(file.id);
        toast.success(`${file.filename} removed — the file is kept`);
      } else {
        await purge.mutateAsync(file.id);
        toast.success(`${file.filename} deleted`);
      }
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : 'That did not work',
      );
    }
  }

  const busy = remove.isPending || purge.isPending;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Remove this file?"
      description={`${file.filename} · ${formatBytes(file.sizeBytes)}`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('remove')}
          className="border-ink-200 hover:border-brand-400 hover:bg-brand-50/40 flex w-full items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left disabled:opacity-60"
        >
          <Archive className="text-ink-500 mt-0.5 size-5 shrink-0" />
          <span>
            <span className="text-ink-900 block text-sm font-medium">
              Remove it from this design
            </span>
            <span className="text-ink-500 block text-xs">
              It leaves the screen and the file is kept. <strong>Put back</strong> returns it.
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => (confirming ? void run('delete') : setConfirming(true))}
          className="border-danger-200 hover:border-danger-400 hover:bg-danger-50/50 flex w-full items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left disabled:opacity-60"
        >
          <Trash2 className="text-danger-600 mt-0.5 size-5 shrink-0" />
          <span>
            <span className="text-danger-700 block text-sm font-medium">
              {confirming ? 'Press again to erase it permanently' : 'Delete the file for good'}
            </span>
            <span className="text-ink-500 block text-xs">
              The file is erased from storage and cannot be recovered. The design keeps a record
              that it existed and who deleted it.
            </span>
          </span>
        </button>

        {/*
         * A warning, not a refusal. Nothing records which file a cylinder was
         * cut from, so this cannot be decided here — but the works owner can
         * decide it, and should be told before rather than after.
         */}
        {confirming && cylinderCount > 0 ? (
          <p className="border-warning-200 bg-warning-50 text-warning-700 flex items-start gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              This design has {cylinderCount} cylinder{cylinderCount === 1 ? '' : 's'} registered.
              If they were engraved from this file, nothing will be able to show what they were cut
              from.
            </span>
          </p>
        ) : null}

        {error ? <p className="text-danger-600 text-sm">{error}</p> : null}
      </div>
    </Modal>
  );
}
