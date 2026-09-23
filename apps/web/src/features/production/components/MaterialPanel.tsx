import { useState } from 'react';
import { AlertTriangle, Check, ShieldAlert } from 'lucide-react';
import { flagsShort, type ProductionOrder } from '@yuva/shared';
import { formatNumber } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useOverrideMaterials } from '../api/production-api';

/**
 * **The film this job needs, and whether the works has it.**
 *
 * Three figures per ply, and the order they are read in is the point: what the
 * job needs, what is free, and — only when they disagree — what is missing.
 * *Free* is on hand less what other open job cards have claimed, which is why a
 * job can be short of a film the stock screen shows plenty of. The panel says
 * so in those words rather than making somebody work it out.
 *
 * Nothing here has moved any stock. A claim is not an issue; the job sheet
 * remains the only thing that takes material off the shelf.
 */
export function MaterialPanel({ card, canEdit }: { card: ProductionOrder; canEdit: boolean }) {
  /* A finished card is never flagged — see flagsShort. The figures below stay,
     because what the run was expected to take is worth reading afterwards. */
  const short = flagsShort(card);
  const override = useOverrideMaterials();
  const [reason, setReason] = useState('');
  const [opening, setOpening] = useState(false);

  /*
   * A card with no priced structure behind it — an order typed over the phone —
   * has nothing to reserve, and saying "0 kg needed" would read as a job that
   * needs no film. It says what is actually true instead.
   */
  if (card.materials.length === 0) {
    return (
      <section className="border-ink-200 mb-5 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">Material</h2>
        <p className="text-ink-500 mt-2 text-sm">
          This order was not priced from a quotation, so there is no structure to work the film out
          from. Nothing has been reserved for this card — check the stock by hand before it runs.
        </p>
      </section>
    );
  }

  const overridden = Boolean(card.materialOverrideReason);
  /* The claim is over: the sheet has issued what the run actually took, against
     real batches, so there is nothing left standing in for it. */
  const posted = Boolean(card.jobSheetPostedAt);

  async function save(text: string) {
    try {
      await override.mutateAsync({ id: card.id, input: { reason: text } });
      toast.success(text ? 'Recorded — this card can run short' : 'The material block is back on');
      setOpening(false);
      setReason('');
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  return (
    <section
      className={cn(
        'mb-5 rounded-[var(--radius-lg)] border p-4 shadow-[var(--shadow-card)] sm:p-5',
        short.length > 0 ? 'border-danger-200 bg-danger-50/30' : 'border-ink-200 bg-white',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">Material</h2>
        {posted ? (
          <Badge tone="neutral">
            <Check className="mr-1 size-3.5" />
            Taken off stock by sheet {card.jobSheetNumber}
          </Badge>
        ) : short.length > 0 ? (
          <Badge tone="danger">
            <AlertTriangle className="mr-1 size-3.5" />
            Short of {short.length === 1 ? short[0]!.name : `${short.length} materials`}
          </Badge>
        ) : (
          <Badge tone={card.status === 'COMPLETED' ? 'neutral' : 'success'}>
            <Check className="mr-1 size-3.5" />
            {card.status === 'COMPLETED' ? 'Released' : 'Reserved'}
          </Badge>
        )}
      </div>

      {/* Scrolls on its own rather than pushing the page sideways — the floor
          reads this on a phone at the machine. */}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="text-ink-500 text-left text-xs tracking-wide uppercase">
              <th className="px-4 pb-1.5 font-medium sm:pl-0">Film</th>
              <th className="px-4 pb-1.5 text-right font-medium">Needs</th>
              <th className="px-4 pb-1.5 text-right font-medium">Free</th>
              <th className="px-4 pb-1.5 text-right font-medium sm:pr-0">Short by</th>
            </tr>
          </thead>
          <tbody className="divide-ink-100 divide-y">
            {card.materials.map((line) => (
              <tr key={line.materialId}>
                <td className="text-ink-800 px-4 py-2 sm:pl-0">{line.name}</td>
                <td className="text-ink-800 px-4 py-2 text-right tabular-nums">
                  {formatNumber(line.quantity, 3)} kg
                </td>
                <td
                  className={cn(
                    'px-4 py-2 text-right tabular-nums',
                    line.shortBy > 0 && short.length > 0
                      ? 'text-danger-700 font-medium'
                      : 'text-ink-600',
                  )}
                  /* On hand is the number somebody will check this against on
                     the stock screen, so the gap between the two is explained
                     here rather than left to be discovered. */
                  title={`${formatNumber(line.onHand, 3)} kg on hand, ${formatNumber(line.held, 3)} kg claimed by other job cards`}
                >
                  {formatNumber(line.free, 3)} kg
                </td>
                <td className="px-4 py-2 text-right tabular-nums sm:pr-0">
                  {line.shortBy > 0 && short.length > 0 ? (
                    <span className="text-danger-700 font-semibold">
                      {formatNumber(line.shortBy, 3)} kg
                    </span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {posted ? (
        <p className="text-ink-500 mt-3 text-sm">
          Job sheet {card.jobSheetNumber} has taken this run's material off stock, so the claim
          above is released — what the run actually weighed is in the ledger now. The figures stay
          as a record of what it was expected to take.
        </p>
      ) : null}

      {short.length > 0 && !posted && !overridden ? (
        <p className="text-danger-800 mt-3 text-sm">
          This job cannot be started until the film is in. Free stock is what is on hand less what
          other open job cards have claimed.
        </p>
      ) : null}

      {/* The way through the block, and the record of it. Both live here, so
          there is one place to look for either. */}
      {overridden ? (
        <div className="border-warning-200 bg-warning-50/50 mt-3 rounded-[var(--radius-md)] border p-3">
          <div className="text-warning-800 flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Allowed to run short</div>
              <p className="mt-0.5">{card.materialOverrideReason}</p>
              <p className="text-ink-500 mt-1 text-xs">
                {card.materialOverrideBy}
                {card.materialOverrideAt
                  ? ` · ${new Date(card.materialOverrideAt).toLocaleString('en-IN')}`
                  : ''}
              </p>
            </div>
          </div>
          {canEdit ? (
            <Button
              variant="ghost"
              className="mt-2"
              loading={override.isPending}
              onClick={() => void save('')}
            >
              Put the block back
            </Button>
          ) : null}
        </div>
      ) : short.length > 0 && !posted && canEdit ? (
        opening ? (
          <div className="mt-3">
            <Field
              label="Why should this job run without the film?"
              htmlFor="material-override-reason"
              hint="Recorded against the card with your name. Anyone can read it afterwards."
            >
              <Textarea
                id="material-override-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Delivery due this afternoon — starting printing on what is in"
              />
            </Field>
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                disabled={!reason.trim()}
                loading={override.isPending}
                onClick={() => void save(reason)}
              >
                Record and allow
              </Button>
              <Button variant="ghost" onClick={() => setOpening(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setOpening(true)}>
            Run it anyway…
          </Button>
        )
      ) : null}
    </section>
  );
}
