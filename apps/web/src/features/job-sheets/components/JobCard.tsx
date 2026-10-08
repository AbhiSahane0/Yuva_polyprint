import {
  asHoursMinutes,
  computeJobCard,
  dispatchDateFrom,
  formatNumber,
  type JobSheetInput,
} from '@yuva/shared';
import { Field, Input, NumberInput } from '@/components/ui/Field';
import { useJobSpecification } from '@/features/jobs/api/job-api';
import { cn } from '@/lib/utils';

/**
 * **The job card** — the paper an operator is handed before the press starts.
 *
 * Laid out as the works' own Job Sheet is, department by department, because
 * the people reading it have read that sheet for years and know where to look.
 * What they type is a box; everything else is a fact read off the design or
 * worked out from it, and is shown as text so nobody wonders whether it is
 * theirs to change.
 *
 * The works marks its own inputs yellow. So does this, for the same reason and
 * in the same places — it is the one piece of formatting on their sheet that
 * carries meaning rather than decoration.
 */

/** A figure the card worked out. Never a box: nothing here is typed. */
function Shown({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <div className="text-ink-500 text-[11px] font-medium tracking-wide uppercase">{label}</div>
      <div className="text-ink-900 mt-0.5 truncate text-sm font-medium tabular-nums">
        {value || '—'}
      </div>
    </div>
  );
}

/** The works' own yellow: a box somebody has to fill in. */
const TYPED = 'bg-[#FFFDE7] border-[#E6D98A]';

function Band({ title }: { title: string }) {
  return (
    <div className="bg-ink-100 text-ink-700 -mx-4 mt-5 mb-3 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase first:mt-0">
      {title}
    </div>
  );
}

export function JobCard({
  draft,
  jobId,
  rates,
  disabled,
  onChange,
}: {
  draft: JobSheetInput;
  jobId: string | null;
  /** The works' figures for this card's date — see the Costing screen. */
  rates: {
    cylinderChangeoverMinutes: number;
    rubberChangeMinutes: number;
    jobCardAllowancePercent: number;
    dispatchLeadDays: number;
  };
  disabled: boolean;
  onChange: <K extends keyof JobSheetInput>(key: K, value: JobSheetInput[K]) => void;
}) {
  const { data: spec, isPending } = useJobSpecification(jobId);

  if (!jobId) {
    return (
      <section className="border-ink-200 rounded-lg border border-dashed bg-white p-6 text-center">
        <p className="text-ink-500 text-sm">
          Pick the design this run is for and its card fills itself in.
        </p>
      </section>
    );
  }
  if (isPending || !spec) {
    return (
      <section className="border-ink-200 rounded-lg border bg-white p-6">
        <p className="text-ink-400 text-sm">Reading the design…</p>
      </section>
    );
  }

  const card = computeJobCard(
    {
      petMicron: spec.petMicron,
      metPetMicron: spec.metPetMicron,
      polyMicron: spec.polyMicron,
      petGsm: spec.petGsm,
      metPetGsm: spec.metPetGsm,
      polyGsm: spec.polyGsm,
      compositeGsm: spec.compositeGsm,
      rubberSizeMm: spec.rubberSizeMm,
      pouchesPerKg: spec.pouchesPerKg,
      totalCylinders: spec.totalCylinders,
    },
    {
      cylinderChangeoverMinutes: rates.cylinderChangeoverMinutes,
      rubberChangeMinutes: rates.rubberChangeMinutes,
      /* The setting is named for the card it belongs to; the calculator names
         it for what it does to a ply. Mapped here rather than renaming either. */
      plyAllowancePercent: rates.jobCardAllowancePercent,
      dispatchLeadDays: rates.dispatchLeadDays,
    },
    {
      quantityKg: draft.quantityKg,
      printSpeedMPerMin: draft.printSpeedMPerMin,
      pouchingSpeedPerMin: draft.pouchingSpeedPerMin,
      otherSettingMinutes: draft.otherSettingMinutes,
    },
  );

  /* The floor's figure where it has corrected the arithmetic — see the schema. */
  const metres = draft.printMetersOverride ?? card.printMeters;
  const mm = (value: number) => (value > 0 ? `${formatNumber(value, 0)} mm` : '');
  const kg = (value: number) => (value > 0 ? `${formatNumber(value, 2)} kg` : '');

  return (
    <section className="border-ink-200 overflow-hidden rounded-lg border bg-white p-4">
      {/* ---- who it is for, and when ---- */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Work order no." htmlFor="workOrderNo">
          <Input
            id="workOrderNo"
            className={TYPED}
            value={draft.workOrderNo}
            disabled={disabled}
            onChange={(event) => onChange('workOrderNo', event.target.value)}
          />
        </Field>
        <Shown label="Customer" value={spec.customerName ?? ''} />
        <Shown label="Design" value={spec.jobName} wide />

        <Field label="PO date" htmlFor="poDate">
          <Input
            id="poDate"
            type="date"
            className={TYPED}
            value={draft.poDate ?? ''}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value || null;
              onChange('poDate', next);
              /*
               * The promised date follows the order until somebody moves it.
               * Rewritten on every change of the PO date rather than only when
               * blank: a card re-dated for a customer who reordered should not
               * keep promising the old week.
               */
              onChange(
                'dispatchDate',
                next ? dispatchDateFrom(next, rates.dispatchLeadDays) : null,
              );
            }}
          />
        </Field>
        <Field label="Date of despatch" htmlFor="dispatchDate">
          <Input
            id="dispatchDate"
            type="date"
            className={TYPED}
            value={draft.dispatchDate ?? ''}
            disabled={disabled}
            onChange={(event) => onChange('dispatchDate', event.target.value || null)}
          />
        </Field>
        <Field label="Transport" htmlFor="transport">
          <Input
            id="transport"
            className={TYPED}
            placeholder="Company vehicle"
            value={draft.transport}
            disabled={disabled}
            onChange={(event) => onChange('transport', event.target.value)}
          />
        </Field>
        <Field label="Job received by" htmlFor="jobReceivedBy">
          <Input
            id="jobReceivedBy"
            className={TYPED}
            value={draft.jobReceivedBy}
            disabled={disabled}
            onChange={(event) => onChange('jobReceivedBy', event.target.value)}
          />
        </Field>

        <Field label="Quantity (kg)" htmlFor="quantityKg">
          <NumberInput
            id="quantityKg"
            className={TYPED}
            value={draft.quantityKg === 0 ? '' : String(draft.quantityKg)}
            disabled={disabled}
            onChange={(event) => onChange('quantityKg', Number(event.target.value || 0))}
          />
        </Field>
        <Shown label="Total micron" value={`${formatNumber(card.totalMicron, 0)} µ`} />
        <Shown label="No. of cylinders" value={formatNumber(spec.totalCylinders, 0)} />
        <Shown label="Material type" value={spec.jobType} />

        <Shown label="Cylinder size" value={mm(spec.cylinderCellMm)} />
        <Shown label="Circumference" value={mm(spec.cylinderDiaMm)} />
        <Shown label="Lami. rubber size" value={mm(spec.rubberSizeMm)} />
        <Shown label="Pouch plate size" value={spec.pouchPlateSize} />
      </div>

      {/* ---- printing ---- */}
      <Band title="Printing department" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Shown label="Material size" value={mm(card.materialSizeMm)} />
        <Shown label="Job colours" value={spec.jobColours} wide />
        <Shown label="Printing style" value={spec.printingType} />

        <Field label="Printing type" htmlFor="printingNote">
          <Input
            id="printingNote"
            className={TYPED}
            placeholder="Regular"
            value={draft.printingNote}
            disabled={disabled}
            onChange={(event) => onChange('printingNote', event.target.value)}
          />
        </Field>
        <Shown label="PET micron" value={spec.petMicron > 0 ? `${spec.petMicron} µ` : ''} />
        <Shown label="PET kg" value={kg(card.pet.kg)} />
        <Field label="Metres" htmlFor="printMeters">
          <NumberInput
            id="printMeters"
            className={TYPED}
            placeholder={formatNumber(card.printMeters, 0)}
            value={draft.printMetersOverride === null ? '' : String(draft.printMetersOverride)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                'printMetersOverride',
                event.target.value === '' ? null : Number(event.target.value),
              )
            }
          />
        </Field>

        <Field label="Printing speed, m/min" htmlFor="printSpeed">
          <NumberInput
            id="printSpeed"
            className={TYPED}
            value={draft.printSpeedMPerMin === 0 ? '' : String(draft.printSpeedMPerMin)}
            disabled={disabled}
            onChange={(event) => onChange('printSpeedMPerMin', Number(event.target.value || 0))}
          />
        </Field>
        <Shown
          label="Printing time"
          value={asHoursMinutes(
            draft.printSpeedMPerMin > 0 ? metres / draft.printSpeedMPerMin : null,
          )}
        />
      </div>

      {/* ---- lamination ---- */}
      <Band title="Lamination department" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Shown label="Layers" value={spec.layer > 0 ? formatNumber(spec.layer, 0) : ''} />
        <Shown label="Met Pet size" value={mm(card.metPet.sizeMm)} />
        <Shown
          label="Met Pet micron"
          value={spec.metPetMicron > 0 ? `${spec.metPetMicron} µ` : ''}
        />
        <Shown label="Met Pet kg" value={kg(card.metPet.kg)} />

        <Field label="Met Pet coating GSM" htmlFor="metPetCoatingGsm">
          <NumberInput
            id="metPetCoatingGsm"
            className={TYPED}
            value={draft.metPetCoatingGsm === 0 ? '' : String(draft.metPetCoatingGsm)}
            disabled={disabled}
            onChange={(event) => onChange('metPetCoatingGsm', Number(event.target.value || 0))}
          />
        </Field>
        <Shown label="Viscosity" value={spec.viscosity} />
        <Shown label="Poly" value={spec.polyType} wide />

        <Shown label="Poly size" value={mm(card.poly.sizeMm)} />
        <Shown label="Poly micron" value={spec.polyMicron > 0 ? `${spec.polyMicron} µ` : ''} />
        <Shown label="Poly kg" value={kg(card.poly.kg)} />
        <Field label="Poly coating GSM" htmlFor="polyCoatingGsm">
          <NumberInput
            id="polyCoatingGsm"
            className={TYPED}
            value={draft.polyCoatingGsm === 0 ? '' : String(draft.polyCoatingGsm)}
            disabled={disabled}
            onChange={(event) => onChange('polyCoatingGsm', Number(event.target.value || 0))}
          />
        </Field>
      </div>

      {/* ---- slitting ---- */}
      <Band title="Slitting department" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Shown label="Single roll width" value={mm(spec.singleRollWidthMm)} />
        <Shown label="Job direction" value={spec.jobFinalDirection} />
        <Shown label="No. of ups" value={spec.ups > 0 ? formatNumber(spec.ups, 0) : ''} />
        <Field label="Single roll weight" htmlFor="singleRollWeight">
          <Input
            id="singleRollWeight"
            className={TYPED}
            placeholder={spec.singleRollWeight || '13-14'}
            value={draft.singleRollWeight}
            disabled={disabled}
            onChange={(event) => onChange('singleRollWeight', event.target.value)}
          />
        </Field>
      </div>

      {/* ---- pouching ---- */}
      <Band title="Pouching department" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Shown label="Pouch type" value={spec.pouchSubType} wide />
        <Shown label="Open width" value={mm(spec.pouchOpenWidthMm)} />
        <Shown label="Height" value={mm(spec.pouchHeightMm)} />

        <Shown label="Total pouches" value={formatNumber(card.totalPouches, 0)} />
        <Shown label="D punch top" value={spec.dPunchTopSize} />
        <Shown
          label="Side gusset"
          value={[spec.gusset, spec.gussetSize].filter(Boolean).join(' · ')}
        />
        <Shown label="V notch" value={spec.vNotch} />

        <Field label="Pouching speed, /min" htmlFor="pouchingSpeed">
          <NumberInput
            id="pouchingSpeed"
            className={TYPED}
            value={draft.pouchingSpeedPerMin === 0 ? '' : String(draft.pouchingSpeedPerMin)}
            disabled={disabled}
            onChange={(event) => onChange('pouchingSpeedPerMin', Number(event.target.value || 0))}
          />
        </Field>
        <Shown label="Pouching time" value={asHoursMinutes(card.pouchingMinutes)} />
        <Field label="Pouch sorting" htmlFor="pouchSorting">
          <Input
            id="pouchSorting"
            className={TYPED}
            value={draft.pouchSorting}
            disabled={disabled}
            onChange={(event) => onChange('pouchSorting', event.target.value)}
          />
        </Field>
      </div>

      {/* ---- what the job costs in time ---- */}
      <Band title="Time on the machine" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Shown label="Cylinder changeover" value={asHoursMinutes(card.cylinderChangeoverMinutes)} />
        <Shown label="Rubber change" value={asHoursMinutes(card.rubberChangeMinutes)} />
        <Field label="Other setting, min" htmlFor="otherSetting">
          <NumberInput
            id="otherSetting"
            className={TYPED}
            value={draft.otherSettingMinutes === 0 ? '' : String(draft.otherSettingMinutes)}
            disabled={disabled}
            onChange={(event) => onChange('otherSettingMinutes', Number(event.target.value || 0))}
          />
        </Field>
        {/* The one figure the whole card builds to, so it reads like one. */}
        <div className="border-brand-200 bg-brand-50/60 rounded-md border px-3 py-2">
          <div className="text-brand-700 text-[11px] font-semibold tracking-wide uppercase">
            Final time
          </div>
          <div className="text-ink-900 mt-0.5 text-lg font-bold tabular-nums">
            {asHoursMinutes(
              card.cylinderChangeoverMinutes +
                card.rubberChangeMinutes +
                draft.otherSettingMinutes +
                (draft.printSpeedMPerMin > 0 ? metres / draft.printSpeedMPerMin : 0),
            )}
          </div>
        </div>
      </div>

      {/* ---- instructions and signatures ---- */}
      <Band title="Special instructions" />
      <Input
        aria-label="Special instructions"
        className={TYPED}
        value={draft.specialInstructions}
        disabled={disabled}
        onChange={(event) => onChange('specialInstructions', event.target.value)}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {/*
          Typed, not chosen from the employee list.
          The office prints this card and takes a signature from each of the
          three, so these are the names that will be signed against — and a
          dropdown would stop it naming somebody who is not on the payroll
          screen yet.
        */}
        <Field label="Prepared by" htmlFor="preparedBy">
          <Input
            id="preparedBy"
            className={TYPED}
            value={draft.preparedBy}
            disabled={disabled}
            onChange={(event) => onChange('preparedBy', event.target.value)}
          />
        </Field>
        <Field label="Operated by" htmlFor="operatedBy">
          <Input
            id="operatedBy"
            className={TYPED}
            value={draft.operatorName}
            disabled={disabled}
            onChange={(event) => onChange('operatorName', event.target.value)}
          />
        </Field>
        <Field label="Approved by" htmlFor="approvedBy">
          <Input
            id="approvedBy"
            className={TYPED}
            value={draft.approvedBy}
            disabled={disabled}
            onChange={(event) => onChange('approvedBy', event.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}
