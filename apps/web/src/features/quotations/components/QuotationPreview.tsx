import { Download, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { quotationUrls, useQuotation } from '../api/quotation-api';

/**
 * Shows the real printable document in an iframe.
 *
 * The iframe loads the exact HTML the PDF is rendered from, so the preview is
 * the document — not a second implementation that can drift away from it.
 */
export function QuotationPreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuotation(id);

  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      size="xl"
      title={data ? `Quotation #${data.number}` : 'Quotation'}
      description={data ? `${data.customerName} · ${data.items.length} job(s)` : undefined}
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
        <div className="bg-ink-100 -mx-5 -my-4 p-3 sm:p-5">
          <iframe
            key={id}
            src={quotationUrls.preview(id)}
            title="Quotation preview"
            className="h-[68vh] w-full rounded-[var(--radius-md)] border-0 bg-white shadow-[var(--shadow-card)]"
          />
        </div>
      ) : null}
    </Modal>
  );
}
