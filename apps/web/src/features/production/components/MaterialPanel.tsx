import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ShieldAlert } from 'lucide-react';
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
 * *Free* is on hand less what other open production runs have claimed, which is why a
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
   * Folded away by default, always.
   *
   * A card with three films, five inks and the solvents runs to a dozen rows,
   * and the floor opens this screen to fill in a stage — the material is what
   * you check once, not what you read past every time to reach the machine.
   *
   * A short job is no exception, which it used to be. The header already says
   * so in red and names what is missing, and that is the part that has to be
   * seen; the detail behind it is for whoever is going to do something about
   * it, and they can open it.
   */
  const [open, setOpen] = useState(false);

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
          This order was not priced from a quotation, so there is no structure to work the material
          out from. Nothing has been reserved for this run — check the stock by hand before it runs.
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
      toast.success(text ? 'Recorded — this run can go short' : 'The material block is back on');
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
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={`materials-${card.id}`}
        className={cn(
          'flex w-full flex-wrap items-center justify-between gap-2 text-left',
          open && 'mb-3',
        )}
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown
            className={cn('text-ink-400 size-4 transition-transform', open ? '' : '-rotate-90')}
            aria-hidden="true"
          />
          <span className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
            Material
          </span>
          {/* What the fold is hiding, so the count is not a surprise. */}
          {open ? null : (
            <span className="text-ink-400 text-xs normal-case">
              · {card.materials.length} to find
            </span>
          )}
        </span>
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
      </button>

      {/* Everything below folds. The badge above carries the state either way,
          so a shortage is never hidden — only its detail is. */}
      {open ? (
        <div id={`materials-${card.id}`}>
          {/* Scrolls on its own rather than pushing the page sideways — the floor
          reads this on a phone at the machine. */}
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-ink-500 text-left text-xs tracking-wide uppercase">
                  <th className="px-4 pb-1.5 font-medium sm:pl-0">Material</th>
                  <th className="px-4 pb-1.5 text-right font-medium">Needs</th>
                  {/* Not "free" — free counts reels too narrow to run this job, and
                  kilograms on a 340 mm reel are no use at 650. */}
                  <th className="px-4 pb-1.5 text-right font-medium">Usable</th>
                  <th className="px-4 pb-1.5 text-right font-medium sm:pr-0">Short by</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {card.materials.flatMap((line) => [
                  <tr key={line.materialId}>
                    <td className="text-ink-800 px-4 py-2 sm:pl-0">
                      {line.name}
                      {/* The web this job runs at. A reel narrower than this cannot
                      run it at all — film is slit down, never widened. */}
                      {line.needsWidthMm > 0 ? (
                        <div className="text-ink-400 text-xs">
                          on a reel {formatNumber(line.needsWidthMm, 0)} mm or wider
                        </div>
                      ) : null}
                    </td>
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
                     the stock screen, so every step between the two is spelled
                     out here rather than left to be discovered. */
                      title={
                        `${formatNumber(line.onHand, 3)} kg on hand · ` +
                        `${formatNumber(line.held, 3)} kg claimed by other production runs · ` +
                        `${formatNumber(line.tooNarrowKg, 3)} kg on reels too narrow for this job`
                      }
                    >
                      {formatNumber(line.usable, 3)} kg
                      {/* The actionable half of a shortage: the right film in the
                      wrong size is a different problem from none at all, and it
                      is solved by buying differently rather than by buying more. */}
                      {line.tooNarrowKg > 0 ? (
                        <div className="text-warning-700 text-xs font-normal">
                          {formatNumber(line.tooNarrowKg, 0)} kg too narrow
                        </div>
                      ) : null}
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
                  </tr>,
                  /*
                   * The rolls themselves — which is the thing a quantity could
                   * never tell anybody. This is what the floor fetches, and what
                   * stops two runs being promised one roll.
                   *
                   * Not shown once the sheet has posted: the claim is released by
                   * then and these rolls are no longer spoken for.
                   */
                  line.reels.length > 0 && !posted ? (
                    <tr key={`${line.materialId}-reels`}>
                      <td colSpan={4} className="px-4 pb-2 sm:px-0">
                        <div className="flex flex-wrap gap-1.5">
                          {line.reels.map((reel) => (
                            <span
                              key={reel.batchId}
                              className="border-ink-200 text-ink-600 rounded-full border bg-white px-2 py-0.5 text-xs whitespace-nowrap tabular-nums"
                              title={`${reel.batchCode} — ${formatNumber(reel.quantity, 3)} kg of this roll is held for this job`}
                            >
                              {/*
                               * A reel is known by its width — that is what
                               * decides whether it can run the job. A drum is not:
                               * ink and solvent have no width and none is asked
                               * for, so it is known by its batch instead.
                               */}
                              {reel.widthMm
                                ? `${formatNumber(reel.widthMm, 0)} mm`
                                : reel.batchCode}
                              <span className="text-ink-400"> · </span>
                              {formatNumber(reel.quantity, 1)} kg
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>

          {posted ? (
            <p className="text-ink-500 mt-3 text-sm">
              Job sheet {card.jobSheetNumber} has taken this run's material off stock, so the claim
              above is released — what the run actually weighed is in the ledger now. The figures
              stay as a record of what it was expected to take.
            </p>
          ) : null}

          {short.length > 0 && !posted && !overridden ? (
            <p className="text-danger-800 mt-3 text-sm">
              This job cannot be started until the film is in. Usable stock is what is on hand, less
              what other open production runs have claimed, less anything on a reel too narrow to
              run this job — film can be slit down but never widened.
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
                  hint="Recorded against the run with your name. Anyone can read it afterwards."
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
        </div>
      ) : null}
    </section>
  );
}
