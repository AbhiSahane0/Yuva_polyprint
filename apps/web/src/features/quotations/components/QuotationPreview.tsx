import { Download, ExternalLink, FileText, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
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
          <object
            key={id}
            data={quotationUrls.preview(id)}
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
        </div>
      ) : null}
    </Modal>
  );
}
