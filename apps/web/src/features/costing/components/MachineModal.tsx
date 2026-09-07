import { useEffect, useState } from 'react';
import {
  MACHINE_KINDS,
  MACHINE_KIND_LABELS,
  formatRs,
  machineSchema,
  type Machine,
  type MachineKind,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useSaveMachine } from '../api/costing-api';

interface Props {
  open: boolean;
  machine: Machine | null;
  onClose: () => void;
}

const BLANK = {
  name: '',
  kind: 'PRINTING' as MachineKind,
  horsepower: '',
  powerRatePerHpHour: '',
  speedMPerMin: '',
  setupMinutes: '',
  setupPowerFactor: '1',
};

export function MachineModal({ open, machine, onClose }: Props) {
  const save = useSaveMachine();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      machine
        ? {
            name: machine.name,
            kind: machine.kind,
            horsepower: String(machine.horsepower),
            powerRatePerHpHour: String(machine.powerRatePerHpHour),
            speedMPerMin: String(machine.speedMPerMin),
            setupMinutes: String(machine.setupMinutes),
            setupPowerFactor: String(machine.setupPowerFactor),
          }
        : BLANK,
    );
  }, [open, machine]);

  const set = (key: keyof typeof BLANK, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    /*
     * Checked here against the same schema the API uses, so a refusal names the
     * field rather than arriving as "Validation failed" with nothing attached.
     */
    const parsed = machineSchema.safeParse({ ...form, isActive: machine?.isActive ?? true });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    setErrors({});

    try {
      await save.mutateAsync({ ...parsed.data, ...(machine ? { id: machine.id } : {}) });
      toast.success(machine ? `${parsed.data.name} updated` : `${parsed.data.name} added`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError || error instanceof Error
          ? error.message
          : 'Could not save',
      );
    }
  }

  const perHour = Number(form.horsepower) * Number(form.powerRatePerHpHour);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={machine ? 'Edit machine' : 'Add a machine'}
      description="Speed turns metres into minutes; load and rate turn minutes into rupees."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            {machine ? 'Save' : 'Add machine'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="m-name" error={errors.name}>
          <Input
            id="m-name"
            value={form.name}
            invalid={Boolean(errors.name)}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>

        <Field label="Stage" htmlFor="m-kind" hint="Which pass of the job it runs">
          <Select
            id="m-kind"
            value={form.kind}
            onChange={(event) => set('kind', event.target.value)}
          >
            {MACHINE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MACHINE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Connected load"
          htmlFor="m-hp"
          hint="HP — a press counts its stations too"
          error={errors.horsepower}
        >
          <NumberInput
            id="m-hp"
            value={form.horsepower}
            invalid={Boolean(errors.horsepower)}
            onChange={(event) => set('horsepower', event.target.value)}
          />
        </Field>

        <Field
          label="Rate per HP-hour"
          htmlFor="m-rate"
          hint="The tariff, or a loaded figure"
          error={errors.powerRatePerHpHour}
        >
          <NumberInput
            id="m-rate"
            value={form.powerRatePerHpHour}
            invalid={Boolean(errors.powerRatePerHpHour)}
            onChange={(event) => set('powerRatePerHpHour', event.target.value)}
          />
        </Field>

        <Field label="Speed" htmlFor="m-speed" hint="metres a minute" error={errors.speedMPerMin}>
          <NumberInput
            id="m-speed"
            value={form.speedMPerMin}
            invalid={Boolean(errors.speedMPerMin)}
            onChange={(event) => set('speedMPerMin', event.target.value)}
          />
        </Field>

        <Field
          label="Setup"
          htmlFor="m-setup"
          hint="minutes to set and clean, before a metre runs"
          error={errors.setupMinutes}
        >
          <NumberInput
            id="m-setup"
            value={form.setupMinutes}
            invalid={Boolean(errors.setupMinutes)}
            onChange={(event) => set('setupMinutes', event.target.value)}
          />
        </Field>

        <Field
          label="Load while setting up"
          htmlFor="m-setuppower"
          hint="0 to 1 — a press being threaded is not running at full load"
          error={errors.setupPowerFactor}
        >
          <NumberInput
            id="m-setuppower"
            value={form.setupPowerFactor}
            invalid={Boolean(errors.setupPowerFactor)}
            onChange={(event) => set('setupPowerFactor', event.target.value)}
          />
        </Field>
      </div>

      {/* Load × rate, so the figure can be checked against an electricity bill. */}
      {perHour > 0 ? (
        <p className="text-ink-500 mt-4 text-sm">
          Running cost <strong className="text-ink-800">{formatRs(perHour)}</strong> an hour, plus
          whoever is standing at it.
        </p>
      ) : null}
    </Modal>
  );
}
