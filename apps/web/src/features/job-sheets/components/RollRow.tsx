import { weighedTotal, type JobSheetReelInput } from '@yuva/shared';
import { cn } from '@/lib/utils';
import { Draws } from './Draws';
import { Head, RowName, Typed, Worked } from './sheet-form';

/** The closing columns: Total, Bal., Cons. and, on the film row, Westage. */
const TAIL = 'grid auto-cols-[5.5rem] grid-flow-col items-center gap-2';

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
  return (
    <div className="border-ink-100 flex flex-wrap items-center gap-1.5 border-b py-2 last:border-b-0">
      <RowName>{name}</RowName>

      <div className="min-w-0 flex-1">
        <Draws label={name} draws={reels} onDraws={onReels} disabled={disabled} />
      </div>

      {/* The closing columns, on the same grid as the heading above them. */}
      <div className={cn('ml-auto', TAIL, extra && 'pr-0')}>
        <Worked value={total} />
        <div className="flex justify-end">
          <Typed
            width="w-full"
            label={`${name}, balance`}
            value={balance}
            disabled={disabled}
            onChange={(next) => onBalance(Number(next || 0))}
          />
        </div>
        <Worked value={Math.max(0, total) - balance} className="font-semibold" />
        {extra ? <div className="flex justify-end">{extra.node}</div> : null}
      </div>
    </div>
  );
}

/**
 * The heading for a block of roll rows — written once, above them.
 *
 * It used to be repeated on every row, floated to the right edge: four
 * two-word headings per line, three lines of them, none of it lining up with
 * anything. A table has one heading row, and so does this.
 */
export function RollHeads({ extra }: { extra?: string }) {
  return (
    <div className="border-ink-200 flex items-end gap-1.5 border-b pb-1.5">
      <RowName>&nbsp;</RowName>
      <div className="min-w-0 flex-1">
        <Head>Reels</Head>
      </div>
      <div className={cn('ml-auto', TAIL)}>
        <Head className="text-right">Total</Head>
        <Head className="text-right">Bal.</Head>
        <Head className="text-right">Cons.</Head>
        {extra ? <Head className="text-right">{extra}</Head> : null}
      </div>
    </div>
  );
}
