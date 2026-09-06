import { useState, type DragEvent } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  History,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  ARTWORK_KIND_LABELS,
  ARTWORK_STATUS_LABELS,
  formatBytes,
  formatKind,
  isPreviewable,
  type Artwork,
  type ArtworkFile,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  artworkLink,
  useJobArtwork,
  useRemoveArtwork,
  useRestoreArtwork,
} from '../api/artwork-api';
import { UploadArtworkModal } from './UploadArtworkModal';

/**
 * The files on one design.
 *
 * Reading is open to anyone signed in and writing is not, so the panel is shown
 * either way and only the buttons are withheld — the floor needs to see the
 * artwork a job prints, and an empty panel would tell them it does not exist.
 */
export function ArtworkPanel({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropped, setDropped] = useState<File | null>(null);
  const [replacing, setReplacing] = useState<Artwork | null>(null);
  const [dragging, setDragging] = useState(false);

  /*
   * Always asked for in full, and narrowed here.
   *
   * Asking the server for "current only" and then deciding whether to offer
   * "Show replaced" from *that* answer cannot work: the toggle is hidden by
   * exactly the rows it would reveal, so a design with a replaced file offers
   * no way to see it. Signing costs no network call, so one request carrying
   * everything is cheaper than two anyway.
   */
  const { data: all, isPending } = useJobArtwork(jobId, true);

  const archived = (all ?? []).filter(
    (file) => file.status === 'SUPERSEDED' || file.status === 'REMOVED',
  );
  const files = showArchived ? all : (all ?? []).filter((file) => !archived.includes(file));
  const remove = useRemoveArtwork();
  const restore = useRestoreArtwork();

  function openUpload(file: File | null, replaces: Artwork | null) {
    setDropped(file);
    setReplacing(replaces);
    setUploading(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canEdit) return;
    const file = event.dataTransfer.files?.[0];
    if (file) openUpload(file, null);
  }

  /*
   * Signed on the click rather than held on the page. A view URL is a readable
   * link to a customer's unreleased packaging; one that expires in minutes is
   * one that stops working if it ends up in a chat message.
   */
  async function open(file: ArtworkFile, download: boolean) {
    try {
      const url = await artworkLink(file.id, download);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open that file');
    }
  }

  return (
    <section
      onDragOver={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'rounded-[var(--radius-lg)] transition-colors',
        dragging && 'ring-brand-400 bg-brand-50/40 ring-2',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink-900 text-base font-semibold">Design files</h2>
        <div className="flex items-center gap-2">
          {archived.length > 0 || showArchived ? (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((on) => !on)}>
              <History className="size-4" />
              {showArchived ? 'Current only' : 'Show replaced'}
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => openUpload(null, null)}>
              <Plus className="size-4" />
              Add file
            </Button>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <LoadingState label="Loading files…" />
      ) : (files?.length ?? 0) === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border border-dashed bg-white">
          <EmptyState
            title="No files on this design"
            description={
              canEdit
                ? 'Drag the artwork here, or use Add file. PDF, images, AI, EPS, CDR and ZIP.'
                : 'Nothing has been uploaded for this design yet.'
            }
            action={
              canEdit ? (
                <Button variant="secondary" onClick={() => openUpload(null, null)}>
                  <UploadCloud className="size-4" />
                  Add a file
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(files ?? []).map((file) => (
            <li
              key={file.id}
              className={cn(
                'border-ink-200 flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]',
                file.status === 'REMOVED' && 'opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => void open(file, false)}
                disabled={file.status === 'PENDING'}
                className="bg-ink-25 border-ink-100 flex h-32 items-center justify-center border-b"
                title="Open"
              >
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt={file.filename}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-ink-400 flex flex-col items-center gap-1">
                    <FileText className="size-7" />
                    <span className="text-ink-500 text-xs font-semibold tracking-wide">
                      {formatKind(file.filename, file.contentType)}
                    </span>
                  </span>
                )}
              </button>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <div>
                  <p className="text-ink-900 text-sm font-medium break-all">{file.filename}</p>
                  <p className="text-ink-500 mt-0.5 text-xs">
                    {formatBytes(file.sizeBytes)} · {file.uploadedBy}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{ARTWORK_KIND_LABELS[file.kind]}</Badge>
                  {file.version > 1 ? <Badge tone="neutral">v{file.version}</Badge> : null}
                  {file.status !== 'ACTIVE' ? (
                    <Badge tone={file.status === 'PENDING' ? 'neutral' : 'warning'}>
                      {ARTWORK_STATUS_LABELS[file.status]}
                    </Badge>
                  ) : null}
                </div>

                {file.notes ? <p className="text-ink-600 text-xs">{file.notes}</p> : null}

                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  {isPreviewable(file.contentType) || file.contentType === 'application/pdf' ? (
                    <Button variant="ghost" size="sm" onClick={() => void open(file, false)}>
                      <ExternalLink className="size-4" />
                      Open
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => void open(file, true)}>
                    <Download className="size-4" />
                    Save
                  </Button>

                  {canEdit && file.status === 'ACTIVE' ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openUpload(null, file)}>
                        <UploadCloud className="size-4" />
                        Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove.mutate(file.id)}
                        title="Take it off this screen. The file itself is kept."
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : null}

                  {canEdit && file.status === 'REMOVED' ? (
                    <Button variant="ghost" size="sm" onClick={() => restore.mutate(file.id)}>
                      <RotateCcw className="size-4" />
                      Put back
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <UploadArtworkModal
        open={uploading}
        onClose={() => setUploading(false)}
        jobId={jobId}
        initialFile={dropped}
        replaces={replacing}
      />
    </section>
  );
}
