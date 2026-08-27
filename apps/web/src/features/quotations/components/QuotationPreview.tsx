import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Pencil, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClientError } from '@/lib/api-client';
import { openBlobUrl, saveBlob } from '@/lib/download';
import { toast } from '@/lib/toast';
import { fetchQuotationPdf, quotationPdfName, useQuotation } from '../api/quotation-api';

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
  const { data } = useQuotation(id);

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
    if (id === null) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setBlob(null);
    setFailure(null);

    fetchQuotationPdf(id)
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
  }, [id]);

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
          {id ? (
            <Link to={`/quotations/${id}/edit`}>
              <Button variant="secondary">
                <Pencil className="size-4" />
                Edit
              </Button>
            </Link>
          ) : null}
          {/*
            Deliberately not disabled while the preview is still rendering:
            sending builds its own PDF on the server, so it never waits on the
            copy being drawn here.
          */}
          {id && onSend ? (
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
