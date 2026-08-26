import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { quotationUrls, useQuotation } from '../api/quotation-api';

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
export function QuotationPreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuotation(id);

  /*
   * The PDF is fetched here rather than handed to <object> as a URL, because
   * the element cannot tell us when the document actually arrives. Chrome
   * instantiates its PDF viewer immediately and fires `load` right then, while
   * the bytes are still in flight — so a spinner tied to that event vanishes
   * instantly and leaves the user watching the viewer's empty dark rectangle,
   * which is the exact problem it was meant to solve. Chromium renders this
   * document on the server, so that wait is real and worth reporting.
   *
   * Fetching it ourselves makes the wait observable, gives a genuine failure
   * path, and hands <object> a blob it can paint at once.
   */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setFailure(null);

    /*
     * Rendering happens on the server and a cold instance has to start Chromium
     * first, so this is allowed to be slow — but not to hang forever. Without a
     * deadline a stalled request leaves the spinner turning with no way out.
     */
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 120_000);

    void fetch(quotationUrls.preview(id), {
      // Matches the axios client, so this keeps working when sign-in lands.
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The server answered ${response.status}.`);

        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('pdf')) {
          // An HTML or text body here means something answered that is not the
          // API — a proxy's 404 page, or a login redirect.
          throw new Error(`Expected a PDF but received ${type || 'an unknown type'}.`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure(
          controller.signal.aborted
            ? 'It took too long to respond.'
            : error instanceof Error
              ? error.message
              : 'The request could not be completed.',
        );
      })
      .finally(() => clearTimeout(deadline));

    return () => {
      // Closing mid-fetch must not leave the blob pinned in memory, nor let a
      // late response resolve into a closed modal.
      cancelled = true;
      clearTimeout(deadline);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

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
            Always offered, not only in the fallback: a browser can load the
            PDF viewer yet still fail to paint the page, in which case the
            embed looks blank but the object counts as loaded and the fallback
            never shows. This is the way out when that happens.
          */}
          {id ? (
            <a href={quotationUrls.preview(id)} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <ExternalLink className="size-4" />
                Open in tab
              </Button>
            </a>
          ) : null}
          {id ? (
            <a href={quotationUrls.pdf(id)}>
              <Button>
                <Download className="size-4" />
                Download PDF
              </Button>
            </a>
          ) : null}
        </>
      }
    >
      {id ? (
        <div className="bg-ink-100 -mx-5 -my-4 p-0 sm:p-3">
          {pdfUrl === null ? (
            <div
              role="status"
              aria-live="polite"
              className="flex h-[70vh] flex-col items-center justify-center gap-3 bg-white px-6 text-center sm:rounded-[var(--radius-md)]"
            >
              {failure !== null ? (
                <>
                  <FileText className="text-ink-300 size-10" />
                  <div>
                    <p className="text-ink-800 text-sm font-semibold">
                      The document couldn&rsquo;t be prepared
                    </p>
                    {/* The reason, not just the fact — a 404 and a timeout need
                        different things done about them. */}
                    <p className="text-ink-500 mt-1 text-sm">{failure}</p>
                    <p className="text-ink-400 mt-1 text-sm">Try again, or open it in a new tab.</p>
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
                  <a href={quotationUrls.preview(id)} target="_blank" rel="noreferrer">
                    <Button variant="secondary">
                      <ExternalLink className="size-4" />
                      Open in new tab
                    </Button>
                  </a>
                  <a href={quotationUrls.pdf(id)}>
                    <Button>
                      <Download className="size-4" />
                      Download PDF
                    </Button>
                  </a>
                </div>
              </div>
            </object>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
