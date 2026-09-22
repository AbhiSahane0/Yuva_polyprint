import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { CreateCustomerFormValues } from '@yuva/shared';
import { Field, FieldSection, Input, ReadOnlyValue, Select, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Combobox } from '@/components/ui/Combobox';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils';
import { JOB_FIELD_GROUPS, SPAN_CLASS, type JobFieldDef } from '../job-fields';

interface Props {
  index: number;
  register: UseFormRegister<CreateCustomerFormValues>;
  errors: FieldErrors<CreateCustomerFormValues>;
  /** Needed so picking a suggestion writes through react-hook-form. */
  setValue: UseFormSetValue<CreateCustomerFormValues>;
  watch: UseFormWatch<CreateCustomerFormValues>;
  onRemove: () => void;
  /** Job name and code, for the collapsed summary line. */
  summary: { jobName: string; jobCode: string; jobType: string };
  /** Derived, never typed: recomputed live as the GSM and size fields change. */
  derived: { compositeGsm: string | null; pouchesPerKg: string | null };
}

export function JobCard({
  index,
  register,
  errors,
  setValue,
  watch,
  onRemove,
  summary,
  derived,
}: Props) {
  // A job with no name yet is one the user just added, so open it for them.
  const [open, setOpen] = useState(summary.jobName === '');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const jobErrors = errors.jobs?.[index];
  const hasError = Boolean(jobErrors);

  function renderField(field: JobFieldDef) {
    const id = `jobs.${index}.${field.name}`;
    const fieldError = jobErrors?.[field.name]?.message;

    return (
      <div key={field.name} className={cn('col-span-1', SPAN_CLASS[field.span ?? 3])}>
        <Field
          label={field.label}
          htmlFor={id}
          required={field.required}
          error={fieldError}
          hint={field.hint}
        >
          {field.kind === 'select' ? (
            <Select
              id={id}
              invalid={Boolean(fieldError)}
              {...register(`jobs.${index}.${field.name}`)}
            >
              {/* Empty, not 'NA': a cleared field is stored blank in the form
                  and only becomes 'NA' on submit. With value="NA" here the
                  option never matches and the select renders empty. */}
              <option value="">Not set</option>
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          ) : field.kind === 'datalist' ? (
            <Combobox
              id={id}
              options={field.options ?? []}
              registration={register(`jobs.${index}.${field.name}`)}
              value={String(watch(`jobs.${index}.${field.name}`) ?? '')}
              onPick={(picked) =>
                setValue(`jobs.${index}.${field.name}`, picked, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              invalid={Boolean(fieldError)}
              {...(field.placeholder ? { placeholder: field.placeholder } : {})}
            />
          ) : field.kind === 'textarea' ? (
            <Textarea
              id={id}
              rows={2}
              invalid={Boolean(fieldError)}
              {...register(`jobs.${index}.${field.name}`)}
            />
          ) : (
            <Input
              id={id}
              autoComplete="off"
              {...(field.kind === 'number' ? { inputMode: 'decimal' as const } : {})}
              {...(field.placeholder ? { placeholder: field.placeholder } : {})}
              invalid={Boolean(fieldError)}
              {...register(`jobs.${index}.${field.name}`)}
            />
          )}
        </Field>
      </div>
    );
  }

  return (
    <li
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border bg-white',
        hasError ? 'border-danger-500' : 'border-ink-200',
      )}
    >
      <div
        className={cn(
          'flex cursor-pointer items-center gap-3 px-4 py-3',
          open ? 'bg-brand-50/50' : 'hover:bg-ink-25',
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} job ${index + 1}`}
          className="text-ink-400 hover:text-ink-700 cursor-pointer rounded p-1"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-ink-900 truncate text-sm font-medium">
            {summary.jobName || <span className="text-ink-400">New job</span>}
          </p>
          <p className="text-ink-400 mt-0.5 truncate text-xs">
            {summary.jobCode && summary.jobCode !== 'NA' ? summary.jobCode : 'No job code'}
          </p>
        </div>

        {summary.jobType && summary.jobType !== 'NA' ? <Badge>{summary.jobType}</Badge> : null}
        {hasError ? <Badge tone="warning">Check fields</Badge> : null}

        <IconButton
          tone="danger"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove job ${index + 1}`}
          title="Remove this job from the customer"
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      {open ? (
        <div className="border-ink-200 flex flex-col gap-6 border-t px-4 py-5">
          {JOB_FIELD_GROUPS.map((group) => {
            const groupOpen = group.collapsedByDefault
              ? (openGroups[group.title] ?? false)
              : (openGroups[group.title] ?? true);

            return (
              <div key={group.title}>
                {group.collapsedByDefault ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((current) => ({ ...current, [group.title]: !groupOpen }))
                    }
                    className="text-ink-600 hover:text-ink-900 flex cursor-pointer items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
                  >
                    {groupOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    {group.title}
                  </button>
                ) : null}

                {groupOpen ? (
                  group.collapsedByDefault ? (
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-12">
                      {group.fields.map(renderField)}
                    </div>
                  ) : (
                    <FieldSection
                      title={group.title}
                      {...(group.description ? { description: group.description } : {})}
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                        {group.title === 'Basics' ? (
                          <div className="col-span-1 sm:col-span-3">
                            <Field
                              label="Job code"
                              htmlFor={`jobs.${index}.jobCode`}
                              hint="Set by the system"
                            >
                              <ReadOnlyValue
                                value={summary.jobCode}
                                placeholder="Generated on save"
                              />
                            </Field>
                          </div>
                        ) : null}

                        {group.fields.map(renderField)}

                        {group.title === 'Coating weights (GSM)' ? (
                          <div className="col-span-1 sm:col-span-4">
                            <Field
                              label="Composite (total)"
                              htmlFor={`jobs.${index}.compositeGsm`}
                              hint="Ink + PET + Met PET + Poly + Adhesive"
                            >
                              <ReadOnlyValue value={derived.compositeGsm} />
                            </Field>
                          </div>
                        ) : null}

                        {group.title === 'Machine & tooling' ? (
                          <div className="col-span-1 sm:col-span-4">
                            <Field
                              label="Pouches per kg"
                              htmlFor={`jobs.${index}.pouchesPerKg`}
                              hint="From design size and composite GSM"
                            >
                              <ReadOnlyValue value={derived.pouchesPerKg} />
                            </Field>
                          </div>
                        ) : null}
                      </div>
                    </FieldSection>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
