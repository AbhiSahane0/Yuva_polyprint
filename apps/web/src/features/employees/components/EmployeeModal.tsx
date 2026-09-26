import { useEffect, useState } from 'react';
import type { Employee, EmployeeInput, Shift } from '@yuva/shared';
import { MACHINE_KIND_LABELS, SHIFT_LABELS, SHIFTS } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useCostingMasterData } from '@/features/costing/api/costing-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateEmployee, useUpdateEmployee } from '../api/employee-api';

const blank = (): EmployeeInput => ({
  name: '',
  code: '',
  roleId: null,
  roleName: '',
  shift: 'GENERAL',
  phone: '',
  joinedOn: null,
  isActive: true,
  notes: '',
});

/**
 * Adding somebody, or changing them.
 *
 * **Two fields are required and the rest are not**, which is the whole design of
 * this form. A supervisor adding an operator at the machine knows their name and
 * what they do; a form that also demands a phone number and a joining date
 * before it will save is a form they abandon — and then the name goes on being
 * typed by hand on every job card, which is what this module exists to stop.
 */
export function EmployeeModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Employee | null;
  onClose: () => void;
}) {
  const { data: master } = useCostingMasterData();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const [form, setForm] = useState<EmployeeInput>(blank);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            roleId: editing.roleId,
            /* Only meaningful without a role — with one it is the role's name,
               and showing it in the box invites editing something derived. */
            roleName: editing.roleId ? '' : editing.roleName,
            shift: editing.shift,
            phone: editing.phone,
            joinedOn: editing.joinedOn,
            isActive: editing.isActive,
            notes: editing.notes,
          }
        : blank(),
    );
  }, [open, editing]);

  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /* Retired roles are left out of a NEW choice but not taken off somebody who
     already has one — see the option below. */
  const roles = (master?.labour ?? []).filter((role) => role.isActive || role.id === form.roleId);

  const busy = create.isPending || update.isPending;

  async function submit() {
    if (!form.name.trim()) {
      toast.error('Who is this?');
      return;
    }
    if (!form.roleId && !form.roleName.trim()) {
      toast.error('Pick a costing role, or type what they do');
      return;
    }

    try {
      if (editing) await update.mutateAsync({ id: editing.id, input: form });
      else await create.mutateAsync(form);
      toast.success(editing ? `${form.name} saved` : `${form.name} added`);
      onClose();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Add somebody'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="employee-name" required>
          <Input
            id="employee-name"
            value={form.name}
            autoFocus
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <Field label="Code" htmlFor="employee-code" hint="Only if the works uses one">
          <Input
            id="employee-code"
            value={form.code}
            onChange={(event) => set('code', event.target.value)}
          />
        </Field>

        {/*
         * The role carries the wage and the process, so it is a link rather
         * than a typed word: what a printing operator costs is answered once,
         * on the Costing screen, and a rise is typed there rather than onto
         * forty records. Choosing a role is also what tells a job card to
         * offer this person for a printing stage.
         */}
        <Field
          label="Costing role"
          htmlFor="employee-role"
          hint="Carries their wage and which machine they are on"
        >
          <Select
            id="employee-role"
            value={form.roleId ?? ''}
            onChange={(event) => set('roleId', event.target.value || null)}
          >
            <option value="">Not on a costing role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.role} — {MACHINE_KIND_LABELS[role.process]}
                {role.isActive ? '' : ' (retired)'}
              </option>
            ))}
          </Select>
        </Field>

        {/* Only when there is no role to take the name from. The office and the
            warehouse are real people with no costing role behind them. */}
        {form.roleId ? null : (
          <Field
            label="What they do"
            htmlFor="employee-roleName"
            required
            hint="For the office, the warehouse — anyone no costing role describes"
          >
            <Input
              id="employee-roleName"
              value={form.roleName}
              placeholder="Production supervisor"
              onChange={(event) => set('roleName', event.target.value)}
            />
          </Field>
        )}

        <Field label="Shift" htmlFor="employee-shift">
          <Select
            id="employee-shift"
            value={form.shift}
            onChange={(event) => set('shift', event.target.value as Shift)}
          >
            {SHIFTS.map((shift) => (
              <option key={shift} value={shift}>
                {SHIFT_LABELS[shift]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Phone" htmlFor="employee-phone">
          <Input
            id="employee-phone"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
          />
        </Field>
        <Field label="Joined" htmlFor="employee-joined">
          <Input
            id="employee-joined"
            type="date"
            value={form.joinedOn ?? ''}
            onChange={(event) => set('joinedOn', event.target.value || null)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="employee-notes">
            <Input
              id="employee-notes"
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </Field>
        </div>

        {/* Leaving, which is not deleting: the job cards they ran name them, and
            a works that loses that loses the only record of who ran what. */}
        {editing ? (
          <label className="text-ink-700 flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
              className="accent-brand-600 size-4 cursor-pointer"
            />
            Still here
            <span className="text-ink-400 text-xs">
              Clear this when somebody leaves — the cards they ran still name them
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
