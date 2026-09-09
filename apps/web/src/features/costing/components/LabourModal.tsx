import { useEffect, useState } from 'react';
import {
  MACHINE_KINDS,
  MACHINE_KIND_LABELS,
  formatRs,
  labourSchema,
  salaryPerMinute,
  type Labour,
  type MachineKind,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { useSettings } from '@/features/quotations/api/quotation-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useSaveLabour } from '../api/costing-api';

const BLANK = { role: '', process: 'PRINTING' as MachineKind, monthlySalary: '' };

export function LabourModal({
  open,
  labour,
  onClose,
}: {
  open: boolean;
  labour: Labour | null;
  onClose: () => void;
}) {
  const save = useSaveLabour();
  const { data: settings } = useSettings();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      labour
        ? {
            role: labour.role,
            process: labour.process,
            monthlySalary: String(labour.monthlySalary),
          }
        : BLANK,
    );
  }, [open, labour]);

  const set = (key: keyof typeof BLANK, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    const parsed = labourSchema.safeParse({ ...form, isActive: labour?.isActive ?? true });
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
      await save.mutateAsync({ ...parsed.data, ...(labour ? { id: labour.id } : {}) });
      toast.success(labour ? `${parsed.data.role} updated` : `${parsed.data.role} added`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError || error instanceof Error
          ? error.message
          : 'Could not save',
      );
    }
  }

  const perMinute = settings
    ? salaryPerMinute(
        Number(form.monthlySalary) || 0,
        settings.workingDaysPerMonth,
        settings.hoursPerDay,
      )
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={labour ? 'Edit role' : 'Add a role'}
      description="Paid for the minutes their machine is running and being set."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            {labour ? 'Save' : 'Add role'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" htmlFor="l-role" error={errors.role}>
          <Input
            id="l-role"
            value={form.role}
            invalid={Boolean(errors.role)}
            onChange={(event) => set('role', event.target.value)}
          />
        </Field>

        <Field label="Works on" htmlFor="l-process" hint="Whose minutes they are paid for">
          <Select
            id="l-process"
            value={form.process}
            onChange={(event) => set('process', event.target.value)}
          >
            {MACHINE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MACHINE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Monthly salary" htmlFor="l-salary" error={errors.monthlySalary}>
          <NumberInput
            id="l-salary"
            value={form.monthlySalary}
            invalid={Boolean(errors.monthlySalary)}
            onChange={(event) => set('monthlySalary', event.target.value)}
          />
        </Field>
      </div>

      {/* The figure the costing actually uses; a monthly salary checks nothing. */}
      {perMinute > 0 && settings ? (
        <p className="text-ink-500 mt-4 text-sm">
          <strong className="text-ink-800">{formatRs(perMinute, 2)}</strong> a minute, over{' '}
          {settings.workingDaysPerMonth} days of {settings.hoursPerDay} hours.
        </p>
      ) : null}
    </Modal>
  );
}
