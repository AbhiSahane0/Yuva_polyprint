import { CircleAlert, Wrench } from 'lucide-react';
import { CYLINDER_STATUS_LABELS, formatRs, type QuotationCylinderRepair } from '@yuva/shared';
import { Input, NumberInput } from '@/components/ui/Field';
import { useDesign } from '@/features/cylinders/api/cylinder-api';
import { cn } from '@/lib/utils';

/**
 * **Quoting a repair instead of a new set.**
 *
 * A customer the works already has is a customer whose cylinders it already
 * holds, so the line charges nothing for cutting them. What it sometimes DOES
 * need is one of that set re-engraved — and until now the office quoted that in
 * the notes and added it to the figure by hand.
 *
 * The set is read from the cylinder master rather than typed, because the works
 * already knows what it holds and which of them are damaged. The cost is typed
 * every time: the master records what a cylinder cost to ENGRAVE, which is not
 * what it costs to put right.
 *
 * The total lands in the cylinder bucket, so the customer reads it on the
 * cylinder line and pays it in advance with the rest of them.
 */
export function CylinderRepair({
  jobId,
  on,
  repairs,
  onToggle,
  onChange,
  disabled,
}: {
  /** The design whose set this is. Null until a saved design is picked. */
  jobId: string | null;
  on: boolean;
  repairs: QuotationCylinderRepair[];
  onToggle: (on: boolean) => void;
  onChange: (next: QuotationCylinderRepair[]) => void;
  disabled?: boolean;
}) {
  /* Only asked for once the box is ticked: a customer step that fetched every
     design's cylinders on the way past would be a request per keystroke. */
  const { data: design, isPending } = useDesign(on ? jobId : null);
  const cylinders = design?.cylinders ?? [];

  const chosen = new Map(repairs.map((repair) => [repair.code, repair]));
  const total = repairs.reduce((sum, repair) => sum + (Number(repair.cost) || 0), 0);

  function toggleCylinder(code: string, colour: string, cylinderId: string, ticked: boolean) {
    if (!ticked) {
      onChange(repairs.filter((repair) => repair.code !== code));
      return;
    }
    onChange([
      ...repairs,
      { cylinderId, code, colour, cost: 0, reason: '', position: repairs.length + 1 },
    ]);
  }

  function setCost(code: string, cost: number) {
    onChange(repairs.map((repair) => (repair.code === code ? { ...repair, cost } : repair)));
  }

  function setReason(code: string, reason: string) {
    onChange(repairs.map((repair) => (repair.code === code ? { ...repair, reason } : repair)));
  }

  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="accent-brand-600 size-4 cursor-pointer"
          checked={on}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <Wrench className="text-ink-400 size-4" aria-hidden />
        <span className="text-ink-800 text-sm font-medium">Repair cylinders</span>
        <span className="text-ink-400 text-xs">
          This customer’s set is already in the works — nothing is charged for cutting it
        </span>
      </label>

      {on ? (
        <div className="mt-3">
          {jobId === null ? (
            /*
             * The set belongs to a design, so there is nothing to list until one
             * has been chosen. Said plainly rather than shown as an empty list,
             * which reads as "this design has no cylinders".
             */
            <p className="border-ink-200 text-ink-500 rounded-[var(--radius-md)] border border-dashed px-3 py-4 text-center text-xs">
              Pick the design above and its cylinders will be listed here.
            </p>
          ) : isPending ? (
            <p className="text-ink-400 px-1 py-3 text-xs">Reading the cylinder register…</p>
          ) : cylinders.length === 0 ? (
            /*
             * The case worth catching. The customer exists, so this line charges
             * nothing for a set — and if the register holds none either, the
             * quotation goes out with no cylinder cost at all. That may be
             * right, and it may be a design nobody registered.
             */
            <p className="border-warning-200 bg-warning-50/60 text-warning-800 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs">
              <CircleAlert className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
              The register holds no cylinders for this design, so this line quotes nothing for them.
              If a set does need cutting, untick this and charge for one.
            </p>
          ) : (
            <>
              <ul className="border-ink-200 divide-ink-100 divide-y overflow-hidden rounded-[var(--radius-md)] border">
                {cylinders.map((cylinder) => {
                  const picked = chosen.get(cylinder.code);
                  /* The register already knows which of them are in trouble, so
                     the row that most likely needs the work says so itself.
                     One already out at the engraver counts twice over: it is
                     the likeliest thing being quoted here. */
                  const wanting =
                    cylinder.status === 'DAMAGED' ||
                    cylinder.status === 'NEEDS_REWORK' ||
                    cylinder.status === 'UNDER_REPAIR';
                  return (
                    <li
                      key={cylinder.id}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2',
                        picked ? 'bg-brand-50/50' : wanting ? 'bg-warning-50/40' : 'bg-white',
                      )}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="accent-brand-600 size-4 shrink-0 cursor-pointer"
                          checked={Boolean(picked)}
                          disabled={disabled}
                          onChange={(event) =>
                            toggleCylinder(
                              cylinder.code,
                              cylinder.colour,
                              cylinder.id,
                              event.target.checked,
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="text-ink-800 block truncate text-sm">
                            {cylinder.code}
                            {cylinder.colour && cylinder.colour !== 'NA' ? (
                              <span className="text-ink-500"> · {cylinder.colour}</span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              'block text-xs',
                              wanting ? 'text-warning-700' : 'text-ink-400',
                            )}
                          >
                            {CYLINDER_STATUS_LABELS[cylinder.status]}
                            {/* Why it is away, where the register knows —
                                which is usually the thing being quoted. */}
                            {cylinder.repairReason ? ` · ${cylinder.repairReason}` : ''}
                            {cylinder.cost ? ` · engraved at ${formatRs(cylinder.cost)}` : ''}
                          </span>
                        </span>
                      </label>

                      {picked ? (
                        <span className="flex shrink-0 items-center gap-2">
                          {/*
                            What is wrong with it, beside what putting it right
                            costs. Asked here because this is where somebody is
                            looking at the cylinder and deciding — and because
                            winning this quotation sends it to the engraver, and
                            the register will not take a cylinder out of the
                            works without a fault recorded against it.
                          */}
                          <Input
                            aria-label={`What is wrong with ${cylinder.code}`}
                            className="w-48"
                            placeholder="What is wrong with it"
                            value={picked.reason}
                            disabled={disabled}
                            onChange={(event) => setReason(cylinder.code, event.target.value)}
                          />
                          <span className="text-ink-500 text-xs">Repair cost</span>
                          <NumberInput
                            aria-label={`Repair cost for ${cylinder.code}`}
                            className="w-28"
                            value={picked.cost === 0 ? '' : String(picked.cost)}
                            disabled={disabled}
                            onChange={(event) =>
                              setCost(cylinder.code, Number(event.target.value || 0))
                            }
                          />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink-400 text-xs">
                  {repairs.length === 0
                    ? 'Tick the ones being re-engraved.'
                    : `${repairs.length} of ${cylinders.length} being repaired — they go out when this quotation is won`}
                </span>
                {repairs.length > 0 ? (
                  <span className="text-ink-900 text-sm font-semibold tabular-nums">
                    {formatRs(total)} on the cylinder line
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
