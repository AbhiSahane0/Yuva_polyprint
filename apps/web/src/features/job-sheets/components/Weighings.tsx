import { Plus, Trash2 } from 'lucide-react';
import { formatNumber, weighedTotal, type JobSheetReelInput } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { NumberInput } from '@/components/ui/Field';

/**
 * **What the works actually wrote down: one weight a reel.**
 *
 * Their sheet has a column for every reel that went on the machine — "257.3
 * and 250.25" is how 507.55 kg of polyester reaches the form — and a column
 * for every roll that came off it, with the core underneath. The total is the
 * sum of those, never typed beside them: a typed total and a list that
 * disagree are two answers to one question, and only one of them can be
 * checked against the scale.
 *
 * Optional, always. A row with no weighings keeps its typed total, because a
 * sheet keyed from a scrap of paper has to cost like any other.
 */
export function Weighings({
  label,
  reels,
  onChange,
  disabled,
  /** An output roll carries the core it was wound on. Nothing else does. */
  withCores,
}: {
  label: string;
  reels: JobSheetReelInput[];
  onChange: (reels: JobSheetReelInput[]) => void;
  disabled?: boolean;
  withCores?: boolean;
}) {
  const set = (index: number, patch: Partial<JobSheetReelInput>) =>
    onChange(reels.map((reel, at) => (at === index ? { ...reel, ...patch } : reel)));

  const total = weighedTotal(reels, 0);
  const cores = reels.reduce((sum, reel) => sum + (reel.coreKg || 0), 0);

  return (
    <div className="min-w-0">
      <div className="text-ink-500 mb-1 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        {reels.map((reel, index) => (
          <div key={index} className="flex items-end gap-1">
            <div>
              <label className="text-ink-400 block text-[10px]">
                {withCores ? `Roll ${index + 1}` : `${index + 1}`}
              </label>
              <NumberInput
                className="w-20 text-right"
                value={reel.weightKg === 0 ? '' : String(reel.weightKg)}
                disabled={disabled}
                aria-label={`${label}, weight ${index + 1}`}
                onChange={(event) => set(index, { weightKg: Number(event.target.value || 0) })}
              />
            </div>
            {withCores ? (
              <div>
                <label className="text-ink-400 block text-[10px]">core</label>
                <NumberInput
                  className="w-16 text-right"
                  value={reel.coreKg === 0 ? '' : String(reel.coreKg ?? '')}
                  disabled={disabled}
                  aria-label={`${label}, core ${index + 1}`}
                  onChange={(event) => set(index, { coreKg: Number(event.target.value || 0) })}
                />
              </div>
            ) : null}
            <IconButton
              tone="danger"
              aria-label={`Remove ${label} ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange(reels.filter((_, at) => at !== index))}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        ))}

        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange([...reels, { weightKg: 0, coreKg: 0, reelNumber: '' }])}
        >
          <Plus className="size-3.5" />
          {reels.length === 0 ? 'Weigh one' : 'Another'}
        </Button>
      </div>

      {reels.length > 0 ? (
        <div className="text-ink-600 mt-1 text-xs tabular-nums">
          {reels.length} {withCores ? 'roll' : 'reel'}
          {reels.length === 1 ? '' : 's'} ·{' '}
          <span className="text-ink-900 font-semibold">{formatNumber(total, 3)} kg</span>
          {withCores && cores > 0 ? (
            <>
              {' less '}
              {formatNumber(cores, 3)} of core ={' '}
              <span className="text-ink-900 font-semibold">
                {formatNumber(total - cores, 3)} kg
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
