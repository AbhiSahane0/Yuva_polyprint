import { useEffect, useState } from 'react';
import {
  formatStanding,
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_KINDS,
  type MachineCard,
  type MaintenanceKind,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useEndMaintenance, useStartMaintenance } from '../api/machine-api';

/**
 * **Putting a machine down, and bringing it back.**
 *
 * One dialog, because which of the two it is is never in doubt — a machine is
 * either down or it is not, and the card you pressed knows which.
 *
 * Going down insists on a reason. Coming back asks what was done but does not
 * insist: a breakdown that cleared itself is a real afternoon, and refusing
 * the record would leave the machine reading Down on every screen while it
 * runs.
 */
export function MaintenanceModal({
  machine,
  onClose,
}: {
  machine: MachineCard | null;
  onClose: () => void;
}) {
  const start = useStartMaintenance();
  const end = useEndMaintenance();

  const [kind, setKind] = useState<MaintenanceKind>('BREAKDOWN');
  const [reason, setReason] = useState('');
  const [workDone, setWorkDone] = useState('');

  useEffect(() => {
    if (!machine) return;
    setKind('BREAKDOWN');
    setReason('');
    setWorkDone('');
  }, [machine?.id]);

  if (!machine) return null;
  const down = machine.down;

  async function save() {
    if (!machine) return;
    try {
      if (down) {
        await end.mutateAsync({ id: down.id, input: { workDone } });
        toast.success(`${machine.name} is back`);
      } else {
        await start.mutateAsync({ machineId: machine.id, kind, reason });
        toast.success(`${machine.name} is down`);
      }
      onClose();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save that');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={down ? `Bring ${machine.name} back` : `Put ${machine.name} down`}
      description={
        down
          ? `Down ${formatStanding(down.minutes)} — ${down.reason}`
          : 'It comes off the floor’s machine list and no job can be started on it.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={down ? 'primary' : 'danger'}
            disabled={!down && reason.trim().length < 3}
            loading={start.isPending || end.isPending}
            onClick={() => void save()}
          >
            {down ? 'It is running again' : 'Put it down'}
          </Button>
        </>
      }
    >
      {down ? (
        <Field
          label="What was done"
          htmlFor="maintenance-work"
          hint="“Serviced” on its own tells the next fitter nothing"
        >
          <Textarea
            id="maintenance-work"
            rows={3}
            value={workDone}
            onChange={(event) => setWorkDone(event.target.value)}
            placeholder="Impression roller reground and the bearings replaced"
          />
        </Field>
      ) : (
        <div className="space-y-3">
          <Field
            label="Which is it"
            htmlFor="maintenance-kind"
            hint="One of these is a choice about when. The other is not."
          >
            <Select
              id="maintenance-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as MaintenanceKind)}
            >
              {MAINTENANCE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {MAINTENANCE_KIND_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Why it is down" htmlFor="maintenance-reason">
            <Textarea
              id="maintenance-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Impression roller being reground"
            />
          </Field>

          {machine.job ? (
            <p className="text-warning-800 text-sm">
              Order #{machine.job.orderNumber} is still on it. The job stays where it is — a press
              does not break down politely between stages — and the card will say the machine is
              down.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
