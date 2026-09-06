import { useEffect, useRef, useState } from 'react';
import { Paperclip, UploadCloud } from 'lucide-react';
import {
  ARTWORK_ACCEPT,
  ARTWORK_KINDS,
  ARTWORK_KIND_HINTS,
  ARTWORK_KIND_LABELS,
  MAX_ARTWORK_BYTES,
  formatBytes,
  resolveContentType,
  type Artwork,
  type ArtworkKind,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useUploadArtwork } from '../api/artwork-api';

interface Props {
  open: boolean;
  onClose: () => void;
  jobId: string;
  /** Pre-picked by a drop onto the panel, so the picker is not asked for again. */
  initialFile?: File | null;
  /** Set when this upload is a revision of an existing file. */
  replaces?: Artwork | null;
}

/**
 * Adding one file to a design.
 *
 * The progress bar is not decoration: the file goes straight from this browser
 * to Cloudflare, and on the works' connection a 30 MB artwork is a minute in
 * which nothing else on screen changes.
 */
export function UploadArtworkModal({ open, onClose, jobId, initialFile, replaces }: Props) {
  const upload = useUploadArtwork();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ArtworkKind>('ARTWORK');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(initialFile ?? null);
    /* A revision is the same kind of thing as what it replaces. */
    setKind(replaces?.kind ?? 'ARTWORK');
    setNotes('');
    setProgress(0);
    setError(null);
  }, [open, initialFile, replaces]);

  function choose(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    /*
     * Both checks happen again on the server. Doing them here as well is what
     * keeps a 300 MB file from being sent before anything says no.
     */
    if (next.size > MAX_ARTWORK_BYTES) {
      setError(
        `That file is ${formatBytes(next.size)}. The limit is ${formatBytes(MAX_ARTWORK_BYTES)}.`,
      );
      setFile(null);
      return;
    }
    if (resolveContentType(next.name, next.type) === null) {
      setError('That file type is not accepted. Send a PDF, an image, an AI/EPS, a CDR or a ZIP.');
      setFile(null);
      return;
    }
    setFile(next);
  }

  async function submit() {
    if (!file) {
      setError('Choose a file first');
      return;
    }
    setError(null);
    setProgress(0);

    try {
      await upload.mutateAsync({
        jobId,
        file,
        kind,
        notes,
        replacesId: replaces?.id ?? null,
        onProgress: setProgress,
      });
      toast.success(replaces ? `${file.name} replaces ${replaces.filename}` : `${file.name} added`);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : 'The upload failed',
      );
    }
  }

  const busy = upload.isPending;
  const percent = Math.round(progress * 100);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={replaces ? 'Replace file' : 'Add a design file'}
      description={
        replaces
          ? `${replaces.filename} stays on record as v${replaces.version}. The new file becomes v${replaces.version + 1}.`
          : 'The file goes straight to storage from this browser.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!file}>
            {replaces ? 'Replace' : 'Upload'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ARTWORK_ACCEPT}
          className="hidden"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="border-ink-200 hover:border-brand-400 hover:bg-brand-50/40 flex w-full flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed px-4 py-8 text-center disabled:opacity-60"
        >
          {file ? (
            <>
              <Paperclip className="text-brand-600 size-6" />
              <span className="text-ink-900 text-sm font-medium break-all">{file.name}</span>
              <span className="text-ink-500 text-xs">
                {formatBytes(file.size)} · choose another
              </span>
            </>
          ) : (
            <>
              <UploadCloud className="text-ink-400 size-6" />
              <span className="text-ink-700 text-sm font-medium">Choose a file</span>
              <span className="text-ink-500 text-xs">
                PDF, JPG, PNG, TIFF, AI, EPS, CDR or ZIP · up to {formatBytes(MAX_ARTWORK_BYTES)}
              </span>
            </>
          )}
        </button>

        {busy ? (
          <div>
            <div className="bg-ink-100 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-brand-600 h-full rounded-full transition-[width] duration-200"
                style={{ width: `${Math.max(percent, 3)}%` }}
              />
            </div>
            <p className="text-ink-500 mt-1.5 text-xs">
              {percent < 100 ? `Uploading — ${percent}%` : 'Checking the file arrived…'}
            </p>
          </div>
        ) : null}

        <Field label="What is it" htmlFor="artwork-kind" hint={ARTWORK_KIND_HINTS[kind]}>
          <Select
            id="artwork-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as ArtworkKind)}
            disabled={busy}
          >
            {ARTWORK_KINDS.map((value) => (
              <option key={value} value={value}>
                {ARTWORK_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Note"
          htmlFor="artwork-notes"
          hint="Optional — colour reference, revision, who approved it"
        >
          <Textarea
            id="artwork-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
            maxLength={500}
          />
        </Field>

        {error ? <p className="text-danger-600 text-sm">{error}</p> : null}
      </div>
    </Modal>
  );
}
