import { useState } from 'react';
import { Check, Copy, Eye, Link2, X } from 'lucide-react';
import type { QuotationStatus } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import {
  useCreateQuotationLink,
  useQuotationLinks,
  useQuotationResponses,
} from '../api/quotation-api';

/**
 * **The customer's side of this quotation, from the office's side.**
 *
 * Three questions, answered in the order the office asks them:
 *
 * 1. *Have they answered?* — at the top, in words, when there is an answer.
 * 2. *Have they even opened it?* — the view count, which is the difference
 *    between chasing a decision and chasing a delivery.
 * 3. *Can I send them the link again?* — the button, because most of this
 *    works' quoting happens in a WhatsApp thread that is already open.
 *
 * The token is not here and cannot be. Only its hash is stored, so a link can
 * be recorded, counted and withdrawn but never read back — pressing the button
 * mints a new one. That is the trade for a leaked database not handing anybody
 * the power to accept every open quotation in it.
 */
export function CustomerLink({ id, status }: { id: string; status: QuotationStatus }) {
  const { data: links } = useQuotationLinks(id);
  const { data: responses } = useQuotationResponses(id);
  const createLink = useCreateQuotationLink();

  /** The address of a link made in this sitting. Gone on reopening. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const live = links?.find((link) => link.revokedAt === null);
  const answer = responses?.[0];

  async function onNewLink() {
    try {
      const link = await createLink.mutateAsync(id);
      setFresh(link.url);
      await copy(link.url ?? '');
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : 'Could not make a link.');
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success('Link copied');
    } catch {
      /* A browser that refuses the clipboard — an insecure origin, or
         permission declined. The address is on screen either way, so this is
         a nudge rather than a failure. */
      toast.error('Could not copy it. Select the address and copy it by hand.');
    }
  }

  return (
    <div className="border-ink-200 rounded-[var(--radius-md)] border bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="text-ink-400 size-4" aria-hidden />
          <span className="text-ink-700 text-sm font-semibold">Customer link</span>
          {live ? (
            <span className="text-ink-400 flex items-center gap-1 text-xs">
              <Eye className="size-3.5" aria-hidden />
              {live.viewCount === 0
                ? 'not opened yet'
                : `opened ${live.viewCount} time${live.viewCount === 1 ? '' : 's'}`}
            </span>
          ) : (
            <span className="text-ink-400 text-xs">none yet</span>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onNewLink()}
          loading={createLink.isPending}
        >
          <Copy className="size-4" />
          {live ? 'New link' : 'Make a link'}
        </Button>
      </div>

      {/*
        Shown once, right after minting. There is no second chance to read it,
        so it stays on screen until the drawer is closed rather than vanishing
        behind a toast.
      */}
      {fresh ? (
        <div className="bg-ink-50 mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2">
          <code className="text-ink-700 min-w-0 flex-1 text-xs break-all">{fresh}</code>
          <Button variant="secondary" size="sm" onClick={() => void copy(fresh)}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : null}

      {answer ? (
        <div className="border-ink-100 mt-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {answer.decision === 'ACCEPTED' ? (
              <Badge tone="success">
                <Check className="mr-1 size-3" aria-hidden />
                Accepted by the customer
              </Badge>
            ) : (
              <Badge tone="warning">
                <X className="mr-1 size-3" aria-hidden />
                Declined by the customer
              </Badge>
            )}
            <span className="text-ink-600 text-sm">
              {answer.personName}
              {answer.personRole ? `, ${answer.personRole}` : ''} ·{' '}
              {new Date(answer.respondedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>

          {answer.note ? (
            <p className="text-ink-600 border-ink-200 mt-2 border-l-2 pl-3 text-sm">
              {answer.note}
            </p>
          ) : null}

          {/*
            The nudge, and the reason this whole panel is worth the room.
            Accepting does not create anything — the customer, the designs, the
            order and the cylinders are still the office's deliberate act, and
            an acceptance nobody acts on is a job nobody starts.
          */}
          {status === 'ACCEPTED' ? (
            <p className="text-ink-500 mt-2 text-sm">
              Nothing has been created yet. Record the answer to raise the order, the designs and
              the cylinders.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
