import { Plus, Trash2 } from 'lucide-react';
import { type JobSheetReelInput } from '@yuva/shared';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils';
import { Typed } from './sheet-form';

/**
 * **What was drawn, one draw at a time.**
 *
 * A drum is not taken once. The works takes ten kilograms of white, finishes
 * it, takes fifteen more, finishes that, takes two and puts one back — and the
 * sheet wants all three figures, not the 27 somebody worked out on the way to
 * the form. Their own spreadsheet says so in the only way a spreadsheet can:
 * `=SUM(B15:E15)` across four cells for every colour, eight for the solvents.
 *
 * So every "received" figure on this form is a row of boxes that grows as it
 * is needed rather than one box with a total in it. A row that took one draw
 * shows one box; a row that took five shows five. The Total beside them is
 * arithmetic and is never typed.
 *
 * The same component does the reels on the roll rows, because a reel put on
 * the machine and a tin taken off the shelf are the same act of weighing
 * something and writing it down.
 */
export function Draws({
  label,
  draws,
  onDraws,
  disabled,
  width = 'w-[4.5rem]',
}: {
  /** Names the row for a screen reader: "Cyan, fresh". */
  label: string;
  draws: JobSheetReelInput[];
  onDraws: (next: JobSheetReelInput[]) => void;
  disabled?: boolean;
  width?: string;
}) {
  const set = (index: number, weightKg: number) =>
    onDraws(draws.map((draw, at) => (at === index ? { ...draw, weightKg } : draw)));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {draws.map((draw, index) => (
        <div key={index} className="flex items-center">
          <Typed
            width={width}
            label={`${label}, draw ${index + 1}`}
            value={draw.weightKg}
            disabled={disabled}
            onChange={(next) => set(index, Number(next || 0))}
          />
          {/* Only the last one can go, so removing a draw never renumbers the
              ones before it under somebody's cursor. */}
          {index === draws.length - 1 ? (
            <IconButton
              tone="danger"
              className="size-6"
              aria-label={`Remove the last ${label} draw`}
              disabled={disabled}
              onClick={() => onDraws(draws.slice(0, -1))}
            >
              <Trash2 className="size-3" />
            </IconButton>
          ) : null}
        </div>
      ))}

      <IconButton
        className={cn('size-6', draws.length === 0 && 'text-brand-600')}
        aria-label={`Add a ${label} draw`}
        disabled={disabled}
        onClick={() => onDraws([...draws, { weightKg: 0, coreKg: 0, reelNumber: '' }])}
      >
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}
