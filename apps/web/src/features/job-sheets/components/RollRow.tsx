import { Plus, Trash2 } from 'lucide-react';
import { weighedTotal, type JobSheetReelInput } from '@yuva/shared';
import { IconButton } from '@/components/ui/IconButton';
import { Head, RowName, Typed, Worked } from './sheet-form';

/**
 * **One row of the works' form: reels across, and the three columns.**
 *
 * Their sheet writes a weight for each reel across the page and closes the row
 * with Total, Bal. and Cons. — what went on the machine, what came back, and
 * the difference. Only the first two are typed; the third is arithmetic and is
 * never a box.
 *
 * The reels grow as they are needed rather than sitting there as eight empty
 * columns: a row with two reels on it should read as two reels.
 */
export function RollRow({
  name,
  reels,
  onReels,
  balance,
  onBalance,
  disabled,
  /** An extra column some rows carry, e.g. Westage on the material row. */
  extra,
}: {
  name: string;
  reels: JobSheetReelInput[];
  onReels: (reels: JobSheetReelInput[]) => void;
  balance: number;
  onBalance: (next: number) => void;
  disabled?: boolean;
  extra?: { head: string; node: React.ReactNode };
}) {
  const total = weighedTotal(reels, 0);
  const set = (index: number, weightKg: number) =>
    onReels(reels.map((reel, at) => (at === index ? { ...reel, weightKg } : reel)));

  return (
    <div className="border-ink-100 flex flex-wrap items-end gap-1.5 border-b py-1.5 last:border-b-0">
      <RowName>{name}</RowName>

      {reels.map((reel, index) => (
        <div key={index} className="flex items-end">
          <Typed
            width="w-[72px]"
            label={`${name}, reel ${index + 1}`}
            value={reel.weightKg}
            disabled={disabled}
            onChange={(next) => set(index, Number(next || 0))}
          />
          <IconButton
            tone="danger"
            aria-label={`Remove ${name} reel ${index + 1}`}
            disabled={disabled}
            onClick={() => onReels(reels.filter((_, at) => at !== index))}
          >
            <Trash2 className="size-3" />
          </IconButton>
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onReels([...reels, { weightKg: 0, coreKg: 0, reelNumber: '' }])}
        className="text-ink-400 hover:text-brand-700 disabled:text-ink-200 mb-1 rounded px-1 py-0.5"
        aria-label={`Add a reel to ${name}`}
      >
        <Plus className="size-4" />
      </button>

      <div className="ml-auto flex items-end gap-2">
        <div>
          <Head>Total</Head>
          <Worked value={total} />
        </div>
        <div>
          <Head>Bal.</Head>
          <Typed
            width="w-[72px]"
            label={`${name}, balance`}
            value={balance}
            disabled={disabled}
            onChange={(next) => onBalance(Number(next || 0))}
          />
        </div>
        <div>
          <Head>Cons.</Head>
          <Worked value={Math.max(0, total) - balance} className="font-semibold" />
        </div>
        {extra ? (
          <div>
            <Head>{extra.head}</Head>
            {extra.node}
          </div>
        ) : null}
      </div>
    </div>
  );
}
