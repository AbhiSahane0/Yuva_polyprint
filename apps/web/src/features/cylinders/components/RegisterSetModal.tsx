import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CYLINDER_OWNERSHIPS,
  formatRs,
  OWNERSHIP_LABELS,
  registerCylindersSchema,
  type CylinderOwnership,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useRegisterCylinders, useUnregisteredDesigns } from '../api/cylinder-api';

/** The separations a gravure set usually carries, in station order. */
const DEFAULT_COLOURS = [
  'Cyan',
  'Magenta',
  'Yellow',
  'Black',
  'White',
  'Spot 1',
  'Spot 2',
  'Spot 3',
];

interface Row {
  code: string;
  colour: string;
  cost: string;
}

/**
 * Registering a set against a design.
 *
 * It picks an existing **design**, which is a job — customer, product and the
 * expected cylinder count already live there, so asking for them again would
 * create a second copy free to disagree with the first. The shared fields
 * (ownership, store, engraver, geometry) are asked once and applied to every
 * cylinder, because a set is cut together and stored together; the per-cylinder
 * rows carry only what genuinely differs.
 */
export function RegisterSetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: designs } = useUnregisteredDesigns(open);
  const register = useRegisterCylinders();

  const [jobId, setJobId] = useState('');
  /* What is typed in the design box, which is not the same as what is chosen. */
  const [designQuery, setDesignQuery] = useState('');
  const [ownership, setOwnership] = useState<CylinderOwnership>('YUVA_OWNED');
  const [location, setLocation] = useState('Cylinder Store A-1');
  const [engraver, setEngraver] = useState('');
  const [engravedOn, setEngravedOn] = useState('');
  const [diameter, setDiameter] = useState('');
  const [circumference, setCircumference] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const design = useMemo(
    () => (designs ?? []).find((row) => row.jobId === jobId) ?? null,
    [designs, jobId],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setJobId('');
    setDesignQuery('');
    setOwnership('YUVA_OWNED');
    setLocation('Cylinder Store A-1');
    setEngraver('');
    setEngravedOn('');
    setDiameter('');
    setCircumference('');
    setRows([]);
  }, [open]);

  /*
   * Choosing a design seeds one row per cylinder the job says it needs, with
   * the usual separations. The count is already recorded on 382 jobs — asking
   * for it again would be asking a question the system can answer.
   */
  /*
   * Keyed by job id, not by what the row reads. Two of this works' designs
   * share a name *and* a job code — the source spreadsheet reuses codes — so a
   * list keyed on its own text would quietly register a set against the wrong
   * one. The customer and the code are the second line, which is what tells a
   * pair of same-named designs apart on screen.
   */
  const designOptions: ComboboxOption[] = (designs ?? []).map((row) => ({
    key: row.jobId,
    label: row.jobName,
    description: [row.customerName ?? 'No customer', row.jobCode]
      .filter((part) => part && part !== 'NA')
      .join(' · '),
  }));

  function chooseDesign(nextJobId: string) {
    setJobId(nextJobId);
    const chosen = (designs ?? []).find((row) => row.jobId === nextJobId);
    const count = Math.min(Math.max(chosen?.expectedCylinders ?? 4, 1), 12);
    setRows(
      Array.from({ length: count }, (_, index) => ({
        code: '',
        colour: DEFAULT_COLOURS[index] ?? '',
        cost: '',
      })),
    );
    if (chosen?.expectedCylinders) setDiameter('');
  }

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const total = rows.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);

  async function onSubmit() {
    setError(null);
    const parsed = registerCylindersSchema.safeParse({
      jobId,
      cylinders: rows.map((row, index) => ({
        code: row.code,
        colour: row.colour,
        position: index + 1,
        ownership,
        location,
        diameterMm: diameter,
        circumferenceMm: circumference,
        cost: row.cost,
        engraver,
        engravedOn,
        notes: '',
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the set and try again.');
      return;
    }

    try {
      const result = await register.mutateAsync(parsed.data);
      toast.success(`${result.cylinderCount} cylinders registered for ${result.jobName}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not register the set.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a cylinder set"
      description="The design already knows the customer and the product — this records the cylinders themselves."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={register.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={register.isPending}>
            Register
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Design"
          htmlFor="jobId"
          hint={
            design
              ? `${design.customerName ?? 'No customer'} · the job expects ${design.expectedCylinders ?? '?'} cylinders`
              : designQuery.trim() !== ''
                ? 'Pick one from the list — a set has to belong to a design already on record'
                : 'Type to search designs whose job records a cylinder count but has no set yet'
          }
        >
          <Combobox
            id="jobId"
            options={designOptions}
            value={designQuery}
            placeholder="Type a design, customer or job code…"
            invalid={Boolean(error) && jobId === ''}
            onChange={(next) => {
              setDesignQuery(next);
              /*
               * Typing after a choice clears it. The alternative is a box
               * reading one design while the form holds another, which is the
               * kind of disagreement nobody notices until the set is
               * registered against the wrong job.
               */
              if (jobId !== '') chooseDesign('');
            }}
            onPick={(label, key) => {
              setDesignQuery(label);
              chooseDesign(key);
            }}
            /* The list is small and already filtered to designs without a set. */
            filterLocally
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ownership" htmlFor="ownership" hint="Who paid for the set">
            <Select
              id="ownership"
              value={ownership}
              onChange={(event) => setOwnership(event.target.value as CylinderOwnership)}
            >
              {CYLINDER_OWNERSHIPS.map((value) => (
                <option key={value} value={value}>
                  {OWNERSHIP_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stored in" htmlFor="location">
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Cylinder Store A-1"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Engraver" htmlFor="engraver" hint="Who cut them">
            <Input
              id="engraver"
              value={engraver}
              onChange={(event) => setEngraver(event.target.value)}
              placeholder="Shilp Gravures"
            />
          </Field>
          <Field label="Engraved on" htmlFor="engravedOn">
            <Input
              id="engravedOn"
              type="date"
              value={engravedOn}
              onChange={(event) => setEngravedOn(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Diameter (mm)" htmlFor="diameter">
            <NumberInput
              id="diameter"
              value={diameter}
              onChange={(event) => setDiameter(event.target.value)}
              placeholder="250"
            />
          </Field>
          <Field label="Repeat / circumference (mm)" htmlFor="circumference">
            <NumberInput
              id="circumference"
              value={circumference}
              onChange={(event) => setCircumference(event.target.value)}
              placeholder="420"
            />
          </Field>
        </div>

        {rows.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                Cylinders
              </span>
              {rows.length < 12 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      { code: '', colour: DEFAULT_COLOURS[current.length] ?? '', cost: '' },
                    ])
                  }
                  className="border-ink-200 text-ink-600 hover:bg-ink-50 cursor-pointer rounded-[var(--radius-sm)] border bg-white px-2.5 py-1 text-xs font-medium"
                >
                  <Plus className="mr-1 inline size-3" />
                  Add one
                </button>
              ) : null}
            </div>

            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-5">
                  <Field label={`Number ${index + 1}`} htmlFor={`cyl-${index}-code`}>
                    <Input
                      id={`cyl-${index}-code`}
                      value={row.code}
                      onChange={(event) => setRow(index, { code: event.target.value })}
                      placeholder="CYL-3301"
                    />
                  </Field>
                </div>
                <div className="col-span-4">
                  <Field label="Colour" htmlFor={`cyl-${index}-colour`}>
                    <Input
                      id={`cyl-${index}-colour`}
                      value={row.colour}
                      onChange={(event) => setRow(index, { colour: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Cost" htmlFor={`cyl-${index}-cost`}>
                    <NumberInput
                      id={`cyl-${index}-cost`}
                      value={row.cost}
                      onChange={(event) => setRow(index, { cost: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-1">
                  <span aria-hidden className="block text-sm font-medium">
                    &nbsp;
                  </span>
                  {rows.length > 1 ? (
                    <IconButton
                      tone="danger"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove cylinder ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            ))}

            {total > 0 ? (
              <p className="text-ink-600 text-right text-sm">
                Set cost <strong className="text-ink-900">{formatRs(total)}</strong>
              </p>
            ) : null}
          </div>
        ) : null}

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
