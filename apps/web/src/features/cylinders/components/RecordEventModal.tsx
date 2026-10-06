import { useEffect, useState } from 'react';
import {
  CYLINDER_EVENT_KINDS,
  CYLINDER_EVENT_LABELS,
  recordCylinderEventSchema,
  type Cylinder,
  type CylinderEventKind,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useRecordCylinderEvent } from '../api/cylinder-api';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Registering a set is its own action, so it is not offered here. */
const KINDS = CYLINDER_EVENT_KINDS.filter((kind) => kind !== 'ENGRAVED');

/**
 * What happened to one or more cylinders.
 *
 * **A set moves together** — mounted together, returned together — so this
 * takes a selection rather than one cylinder. Recording four separately means
 * four dialogs for one job starting, and the fourth is the one somebody
 * forgets, which is how a cylinder goes missing from the books.
 *
 * The resulting status is not asked for. It follows from the kind, because a
 * status typed separately from the history is one that can say "in store" while
 * the history says it went out and never came back.
 */
export function RecordEventModal({
  cylinders,
  open,
  onClose,
}: {
  cylinders: Cylinder[];
  open: boolean;
  onClose: () => void;
}) {
  const record = useRecordCylinderEvent();

  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<CylinderEventKind>('ALLOCATED');
  const [occurredOn, setOccurredOn] = useState(today());
  const [reference, setReference] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [repairReason, setRepairReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    // The whole set by default: that is what usually moves.
    setSelected(cylinders.filter((c) => c.status !== 'RETIRED').map((c) => c.id));
    setKind('ALLOCATED');
    setOccurredOn(today());
    setReference('');
    setToLocation('');
    setRepairReason('');
    setNotes('');
  }, [open, cylinders]);

  const explains = kind === 'DAMAGED' || kind === 'RETIRED';
  const sending = kind === 'SENT_FOR_REPAIR';

  async function onSubmit() {
    setError(null);
    const parsed = recordCylinderEventSchema.safeParse({
      cylinderIds: selected,
      kind,
      occurredOn,
      reference,
      toLocation,
      repairReason,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.');
      return;
    }

    try {
      const events = await record.mutateAsync(parsed.data);
      toast.success(
        `${CYLINDER_EVENT_LABELS[kind]} recorded for ${events.length} cylinder${events.length === 1 ? '' : 's'}`,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not record that.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record what happened"
      description="A set usually moves together, so more than one can be recorded at once."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={record.isPending}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Cylinders"
          htmlFor="cylinderPicker"
          hint={`${selected.length} of ${cylinders.length} selected`}
        >
          <div
            id="cylinderPicker"
            className="border-ink-200 flex flex-wrap gap-1.5 rounded-[var(--radius-md)] border p-2"
          >
            {cylinders.map((cylinder) => {
              const on = selected.includes(cylinder.id);
              return (
                <button
                  key={cylinder.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((current) =>
                      on ? current.filter((id) => id !== cylinder.id) : [...current, cylinder.id],
                    )
                  }
                  className={
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition ' +
                    (on
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-500 hover:bg-ink-50 bg-white')
                  }
                >
                  {cylinder.code}
                  {cylinder.colour && cylinder.colour !== 'NA' ? ` · ${cylinder.colour}` : ''}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="What happened" htmlFor="eventKind">
            <Select
              id="eventKind"
              value={kind}
              onChange={(event) => setKind(event.target.value as CylinderEventKind)}
            >
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {CYLINDER_EVENT_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When" htmlFor="occurredOn">
            <Input
              id="occurredOn"
              type="date"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>
        </div>

        {kind === 'TRANSFERRED' ? (
          <Field
            label="Move to"
            htmlFor="toLocation"
            hint="Changes where it is, not what it is doing"
          >
            <Input
              id="toLocation"
              value={toLocation}
              onChange={(event) => setToLocation(event.target.value)}
              placeholder="Cylinder Store A-2"
            />
          </Field>
        ) : (
          <Field
            label="Reference"
            htmlFor="reference"
            hint="The job or works order it is for, if there is one"
          >
            <Input
              id="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="#1024"
            />
          </Field>
        )}

        {/*
          Asked here and nowhere else, because the answer is what the engraver
          is being paid for. A cylinder that goes out with no reason comes back
          weeks later against a bill the office cannot check.
        */}
        {sending ? (
          <Field
            label="What needs putting right"
            htmlFor="repairReason"
            hint="Required — it is what the engraver is being asked to do"
          >
            <Input
              id="repairReason"
              value={repairReason}
              onChange={(event) => setRepairReason(event.target.value)}
              placeholder="Cyan worn across the gusset"
            />
          </Field>
        ) : null}

        <Field
          label={explains ? 'What happened to it' : 'Remarks'}
          htmlFor="eventNotes"
          hint={explains ? 'Required — this is what gets looked up later' : undefined}
        >
          <Input
            id="eventNotes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={explains ? 'Scored during cleaning' : 'Optional'}
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 rounded-[var(--radius-md)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
