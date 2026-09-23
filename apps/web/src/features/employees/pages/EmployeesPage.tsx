import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, UserPlus } from 'lucide-react';
import {
  EMPLOYEE_ACTIVITY_LABELS,
  MACHINE_KIND_LABELS,
  MACHINE_KINDS,
  SHIFT_LABELS,
  SHIFTS,
  type Employee,
  type EmployeeActivity,
  type EmployeeOnFloor,
  type MachineKind,
  type Shift,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useDeleteEmployee, useEmployees } from '../api/employee-api';
import { EmployeeModal } from '../components/EmployeeModal';

const ACTIVITY_TONE: Record<EmployeeActivity, 'brand' | 'neutral' | 'success'> = {
  WORKING: 'brand',
  AVAILABLE: 'neutral',
  LEFT: 'neutral',
};

/**
 * **Who is here, and what they are on right now.**
 *
 * Every live column — working, which machine, which card — is derived from the
 * job cards, not stored. If a stage is running with somebody's name on it they
 * are working, and nothing else can make it true. A status somebody has to
 * remember to change is wrong most of the time, which is why this system works
 * out a card's progress and an order's lateness the same way.
 *
 * Deliberately not a personnel system: no attendance, no leave calendar, no
 * payroll. The wage is not even here — it lives on the costing role a person
 * points at, so a rise is typed once rather than onto forty records.
 */
export default function EmployeesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'jobs');

  const [search, setSearch] = useState('');
  const [process, setProcess] = useState('');
  const [shift, setShift] = useState('');
  const [includeLeft, setIncludeLeft] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EmployeeOnFloor | null>(null);

  const debounced = useDebounce(search, 250);
  const params = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(process ? { process: process as MachineKind } : {}),
      ...(shift ? { shift: shift as Shift } : {}),
      ...(includeLeft ? { includeLeft: true } : {}),
    }),
    [debounced, process, shift, includeLeft],
  );

  const { data, isLoading } = useEmployees(params);
  const remove = useDeleteEmployee();

  const people = data?.items ?? [];
  const totals = data?.totals;

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not remove');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Employees</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            Who is here, and what they are on right now.
          </p>
        </div>
        {canEdit ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" />
            Add somebody
          </Button>
        ) : null}
      </header>

      {/* Four figures, over everything the filters matched rather than a page —
          a count that changes when you click a filter is not a count. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['On the books', totals?.onBooks],
          ['Working now', totals?.working],
          ['Available', totals?.available],
          ['On a machine', totals?.operators],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]"
          >
            <div className="text-ink-900 text-lg font-bold tabular-nums">{value ?? '—'}</div>
            <div className="text-ink-500 mt-0.5 text-xs">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, code or role…"
            className="pl-9"
            aria-label="Search employees"
          />
        </div>
        <Select
          value={process}
          onChange={(event) => setProcess(event.target.value)}
          aria-label="Filter by process"
          className="w-auto"
        >
          <option value="">Every process</option>
          {MACHINE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {MACHINE_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
        <Select
          value={shift}
          onChange={(event) => setShift(event.target.value)}
          aria-label="Filter by shift"
          className="w-auto"
        >
          <option value="">Every shift</option>
          {SHIFTS.map((value) => (
            <option key={value} value={value}>
              {SHIFT_LABELS[value]}
            </option>
          ))}
        </Select>
        <label className="text-ink-600 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeLeft}
            onChange={(event) => setIncludeLeft(event.target.checked)}
            className="accent-brand-600 size-4 cursor-pointer"
          />
          Show people who have left
        </label>
      </div>

      {isLoading ? (
        <LoadingState label="Loading the works…" />
      ) : people.length === 0 ? (
        <EmptyState
          title="Nobody here yet"
          description="Add the operators and the floor can pick them on a job card instead of typing a name."
          action={
            canEdit ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <UserPlus className="size-4" />
                Add somebody
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Shift</th>
                  <th className="px-4 py-3 font-semibold">On</th>
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canEdit ? <th className="w-12 px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr
                    key={person.id}
                    className={cn(
                      'border-ink-100 hover:bg-ink-25 border-b',
                      canEdit && 'cursor-pointer',
                      !person.isActive && 'opacity-60',
                    )}
                    onClick={canEdit ? () => setEditing(person) : undefined}
                  >
                    <td className="text-ink-900 px-4 py-3 font-medium">
                      {person.name}
                      {person.code ? (
                        <span className="text-ink-400 ml-2 text-xs font-normal">{person.code}</span>
                      ) : null}
                    </td>
                    <td className="text-ink-700 px-4 py-3">
                      {person.roleName}
                      {person.process ? (
                        <span className="text-ink-400 ml-1.5 text-xs">
                          {MACHINE_KIND_LABELS[person.process]}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-xs">{SHIFT_LABELS[person.shift]}</td>
                    {/* The live pair. Both come from the one running stage that
                        names this person; neither is stored anywhere. */}
                    <td className="text-ink-700 px-4 py-3 text-xs">
                      {person.currentMachine || <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {person.currentCardId ? (
                        <button
                          type="button"
                          className="text-brand-700 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/production/${person.currentCardId}`);
                          }}
                        >
                          #{person.currentCardNumber} · {person.currentJobName}
                        </button>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ACTIVITY_TONE[person.activity]}>
                        {EMPLOYEE_ACTIVITY_LABELS[person.activity]}
                      </Badge>
                    </td>
                    {canEdit ? (
                      <td className="px-2 py-3 text-right">
                        <IconButton
                          tone="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleting(person);
                          }}
                          aria-label={`Remove ${person.name}`}
                          title="Remove — refused once they have run a job"
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same rows as cards. The floor reads this on a phone. */}
          <ul className="divide-ink-100 divide-y md:hidden">
            {people.map((person) => (
              <li key={person.id} className="flex items-center">
                <button
                  type="button"
                  onClick={canEdit ? () => setEditing(person) : undefined}
                  className={cn(
                    'min-w-0 flex-1 px-4 py-3.5 text-left',
                    canEdit && 'cursor-pointer',
                    !person.isActive && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-ink-900 text-sm font-medium">{person.name}</p>
                    <Badge tone={ACTIVITY_TONE[person.activity]}>
                      {EMPLOYEE_ACTIVITY_LABELS[person.activity]}
                    </Badge>
                  </div>
                  <p className="text-ink-500 mt-1 text-xs">
                    {person.roleName} · {SHIFT_LABELS[person.shift]}
                    {person.currentMachine ? (
                      <span className="text-brand-700">
                        {' · '}
                        {person.currentMachine} · #{person.currentCardNumber}
                      </span>
                    ) : null}
                  </p>
                </button>
                {canEdit ? (
                  <IconButton
                    tone="danger"
                    onClick={() => setDeleting(person)}
                    aria-label={`Remove ${person.name}`}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <EmployeeModal open={adding} editing={null} onClose={() => setAdding(false)} />
      <EmployeeModal open={Boolean(editing)} editing={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.name ?? ''}?`}
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      >
        This is for a row typed by mistake. Somebody who has actually run a job cannot be removed —
        mark them as having left instead, and the cards they ran go on naming them.
      </ConfirmDialog>
    </div>
  );
}
