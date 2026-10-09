import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  averagePouchGrams,
  countedPouches,
  formatNumber,
  packagesNetKg,
  pouchesInBox,
  POUCHES_PER_WEIGHING,
  standardBoxWeight,
  type DispatchPackageInput,
  type DispatchPouchWeighingInput,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input, NumberInput } from '@/components/ui/Field';

/** A row being typed. Kept as strings so a half-typed weight is not a 0. */
export interface PackageDraft {
  reelNumber: string;
  netKg: string;
  widthMm: string;
  /**
   * A carton is weighed full and the empty carton is known, so what the packer
   * types is a gross and a tare. A reel is weighed net and leaves both blank.
   */
  grossKg: string;
  boxKg: string;
}

/** One set of pouches put on the scale, as it is being typed. */
export interface WeighingDraft {
  pouchCount: string;
  grams: string;
}

export const emptyPackage = (): PackageDraft => ({
  reelNumber: '',
  netKg: '',
  widthMm: '',
  grossKg: '',
  boxKg: '',
});

export const emptyWeighing = (): WeighingDraft => ({
  pouchCount: String(POUCHES_PER_WEIGHING),
  grams: '',
});

/** What one row is sending, net: typed for a reel, gross less tare for a box. */
export function packageNet(row: PackageDraft): number {
  if (row.grossKg === '' && row.boxKg === '') return Number(row.netKg) || 0;
  return Math.max(0, (Number(row.grossKg) || 0) - (Number(row.boxKg) || 0));
}

/** The rows that are complete enough to send. A blank row is not an error. */
export function toPackageInputs(rows: PackageDraft[]): DispatchPackageInput[] {
  return rows
    .filter((row) => packageNet(row) > 0)
    .map((row) => ({
      reelNumber: row.reelNumber.trim(),
      netKg: packageNet(row),
      /* Kept where the packer weighed the full carton: the tare reads back off
         it, and a customer querying a box weight is querying that figure. */
      grossKg: row.grossKg === '' ? null : Number(row.grossKg) || null,
      widthMm: row.widthMm ? Number(row.widthMm) : null,
    }));
}

export function toWeighingInputs(rows: WeighingDraft[]): DispatchPouchWeighingInput[] {
  return rows
    .filter((row) => Number(row.pouchCount) > 0 && Number(row.grams) > 0)
    .map((row) => ({ pouchCount: Number(row.pouchCount), grams: Number(row.grams) }));
}

/**
 * **Weighing pouches to find out what one weighs.**
 *
 * The works puts a hundred pouches on the scale, three times, and the average
 * of the three is what a pouch weighs — which is then how every carton on the
 * lorry is counted. The sets are kept rather than thrown away once the average
 * is taken: a count nobody can re-check is a number the customer can argue
 * with and the office cannot defend.
 */
export function WeighingsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: WeighingDraft[];
  onChange: (rows: WeighingDraft[]) => void;
  disabled?: boolean;
}) {
  const set = (index: number, patch: Partial<WeighingDraft>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const grams = averagePouchGrams(toWeighingInputs(rows));

  /*
   * What a full carton ought to read on the scale.
   *
   * The works' own sheet keeps this beside the weighings: tell it how many go
   * in a box and it says what the box should weigh, so the packer checks a
   * carton against the scale instead of counting it out. Not stored — it is a
   * question asked at the bench, not a fact about the consignment.
   */
  const [perBox, setPerBox] = useState('');
  const standard =
    grams > 0 && Number(perBox) > 0
      ? standardBoxWeight({ pouchesPerBox: Number(perBox), pouchGrams: grams, boxKg: 0 })
      : null;

  return (
    <div>
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-1">
              <div>
                <label
                  className="text-ink-500 block text-[11px] font-medium tracking-wide uppercase"
                  htmlFor={`weighing-count-${index}`}
                >
                  Set {index + 1}
                </label>
                <div className="flex items-center gap-1">
                  <NumberInput
                    id={`weighing-count-${index}`}
                    className="w-16 text-right"
                    value={row.pouchCount}
                    disabled={disabled}
                    onChange={(event) => set(index, { pouchCount: event.target.value })}
                    aria-label={`Pouches on the scale, set ${index + 1}`}
                  />
                  <span className="text-ink-500 text-xs">pouches weigh</span>
                  <NumberInput
                    className="w-20 text-right"
                    value={row.grams}
                    disabled={disabled}
                    onChange={(event) => set(index, { grams: event.target.value })}
                    aria-label={`Weight in grams, set ${index + 1}`}
                  />
                  <span className="text-ink-500 text-xs">g</span>
                </div>
              </div>
              <IconButton
                tone="danger"
                aria-label={`Remove set ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, at) => at !== index))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange([...rows, emptyWeighing()])}
        >
          <Plus className="size-4" />
          {rows.length === 0 ? 'Weigh a hundred pouches' : 'Another set'}
        </Button>
        {grams > 0 ? (
          <div className="text-ink-600 text-sm tabular-nums">
            A pouch weighs{' '}
            <span className="text-ink-900 font-semibold">{formatNumber(grams, 2)} g</span>
          </div>
        ) : null}
      </div>

      {grams > 0 ? (
        <p className="text-ink-500 mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          A full box of
          <NumberInput
            className="w-20 text-right"
            value={perBox}
            disabled={disabled}
            onChange={(event) => setPerBox(event.target.value)}
            aria-label="Pouches in a full box"
          />
          pouches
          {standard ? (
            <span className="text-ink-700 tabular-nums">
              weighs {formatNumber(standard.pouchesKg, 3)} kg, plus the carton.
            </span>
          ) : (
            <span>weighs — check a carton against the scale instead of counting it.</span>
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * **What is going on the lorry, one row each.**
 *
 * Reels are weighed net, because that is what is written on the reel. Cartons
 * of pouches are weighed full and the empty carton is known, so the packer
 * types a gross and a tare and the net is what they leave — and with a pouch
 * weight established above, each carton says how many pouches are in it.
 *
 * Either way the line total is their sum and is shown rather than asked for: a
 * typed total that disagrees with the rows beneath it is a challan the works
 * and the customer read differently, and there is no arguing with it
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
  /** Cartons of pouches rather than reels. Decided by what was ordered. */
  boxes,
  /** What one pouch weighs, where it has been weighed. 0 until it has. */
  pouchGrams = 0,
}: {
  rows: PackageDraft[];
  onChange: (rows: PackageDraft[]) => void;
  disabled?: boolean;
  boxes?: boolean;
  pouchGrams?: number;
}) {
  const set = (index: number, patch: Partial<PackageDraft>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const listed = toPackageInputs(rows);
  const total = packagesNetKg(listed);
  const pouches = countedPouches(listed, pouchGrams);
  const one = boxes ? 'box' : 'reel';
  const many = boxes ? 'boxes' : 'reels';

  return (
    <div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-ink-500 text-left text-xs tracking-wide uppercase">
                <th className="pr-2 pb-1 font-medium">#</th>
                <th className="px-2 pb-1 font-medium">{boxes ? 'Box no.' : 'Reel no.'}</th>
                {boxes ? (
                  <>
                    <th className="px-2 pb-1 text-right font-medium">Gross kg</th>
                    <th className="px-2 pb-1 text-right font-medium">Box kg</th>
                    <th className="px-2 pb-1 text-right font-medium">Net kg</th>
                    <th className="px-2 pb-1 text-right font-medium">Pouches</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 pb-1 text-right font-medium">Net kg</th>
                    <th className="px-2 pb-1 text-right font-medium">Width mm</th>
                  </>
                )}
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="text-ink-400 py-1 pr-2 text-xs tabular-nums">{index + 1}</td>
                  <td className="px-2 py-1">
                    <Input
                      value={row.reelNumber}
                      disabled={disabled}
                      onChange={(event) => set(index, { reelNumber: event.target.value })}
                      placeholder="as marked"
                      aria-label={`${boxes ? 'Box' : 'Reel'} number, row ${index + 1}`}
                    />
                  </td>
                  {boxes ? (
                    <>
                      <td className="px-2 py-1">
                        <NumberInput
                          className="text-right"
                          value={row.grossKg}
                          disabled={disabled}
                          onChange={(event) => set(index, { grossKg: event.target.value })}
                          aria-label={`Gross weight, row ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <NumberInput
                          className="text-right"
                          value={row.boxKg}
                          disabled={disabled}
                          onChange={(event) => set(index, { boxKg: event.target.value })}
                          aria-label={`Box weight, row ${index + 1}`}
                        />
                      </td>
                      {/* Both worked out as they type, because both are what
                          the customer will check against the carton. */}
                      <td className="text-ink-900 px-2 py-1 text-right text-sm font-medium tabular-nums">
                        {packageNet(row) > 0 ? formatNumber(packageNet(row), 3) : '—'}
                      </td>
                      <td className="text-ink-900 px-2 py-1 text-right text-sm font-medium tabular-nums">
                        {pouchGrams > 0 && packageNet(row) > 0
                          ? formatNumber(pouchesInBox(packageNet(row), pouchGrams), 0)
                          : '—'}
                      </td>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
          {rows.length === 0 ? `List the ${many}` : `Another ${one}`}
        </Button>
        {rows.length > 0 ? (
          <div className="text-ink-600 text-sm tabular-nums">
            {listed.length} {listed.length === 1 ? one : many} ·{' '}
            <span className="text-ink-900 font-semibold">{formatNumber(total, 3)} kg</span>
            {pouches > 0 ? (
              <>
                {' · '}
                <span className="text-ink-900 font-semibold">
                  {formatNumber(pouches, 0)} pouches
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
