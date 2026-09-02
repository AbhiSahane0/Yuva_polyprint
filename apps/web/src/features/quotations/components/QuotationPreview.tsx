import { useEffect, useState } from 'react';
import { CopyPlus, Download, ExternalLink, FileText, History, Pencil, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClientError } from '@/lib/api-client';
import { openBlobUrl, saveBlob } from '@/lib/download';
import { toast } from '@/lib/toast';
import {
  fetchQuotationPdf,
  quotationPdfName,
  useCreateQuotationVersion,
  useQuotation,
  useQuotationVersions,
} from '../api/quotation-api';

/**
 * Shows the generated PDF itself, in the browser's own viewer.
 *
 * Rendering the document twice — once as HTML for the screen and once as a PDF
 * for download — meant the two could lay out differently, which is a whole
 * class of bug that simply disappears when the preview IS the file.
 *
 * `<object>` rather than `<iframe>` on purpose: when a browser has no PDF
 * viewer (some mobile browsers, hardened corporate builds), an iframe shows an
 * empty grey box, whereas an object falls back to the markup inside it. That
 * fallback is a real way out, not an apology.
 */
export function QuotationPreview({
  id,
  onClose,
  onSend,
}: {
  id: string | null;
  onClose: () => void;
  /**
   * Hands off to the send dialog. The preview closes first rather than opening
   * one modal on top of another: `Modal` installs its own Escape handler and
   * focus trap, so two at once would fight over both.
   */
  onSend?: (() => void) | undefined;
}) {
  /*
   * Which version is on screen. A quotation may have been revised, and the
   * office needs to see what the customer was actually sent last month — so the
   * modal opens on whichever version it was given and the dropdown moves within
   * that number, without disturbing the page underneath.
   */
  const [viewingId, setViewingId] = useState<string | null>(id);
  useEffect(() => setViewingId(id), [id]);

  const { data } = useQuotation(viewingId);
  const { data: versions } = useQuotationVersions(id);
  const createVersion = useCreateQuotationVersion();

  /*
   * Editing and sending belong to the current version only. An earlier one is
   * a record of what went out; re-sending it would put a superseded price back
   * in front of the customer, and the list the caller looks the row up in does
   * not contain it anyway.
   */
  const isCurrent = data?.isLatest !== false;

  async function onNewVersion() {
    if (!id) return;
    try {
      const revision = await createVersion.mutateAsync(id);
      setViewingId(revision.id);
      toast.success(`Version ${revision.version} created as a draft`);
    } catch (cause) {
      toast.error(
        cause instanceof ApiClientError ? cause.message : 'Could not create a new version.',
      );
    }
  }

  /*
   * The PDF is fetched here rather than handed to <object> as a URL, for two
   * reasons that have both bitten this component.
   *
   * The endpoint needs a session, and the token travels in a header — which a
   * browser navigation cannot carry. `<object data="…">` and `<a href="…">` are
   * navigations, so they answered 401 as soon as sign-in landed.
   *
   * And the element cannot report progress anyway: Chrome instantiates its PDF
   * viewer and fires `load` immediately, while the bytes are still in flight,
   * so a spinner tied to that event vanishes against an empty viewer.
   *
   * Fetching it solves both, and means the document is built once. Download and
   * Open in tab reuse this same blob instead of asking the server to spend
   * another fifteen seconds rendering it again.
   */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (viewingId === null) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setBlob(null);
    setFailure(null);

    fetchQuotationPdf(viewingId)
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result.blob);
        setBlob(result.blob);
        setFilename(result.filename);
        setPdfUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure(
          error instanceof ApiClientError ? error.message : 'The request could not be completed.',
        );
      });

    return () => {
      // Closing mid-fetch must not leave the blob pinned in memory, nor let a
      // late response resolve into a closed modal.
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [viewingId]);

  const ready = pdfUrl !== null && blob !== null;

  function onDownload() {
    if (!blob || !data) return;
    saveBlob(blob, quotationPdfName(filename, data.number));
  }

  function onOpenInTab() {
    if (!pdfUrl) return;
    if (!openBlobUrl(pdfUrl)) {
      toast.error('Your browser blocked the new tab. Allow pop-ups for this site.');
    }
  }

  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      size="xl"
      title={data ? `Quotation #${data.number}` : 'Quotation'}
      description={
        data ? `${data.customerName} · ${data.items.length} job(s)` : 'Preparing the document…'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {viewingId && isCurrent ? (
            <Link to={`/quotations/${viewingId}/edit`}>
              <Button variant="secondary">
                <Pencil className="size-4" />
                Edit
              </Button>
            </Link>
          ) : null}
          {/*
            A revision keeps the number and starts as a draft, so the version
            the customer already has stays exactly as they received it.
          */}
          {id && isCurrent ? (
            <Button
              variant="secondary"
              onClick={() => void onNewVersion()}
              loading={createVersion.isPending}
            >
              <CopyPlus className="size-4" />
              New version
            </Button>
          ) : null}
          {/*
            Deliberately not disabled while the preview is still rendering:
            sending builds its own PDF on the server, so it never waits on the
            copy being drawn here.
          */}
          {id && onSend && isCurrent ? (
            <Button variant="secondary" onClick={onSend}>
              <Send className="size-4" />
              Send
            </Button>
          ) : null}
          {/*
            Disabled until the document exists, because both actions now reuse
            the fetched blob. That is the trade for them working at all under a
            session — and it makes them instant instead of a second render.
          */}
          <Button variant="secondary" onClick={onOpenInTab} disabled={!ready}>
            <ExternalLink className="size-4" />
            Open in tab
          </Button>
          <Button onClick={onDownload} disabled={!ready}>
            <Download className="size-4" />
            Download PDF
          </Button>
        </>
      }
    >
      {id ? (
        <div className="bg-ink-100 -mx-5 -my-4 p-0 sm:p-3">
          {/*
            Only when there is something to choose between. One version is the
            normal case, and a dropdown offering a single option is furniture.
          */}
          {versions && versions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-2.5 sm:mb-3 sm:rounded-[var(--radius-md)]">
              <label
                htmlFor="quotation-version"
                className="text-ink-500 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
              >
                <History className="size-3.5" aria-hidden />
                Version
              </label>
              <select
                id="quotation-version"
                value={viewingId ?? ''}
                onChange={(event) => setViewingId(event.target.value)}
                className="border-ink-200 text-ink-800 focus-visible:ring-brand-500 rounded-[var(--radius-sm)] border bg-white px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version}
                    {version.isLatest ? ' (current)' : ''} — {version.status.toLowerCase()}
                  </option>
                ))}
              </select>

              {isCurrent ? null : (
                <span className="text-ink-500 text-xs">
                  An earlier version, kept as a record of what was sent. Editing and sending apply
                  to the current one.
                </span>
              )}
            </div>
          ) : null}

          {!ready ? (
            <div
              role="status"
              aria-live="polite"
              className="flex h-[70vh] flex-col items-center justify-center gap-3 bg-white px-6 text-center sm:rounded-[var(--radius-md)]"
            >
              {failure ? (
                <>
                  <FileText className="text-ink-300 size-10" />
                  <div>
                    <p className="text-ink-800 text-sm font-semibold">
                      The document couldn&rsquo;t be prepared
                    </p>
                    {/* The reason, not just the fact — a 403 and a timeout need
                        different things done about them. */}
                    <p className="text-ink-500 mt-1 text-sm">{failure}</p>
                  </div>
                </>
              ) : (
                <>
                  <Spinner size="lg" className="text-brand-600" />
                  <p className="text-ink-500 text-sm">Generating the PDF…</p>
                </>
              )}
            </div>
          ) : (
            <object
              key={id}
              data={pdfUrl}
              type="application/pdf"
              aria-label={`Quotation ${data?.number ?? ''} preview`}
              className="block h-[70vh] w-full bg-white sm:rounded-[var(--radius-md)]"
            >
              {/* Shown only when the browser cannot display a PDF inline. */}
              <div className="flex h-[70vh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
                <FileText className="text-ink-300 size-10" />
                <div>
                  <p className="text-ink-800 text-sm font-semibold">
                    This browser can&rsquo;t show the PDF inline
                  </p>
                  <p className="text-ink-500 mt-1 text-sm">
                    Open it in a new tab or download it — the document is ready.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={onOpenInTab}>
                    <ExternalLink className="size-4" />
                    Open in new tab
                  </Button>
                  <Button onClick={onDownload}>
                    <Download className="size-4" />
                    Download PDF
                  </Button>
                </div>
              </div>
            </object>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
