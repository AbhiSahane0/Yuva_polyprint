import { Plus, Trash2 } from 'lucide-react';
import { formatNumber, packagesNetKg, type DispatchPackageInput } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input, NumberInput } from '@/components/ui/Field';

/** A row being typed. Kept as strings so a half-typed weight is not a 0. */
export interface PackageDraft {
  reelNumber: string;
  netKg: string;
  widthMm: string;
}

export const emptyPackage = (): PackageDraft => ({ reelNumber: '', netKg: '', widthMm: '' });

/** The rows that are complete enough to send. A blank row is not an error. */
export function toPackageInputs(rows: PackageDraft[]): DispatchPackageInput[] {
  return rows
    .filter((row) => Number(row.netKg) > 0)
    .map((row) => ({
      reelNumber: row.reelNumber.trim(),
      netKg: Number(row.netKg),
      grossKg: null,
      widthMm: row.widthMm ? Number(row.widthMm) : null,
    }));
}

/**
 * **The reels going on the lorry, one row each.**
 *
 * The works writes a weight on every reel it packs, and this is where those
 * weights are typed. The line total is their sum and is shown rather than asked
 * for — a typed total that disagrees with the rows beneath it is a challan the
 * works and the customer read differently, and there is no arguing with it
 * afterwards.
 *
 * Optional, always. A line with no rows falls back to a single typed weight,
 * because an office that has only the total on a scrap of paper must still be
 * able to raise the note.
 */
export function PackagesEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: PackageDraft[];
  onChange: (rows: PackageDraft[]) => void;
  disabled?: boolean;
}) {
  const set = (index: number, patch: Partial<PackageDraft>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const total = packagesNetKg(toPackageInputs(rows));

  return (
    <div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-ink-500 text-left text-xs tracking-wide uppercase">
                <th className="pr-2 pb-1 font-medium">#</th>
                <th className="px-2 pb-1 font-medium">Reel no.</th>
                <th className="px-2 pb-1 text-right font-medium">Net kg</th>
                <th className="px-2 pb-1 text-right font-medium">Width mm</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="text-ink-400 pr-2 py-1 text-xs tabular-nums">{index + 1}</td>
                  <td className="px-2 py-1">
                    <Input
                      value={row.reelNumber}
                      disabled={disabled}
                      onChange={(event) => set(index, { reelNumber: event.target.value })}
                      placeholder="as marked"
                      aria-label={`Reel number, row ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumberInput
                      className="text-right"
                      value={row.netKg}
                      disabled={disabled}
                      onChange={(event) => set(index, { netKg: event.target.value })}
                      aria-label={`Net weight, row ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumberInput
                      className="text-right"
                      value={row.widthMm}
                      disabled={disabled}
                      onChange={(event) => set(index, { widthMm: event.target.value })}
                      aria-label={`Width, row ${index + 1}`}
                    />
                  </td>
                  <td className="py-1 pl-1">
                    <IconButton
                      tone="danger"
                      aria-label={`Remove row ${index + 1}`}
                      disabled={disabled}
                      onClick={() => onChange(rows.filter((_, at) => at !== index))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange([...rows, emptyPackage()])}
        >
          <Plus className="size-4" />
          {rows.length === 0 ? 'List the reels' : 'Another reel'}
        </Button>
        {rows.length > 0 ? (
          <div className="text-ink-600 text-sm tabular-nums">
            {toPackageInputs(rows).length} reel{toPackageInputs(rows).length === 1 ? '' : 's'} ·{' '}
            <span className="text-ink-900 font-semibold">{formatNumber(total, 3)} kg</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
