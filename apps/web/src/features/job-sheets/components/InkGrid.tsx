import { formatNumber, type JobSheetLine } from '@yuva/shared';
import { Head, Typed, Worked } from './sheet-form';

/**
 * **The ink block, as the works rules it: fresh on the left, mix on the right.**
 *
 * Each colour is bought in tins and mixed in its own drum, and their form has
 * both: what was taken fresh and what came back, then what was drawn from the
 * drum and what went back to it. The consumption is the fresh less its balance
 * PLUS forty per cent of the mixed — the other sixty is solvent and is booked
 * against the ethyl and toluene rows below.
 *
 * The foot of the block is the Total row their sheet carries, and it is the
 * drum the solvents take their share of. It is added up here rather than typed
 * anywhere, which is what their own `=sum(J15:J26)` does.
 */
export function InkGrid({
  lines,
  onLine,
  disabled,
}: {
  lines: JobSheetLine[];
  onLine: (position: number, patch: Partial<JobSheetLine>) => void;
  disabled?: boolean;
}) {
  const inks = lines.filter((line) => line.kind === 'INK');
  const sum = (pick: (line: JobSheetLine) => number) =>
    inks.reduce((total, line) => total + pick(line), 0);

  const freshTotal = sum((l) => l.issuedKg);
  const freshBal = sum((l) => l.returnedKg);
  const mixTotal = sum((l) => l.mixIssuedKg);
  const mixBal = sum((l) => l.mixReturnedKg);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-separate border-spacing-y-0.5 text-sm">
        <thead>
          <tr className="text-left align-bottom">
            <th className="w-28 pb-1">
              <Head>Fresh Ink</Head>
            </th>
            <th className="pb-1">
              <Head>Rec</Head>
            </th>
            <th className="pb-1">
              <Head>Total</Head>
            </th>
            <th className="pb-1">
              <Head>Bal.</Head>
            </th>
            <th className="pb-1">
              <Head>Con.</Head>
            </th>
            <th className="border-ink-200 w-24 border-l pb-1 pl-3">
              <Head>Mix Ink</Head>
            </th>
            <th className="pb-1">
              <Head>Rec</Head>
            </th>
            <th className="pb-1">
              <Head>Bal.</Head>
            </th>
            <th className="pb-1">
              <Head>Cons.</Head>
            </th>
            <th className="pb-1">
              <Head>Total</Head>
            </th>
          </tr>
        </thead>
        <tbody>
          {inks.map((line) => {
            const freshCon = line.issuedKg - line.returnedKg;
            const mixCon = line.mixIssuedKg - line.mixReturnedKg;
            return (
              <tr key={line.id}>
                <td className="text-ink-800 pr-2 font-medium">{line.name}</td>
                <td className="pr-1">
                  <Typed
                    width="w-[72px]"
                    label={`${line.name}, fresh received`}
                    value={line.issuedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { issuedKg: Number(next || 0) })}
                  />
                </td>
                <td className="pr-1">
                  <Worked value={freshCon + line.returnedKg} />
                </td>
                <td className="pr-1">
                  <Typed
                    width="w-[72px]"
                    label={`${line.name}, fresh balance`}
                    value={line.returnedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { returnedKg: Number(next || 0) })}
                  />
                </td>
                <td className="pr-1">
                  <Worked value={freshCon} />
                </td>
                <td className="border-ink-200 text-ink-700 border-l pl-3 pr-2">{line.name}</td>
                <td className="pr-1">
                  <Typed
                    width="w-[72px]"
                    label={`${line.name}, mix received`}
                    value={line.mixIssuedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { mixIssuedKg: Number(next || 0) })}
                  />
                </td>
                <td className="pr-1">
                  <Typed
                    width="w-[72px]"
                    label={`${line.name}, mix balance`}
                    value={line.mixReturnedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { mixReturnedKg: Number(next || 0) })}
                  />
                </td>
                <td className="pr-1">
                  <Worked value={mixCon} />
                </td>
                {/* Their M column: the fresh consumed plus 40% of the mixed. */}
                <td>
                  <Worked value={freshCon + mixCon * 0.4} className="font-semibold" />
                </td>
              </tr>
            );
          })}
          <tr className="border-ink-300 border-t">
            <td className="text-ink-700 pt-1 text-right text-xs font-semibold" colSpan={2}>
              Total
            </td>
            <td className="pt-1">
              <Worked value={freshTotal} />
            </td>
            <td className="pt-1">
              <Worked value={freshBal} />
            </td>
            <td className="pt-1">
              <Worked value={freshTotal - freshBal} />
            </td>
            <td className="border-ink-200 border-l pl-3 pt-1 text-right text-xs font-semibold">
              Total
            </td>
            <td className="pt-1">
              <Worked value={mixTotal} />
            </td>
            <td className="pt-1">
              <Worked value={mixBal} />
            </td>
            <td className="pt-1">
              <Worked value={mixTotal - mixBal} />
            </td>
            <td className="pt-1">
              <Worked
                value={freshTotal - freshBal + (mixTotal - mixBal) * 0.4}
                className="font-semibold"
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* The drum the solvents take their share of, which is the row above. */}
      <p className="text-ink-500 mt-1.5 text-xs">
        The mix total — {formatNumber(mixTotal, 3)} out, {formatNumber(mixBal, 3)} back — is the
        drum the ethyl acetate and toluene rows draw 40% and 20% of. It is added up here, not typed.
      </p>
    </div>
  );
}
