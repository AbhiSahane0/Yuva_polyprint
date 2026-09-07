import { useEffect, useState } from 'react';
import { Cog, Plus, RotateCcw, Users2 } from 'lucide-react';
import {
  ADHESIVE_BATCHES,
  MACHINE_KINDS,
  MACHINE_KIND_LABELS,
  formatNumber,
  formatRs,
  salaryPerMinute,
  type AppSettings,
  type Labour,
  type Machine,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, NumberInput, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useSettings } from '@/features/quotations/api/quotation-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useCostingMasterData,
  useRetireLabour,
  useRetireMachine,
  useUpdateSettings,
} from '../api/costing-api';
import { MachineModal } from '../components/MachineModal';
import { LabourModal } from '../components/LabourModal';

/**
 * Costing master data — what the works IS, rather than what a job is.
 *
 * Every quoted rate is built from this page: kilograms become running metres,
 * metres become minutes at a machine's speed, and minutes become rupees at
 * these wages and these tariffs. A figure that is three years stale here makes
 * every quotation raised afterwards wrong by the same amount, and nobody would
 * see it — which is why it is a screen rather than a constant in the code.
 */
export default function CostingPage() {
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'rates');

  const [showRetired, setShowRetired] = useState(false);
  const { data, isPending } = useCostingMasterData(showRetired);
  const { data: settings } = useSettings();

  const [machine, setMachine] = useState<Machine | null | undefined>(undefined);
  const [labour, setLabour] = useState<Labour | null | undefined>(undefined);

  const retireMachine = useRetireMachine();
  const retireLabour = useRetireLabour();

  if (isPending || !data || !settings) return <LoadingState label="Loading costing data…" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Costing</h1>
          <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
            What the works costs to run. Every quoted rate is built from these figures — a machine
            speed, a wage or a tariff that is out of date makes every quotation raised afterwards
            wrong by the same amount.
          </p>
        </div>
        {data.machines.some((m) => !m.isActive) ||
        data.labour.some((l) => !l.isActive) ||
        showRetired ? (
          <Button variant="ghost" size="sm" onClick={() => setShowRetired((on) => !on)}>
            <RotateCcw className="size-4" />
            {showRetired ? 'Active only' : 'Show retired'}
          </Button>
        ) : null}
      </header>

      {/* --- machines ------------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-ink-900 flex items-center gap-2 text-base font-semibold">
            <Cog className="text-ink-400 size-4" />
            Machines
          </h2>
          {canEdit ? (
            <Button size="sm" onClick={() => setMachine(null)}>
              <Plus className="size-4" />
              Add a machine
            </Button>
          ) : null}
        </div>

        {data.machines.length === 0 ? (
          <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
            <EmptyState
              title="No machines on record"
              description="A rate cannot be costed until the works has at least a press."
            />
          </div>
        ) : (
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                    <th className="px-4 py-3 font-semibold">Machine</th>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 text-right font-semibold">Load</th>
                    <th className="px-4 py-3 text-right font-semibold">Rs / HP-hour</th>
                    <th className="px-4 py-3 text-right font-semibold">Speed</th>
                    <th className="px-4 py-3 text-right font-semibold">Setup</th>
                    <th className="px-4 py-3 text-right font-semibold">Load while setting</th>
                    <th className="px-4 py-3 text-right font-semibold">Running cost</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.machines.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-ink-100 hover:bg-ink-25 border-b',
                        !row.isActive && 'opacity-55',
                      )}
                    >
                      <td className="text-ink-900 px-4 py-3 font-medium">
                        {row.name}
                        {!row.isActive ? (
                          <Badge tone="neutral" className="ml-2">
                            Retired
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-ink-600 px-4 py-3">{MACHINE_KIND_LABELS[row.kind]}</td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {formatNumber(row.horsepower, 0)} HP
                      </td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {formatRs(row.powerRatePerHpHour)}
                      </td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {formatNumber(row.speedMPerMin, 0)} m/min
                      </td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {row.setupMinutes} min
                      </td>
                      {/*
                        Their sheet charges nothing here and this app charged
                        everything; a press being threaded is neither.
                      */}
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {formatNumber(row.setupPowerFactor * 100, 0)}%
                      </td>
                      {/* The figure the office can sanity-check against a bill. */}
                      <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                        {formatRs(row.horsepower * row.powerRatePerHpHour)}
                        <span className="text-ink-400 block text-xs font-normal">per hour</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setMachine(row)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retireMachine.mutate(row.id)}
                            >
                              {row.isActive ? 'Retire' : 'Restore'}
                            </Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* --- labour -------------------------------------------------------- */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-ink-900 flex items-center gap-2 text-base font-semibold">
            <Users2 className="text-ink-400 size-4" />
            Labour
          </h2>
          {canEdit ? (
            <Button size="sm" onClick={() => setLabour(null)}>
              <Plus className="size-4" />
              Add a role
            </Button>
          ) : null}
        </div>

        <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Works on</th>
                  <th className="px-4 py-3 text-right font-semibold">Monthly</th>
                  <th className="px-4 py-3 text-right font-semibold">Per minute</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.labour.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-ink-100 hover:bg-ink-25 border-b',
                      !row.isActive && 'opacity-55',
                    )}
                  >
                    <td className="text-ink-900 px-4 py-3 font-medium">
                      {row.role}
                      {!row.isActive ? (
                        <Badge tone="neutral" className="ml-2">
                          Retired
                        </Badge>
                      ) : null}
                    </td>
                    <td className="text-ink-600 px-4 py-3">{MACHINE_KIND_LABELS[row.process]}</td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {formatRs(row.monthlySalary)}
                    </td>
                    {/*
                      What the costing actually uses. Shown because a monthly
                      salary is not a figure anybody can check a rate against.
                    */}
                    <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                      {/* Two places: rounded to rupees, every wage reads Rs 1 or 2. */}
                      {formatRs(
                        salaryPerMinute(
                          row.monthlySalary,
                          settings.workingDaysPerMonth,
                          settings.hoursPerDay,
                        ),
                        2,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canEdit ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setLabour(row)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retireLabour.mutate(row.id)}
                          >
                            {row.isActive ? 'Retire' : 'Restore'}
                          </Button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <OverheadsForm settings={settings} canEdit={canEdit} />

      <MachineModal
        open={machine !== undefined}
        machine={machine ?? null}
        onClose={() => setMachine(undefined)}
      />
      <LabourModal
        open={labour !== undefined}
        labour={labour ?? null}
        onClose={() => setLabour(undefined)}
      />
    </div>
  );
}

/** The figures that belong to the works but are not a machine or a wage. */
function OverheadsForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const update = useUpdateSettings();
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  const set = (key: keyof AppSettings, value: string | number) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    try {
      await update.mutateAsync(draft);
      toast.success('Costing figures saved');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError || error instanceof Error
          ? error.message
          : 'Could not save',
      );
    }
  }

  const numbers: [keyof AppSettings, string, string][] = [
    ['workingDaysPerMonth', 'Working days a month', 'Turns a salary into a rate per minute'],
    ['hoursPerDay', 'Hours a day', 'The shift, for the same reason'],
    ['transportPerKg', 'Transport, Rs/kg', 'On the quantity consumed'],
    ['packingPerKg', 'Packing, Rs/kg', 'On the quantity consumed'],
    ['otherPerJob', 'Sundries, Rs/job', 'A flat sum the works does not itemise'],
    ['emiPerMonth', 'Bank EMI, Rs/month', 'Recovered across machine time'],
    ['emiHoursPerMonth', 'Machine hours a month', 'What the EMI is spread over'],
    ['pouchMakingPerKg', 'Pouch making, Rs/kg', 'Not charged on a roll'],
    ['stationSurcharge6', '6th station, Rs/kg', 'A job past five colours'],
    ['stationSurcharge7', '7th station, Rs/kg', ''],
    ['stationSurcharge8', '8th station, Rs/kg', ''],
    ['defaultTrimMm', 'Trim, mm', 'Added to the web width'],
    ['defaultWastagePercent', 'Wastage %', 'Film spoiled setting up and running'],
    ['defaultMarginPercent', 'Margin %', 'Added to cost, not taken off the rate'],
    ['inkSolventParts', 'Solvent per 100 of ink', 'How the press thins it'],
    ['ethylAcetatePercent', 'Ethyl acetate %', 'The rest is toluene'],
  ];

  return (
    <section>
      <h2 className="text-ink-900 mb-1 text-base font-semibold">Overheads and defaults</h2>
      <p className="text-ink-500 mb-3 text-sm">
        Everything else a rate is built from. Each one is a starting point on a new quotation and
        can be changed on the line.
      </p>

      <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {numbers.map(([key, label, hint]) => (
            <Field key={key} label={label} htmlFor={key} hint={hint || undefined}>
              <NumberInput
                id={key}
                value={String(draft[key] ?? '')}
                onChange={(event) => set(key, event.target.value)}
                disabled={!canEdit}
              />
            </Field>
          ))}

          <Field
            label="Adhesive batch"
            htmlFor="defaultAdhesiveRatio"
            hint="adhesive : ethyl acetate : hardener"
          >
            <Select
              id="defaultAdhesiveRatio"
              value={draft.defaultAdhesiveRatio}
              onChange={(event) => set('defaultAdhesiveRatio', event.target.value)}
              disabled={!canEdit}
            >
              {ADHESIVE_BATCHES.map((batch) => (
                <option key={batch.ratio} value={batch.ratio}>
                  {batch.ratio} — {batch.solidsPercent}% solid
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Margin is taken on"
            htmlFor="marginBasis"
            hint={
              draft.marginBasis === 'MATERIAL_ONLY'
                ? 'Labour and power are recovered at cost, earning nothing'
                : 'Everything the job costs'
            }
          >
            <Select
              id="marginBasis"
              value={draft.marginBasis}
              onChange={(event) => set('marginBasis', event.target.value)}
              disabled={!canEdit}
            >
              <option value="TOTAL_COST">The whole cost</option>
              <option value="MATERIAL_ONLY">Materials only</option>
            </Select>
          </Field>
        </div>

        {canEdit ? (
          <div className="border-ink-200 mt-5 flex justify-end border-t pt-4">
            <Button onClick={() => void save()} loading={update.isPending}>
              Save costing figures
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export { MACHINE_KINDS };
