import type { JobSheetStage, JobSheetStageUsage } from '@yuva/shared';
import { Head, Typed, Worked } from './sheet-form';
import { Band, DocCard } from '@/components/ui/Document';

/** One line of the card: what went on, what came back, what it cost the job. */
export interface StageCardRow {
  name: string;
  input: number;
  balance: number;
  consumption: number;
}

/**
 * **The card the works prints for a machine.**
 *
 * Their sheet has one of these for the press and one for the laminator, and
 * they are a SUMMARY, not an entry form: every figure on them comes from the
 * rows above, with the mixed drum folded in — ink plus forty per cent of the
 * mix, ethyl plus forty, toluene plus twenty, adhesive plus forty, hardener
 * plus five. Nothing on the left of this card can be typed.
 *
 * What can be typed is the remarks box on the right, and that is the point of
 * the card: how much was lost at this machine, how long the power was off,
 * when the job was taken, how long registration took. None of it is costed —
 * a run costs what it consumed — and all of it is what the office reads when a
 * job goes wrong.
 */
export function StageCard({
  title,
  srNo,
  date,
  rows,
  usage,
  onUsage,
  disabled,
}: {
  title: string;
  srNo: number;
  date: string;
  rows: StageCardRow[];
  usage: JobSheetStageUsage | undefined;
  onUsage: (stage: JobSheetStage, patch: Partial<JobSheetStageUsage>) => void;
  disabled?: boolean;
}) {
  const stage = usage?.stage;
  const change = (patch: Partial<JobSheetStageUsage>) => stage && onUsage(stage, patch);

  return (
    <DocCard>
      <Band
        title={title}
        right={
          <span className="tabular-nums">
            Sr. No. {srNo} · Date {date}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <div className="mb-1 grid grid-cols-[9rem_repeat(3,minmax(0,1fr))] gap-2">
            <Head>&nbsp;</Head>
            <Head className="text-right">Input</Head>
            <Head className="text-right">Balance</Head>
            <Head className="text-right">Consumption</Head>
          </div>
          {rows.map((row) => (
            <div
              key={row.name}
              className="border-ink-100 grid grid-cols-[9rem_repeat(3,minmax(0,1fr))] items-center gap-2 border-b py-1 last:border-b-0"
            >
              <span className="text-ink-800 text-sm">{row.name}</span>
              <Worked value={row.input} />
              <Worked value={row.balance} />
              <Worked value={row.consumption} className="font-semibold" />
            </div>
          ))}
        </div>

        {/* The remarks box. Typed, and none of it costed. */}
        <div className="border-ink-200 bg-ink-25 space-y-2 rounded-lg border p-3">
          <Head>Production remark</Head>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-600 text-xs">Wastage</span>
            <Typed
              width="w-20"
              label={`${title} wastage, kg`}
              value={usage?.wastageKg ?? 0}
              disabled={disabled}
              onChange={(next) => change({ wastageKg: Number(next || 0) })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-600 text-xs">No power time</span>
            <Typed
              width="w-20"
              label={`${title} no power time, minutes`}
              value={usage?.noPowerMinutes ?? 0}
              disabled={disabled}
              onChange={(next) => change({ noPowerMinutes: Number(next || 0) })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-600 text-xs">Job taken time</span>
            <Typed
              text
              width="w-20"
              label={`${title} job taken time`}
              value={usage?.jobTakenTime ?? ''}
              disabled={disabled}
              placeholder="9:30"
              onChange={(next) => change({ jobTakenTime: next })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-600 text-xs">Regi. &amp; shade match</span>
            <Typed
              text
              width="w-20"
              label={`${title} registration and shade match time`}
              value={usage?.registrationTime ?? ''}
              disabled={disabled}
              placeholder="0:45"
              onChange={(next) => change({ registrationTime: next })}
            />
          </div>
        </div>
      </div>
    </DocCard>
  );
}
