import {
  formatNumber,
  weighedTotal,
  type JobSheetLine,
  type JobSheetReelInput,
} from '@yuva/shared';
import { Draws } from './Draws';
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
 * **Received is several figures, not one.** Their sheet gives every colour four
 * cells for it and adds them up — `=SUM(B15:E15)` — because a colour is drawn
 * from more than once in a run: ten kilograms, then fifteen, then two with one
 * left over. We asked for a single figure, so Total could only ever repeat Rec
 * and the three draws had to be added up before they reached the form. Each
 * side now takes as many draws as it was given, and the Total is their sum.
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

  /** What a colour was given, fresh or mixed: its draws, else its typed total. */
  const freshOut = (line: JobSheetLine) => weighedTotal(line.issueReels, line.issuedKg);
  const mixOut = (line: JobSheetLine) => weighedTotal(line.mixIssueReels, line.mixIssuedKg);

  const sum = (pick: (line: JobSheetLine) => number) =>
    inks.reduce((total, line) => total + pick(line), 0);

  const freshTotal = sum(freshOut);
  const freshBal = sum((l) => l.returnedKg);
  const mixTotal = sum(mixOut);
  const mixBal = sum((l) => l.mixReturnedKg);

  /* The draws are weights; the draft holds rows with ids. The server gives
     them their rows back, so what goes up from here is the weights. */
  const asDraws = (draws: JobSheetReelInput[]) =>
    draws.map((draw, index) => ({
      id: '',
      position: index + 1,
      weightKg: draw.weightKg,
      coreKg: 0,
      reelNumber: '',
    }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-ink-200 border-b align-bottom">
            <th className="w-24 pb-1.5 text-left">
              <Head>Fresh Ink</Head>
            </th>
            <th className="pb-1.5 text-left">
              <Head>Rec</Head>
            </th>
            {['Total', 'Bal.', 'Con.'].map((head) => (
              <th key={head} className="w-[5.5rem] pr-1 pb-1.5">
                <Head className="text-right">{head}</Head>
              </th>
            ))}
            <th className="border-ink-200 w-24 border-l pb-1.5 pl-3 text-left">
              <Head>Mix Ink</Head>
            </th>
            <th className="pb-1.5 text-left">
              <Head>Rec</Head>
            </th>
            {['Bal.', 'Cons.', 'Total'].map((head) => (
              <th key={head} className="w-[5.5rem] pr-1 pb-1.5 last:pr-0">
                <Head className="text-right">{head}</Head>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inks.map((line) => {
            const fresh = freshOut(line);
            const freshCon = fresh - line.returnedKg;
            const mix = mixOut(line);
            const mixCon = mix - line.mixReturnedKg;
            return (
              <tr key={line.id} className="border-ink-100 border-b align-middle">
                <td className="text-ink-800 py-1 pr-2 font-medium">{line.name}</td>
                <td className="py-1 pr-2">
                  <Draws
                    label={`${line.name}, fresh`}
                    draws={line.issueReels}
                    disabled={disabled}
                    onDraws={(draws) => onLine(line.position, { issueReels: asDraws(draws) })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <Worked value={fresh} />
                </td>
                <td className="py-1 pr-1">
                  <Balance
                    label={`${line.name}, fresh balance`}
                    value={line.returnedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { returnedKg: next })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <Worked value={freshCon} />
                </td>

                <td className="border-ink-200 text-ink-700 border-l py-1 pr-2 pl-3">{line.name}</td>
                <td className="py-1 pr-2">
                  <Draws
                    label={`${line.name}, mix`}
                    draws={line.mixIssueReels}
                    disabled={disabled}
                    onDraws={(draws) => onLine(line.position, { mixIssueReels: asDraws(draws) })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <Balance
                    label={`${line.name}, mix balance`}
                    value={line.mixReturnedKg}
                    disabled={disabled}
                    onChange={(next) => onLine(line.position, { mixReturnedKg: next })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <Worked value={mixCon} />
                </td>
                {/* Their M column: the fresh consumed plus 40% of the mixed. */}
                <td className="py-1">
                  <Worked value={freshCon + mixCon * 0.4} className="font-semibold" />
                </td>
              </tr>
            );
          })}
          <tr className="border-ink-300 border-t">
            <td className="text-ink-700 pt-2 pr-1 text-right text-xs font-semibold" colSpan={2}>
              Total
            </td>
            <td className="pt-2 pr-1">
              <Worked value={freshTotal} />
            </td>
            <td className="pt-2 pr-1">
              <Worked value={freshBal} />
            </td>
            <td className="pt-2 pr-1">
              <Worked value={freshTotal - freshBal} />
            </td>
            {/* Their `=sum(J15:J26)`: the mix column adds up, where the four
                fresh cells do not — the fresh total is the F column beside. */}
            <td className="text-ink-700 pt-2 pr-1 pl-3 text-right text-xs font-semibold">Total</td>
            <td className="pt-2 pr-1">
              <Worked value={mixTotal} className="font-semibold" />
            </td>
            <td className="pt-2 pr-1">
              <Worked value={mixBal} />
            </td>
            <td className="pt-2 pr-1">
              <Worked value={mixTotal - mixBal} />
            </td>
            <td className="pt-2 pr-1">
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

/** What came back: one figure, as their sheet's single Bal. cell has it. */
function Balance({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <Typed
      width="w-full"
      label={label}
      value={value}
      disabled={disabled}
      onChange={(next) => onChange(Number(next || 0))}
    />
  );
}
