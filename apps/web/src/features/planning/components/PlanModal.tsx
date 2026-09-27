import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { formatNumber, planOutlook, type PlanningRow, type PlanOrderInput } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useCostingMasterData } from '@/features/costing/api/costing-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { usePlanOrder } from '../api/planning-api';

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * **Booking a job onto a day and a machine.**
 *
 * Two fields, and they are independent on purpose: the works often knows the
 * week before it knows the press, and sometimes gives a job to a press before
 * the day is settled. Insisting on both would mean the plan stays in somebody's
 * head until both are known, which is exactly when it is worth writing down.
 *
 * What it does insist on is showing the consequence. The finish date is worked
 * out as the date is typed, and a plan that cannot make the customer's date
 * says so **before** it is saved — a planning screen that only tells you
 * afterwards is a planning screen that has already let it happen.
 */
export function PlanModal({ row, onClose }: { row: PlanningRow | null; onClose: () => void }) {
  const plan = usePlanOrder();
  const { data: master } = useCostingMasterData();

  const [start, setStart] = useState('');
  const [machineId, setMachineId] = useState('');
  const [note, setNote] = useState('');

  /* Filled in from the row each time a different order is opened. */
  useEffect(() => {
    if (!row) return;
    setStart(row.plannedStart ?? '');
    setMachineId(row.plannedMachineId ?? '');
    setNote(row.planNote);
  }, [row]);

  if (!row) return null;

  /* The same function the server uses, so the warning here and the flag on the
     board can never say different things about the same plan. */
  const outlook = planOutlook({
    plannedStart: start || null,
    days: row.estimateDays,
    dueDate: row.dueDate,
  });

  const machines = (master?.machines ?? []).filter((machine) => machine.isActive);
  const clearing = !start && !machineId;

  async function save() {
    if (!row) return;
    const input: PlanOrderInput = {
      plannedStart: start || null,
      plannedMachineId: machineId || null,
      planNote: note,
    };
    try {
      await plan.mutateAsync({ orderId: row.orderId, input });
      toast.success(clearing ? 'Plan cleared' : `Order #${row.orderNumber} booked in`);
      onClose();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save the plan');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Plan order #${row.orderNumber}`}
      description={`${row.jobName} · ${formatNumber(row.quantityKg, 0)} kg for ${row.customerName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={plan.isPending} onClick={() => void save()}>
            <CalendarClock className="size-4" />
            {clearing ? 'Clear the plan' : 'Book it in'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Planned start"
            htmlFor="plan-start"
            hint={`About ${row.estimateDays} days on this quantity`}
          >
            <Input
              id="plan-start"
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field
            label="Machine"
            htmlFor="plan-machine"
            hint="The one it starts on — the press, for a printed job"
          >
            <Select
              id="plan-machine"
              value={machineId}
              onChange={(event) => setMachineId(event.target.value)}
            >
              <option value="">Not decided</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* The consequence, while it can still be changed. */}
        {outlook.finish ? (
          <p className={outlook.landsLate ? 'text-danger-800 text-sm' : 'text-ink-600 text-sm'}>
            {outlook.landsLate ? (
              <>
                <AlertTriangle className="mr-1 inline size-4 align-text-bottom" />
                Comes off about {formatDate(outlook.finish)} — {outlook.daysLate} day
                {outlook.daysLate === 1 ? '' : 's'} after it was promised
                {row.dueDate ? ` (${formatDate(row.dueDate)})` : ''}. It can still be booked; the
                board will keep saying so.
              </>
            ) : (
              <>
                Comes off about {formatDate(outlook.finish)}
                {row.dueDate ? `, promised ${formatDate(row.dueDate)}` : ''}.
              </>
            )}
          </p>
        ) : null}

        {row.shortOf.length > 0 ? (
          <p className="text-warning-800 text-sm">
            Short of {row.shortOf.join(', ')}. Booking it is allowed — a date with the film arriving
            before it is a real plan — but the job card will refuse to start until the film is in.
          </p>
        ) : null}

        <Field label="Note" htmlFor="plan-note" hint="Why it sits where it does in the queue">
          <Textarea
            id="plan-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Customer collecting Friday — must be off the press by Thursday"
          />
        </Field>

        {row.plannedBy ? (
          <p className="text-ink-400 text-xs">
            Booked by {row.plannedBy}
            {row.plannedAt ? ` · ${new Date(row.plannedAt).toLocaleString('en-IN')}` : ''}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
