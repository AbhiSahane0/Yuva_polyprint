import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  computeItem,
  computeMargin,
  computeMaterialCostPerKg,
  computeTotals,
  createQuotationSchema,
  DEFAULT_TERMS,
  formatNumber,
  formatRs,
  quotationStatusSchema,
  QUOTATION_STATUS_LABELS,
  type CreateQuotationFormValues,
  type CreateQuotationInput,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, FieldSection, Input, ReadOnlyValue, Select, Textarea } from '@/components/ui/Field';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import { useCustomers } from '@/features/customers/api/customer-api';
import { useMaterials } from '@/features/rates/api/rate-api';
import { useCustomer } from '@/features/customers/api/customer-api';
import {
  useCreateQuotation,
  useNextQuotationNumber,
  useQuotation,
  useSettings,
  useUpdateQuotation,
} from '../api/quotation-api';
import { QuotationPreview } from '../components/QuotationPreview';

const BLANK_ITEM = {
  jobName: '',
  layer: 2,
  widthMm: '',
  heightMm: '',
  polyMicron: '',
  quantityKg: '',
  ratePerKg: '',
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
  transportCost: 0,
} as unknown as NonNullable<CreateQuotationFormValues['items']>[number];

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function QuotationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: existing, isPending: loadingExisting } = useQuotation(id ?? null);
  const { data: settings } = useSettings();
  const { data: nextNumber } = useNextQuotationNumber(!isEdit);
  const { data: customerList } = useCustomers({ page: 1, pageSize: 100 });

  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Pulls the chosen customer's address, phone and jobs.
  const { data: customerDetail } = useCustomer(selectedCustomerId || null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateQuotationFormValues, unknown, CreateQuotationInput>({
    resolver: zodResolver(createQuotationSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      customerName: '',
      addressLine1: '',
      addressLine2: '',
      addressLine3: '',
      mobile: '',
      email: '',
      status: 'DRAFT',
      terms: DEFAULT_TERMS,
      notes: '',
      items: [BLANK_ITEM],
    },
  });

  const itemFields = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control });

  // Costing uses the rates in force on the quotation's own date, so changing
  // the date re-costs the lines against that day's prices.
  const { data: materials } = useMaterials(String(watched.date ?? '') || undefined);

  useEffect(() => {
    if (!existing) return;
    setSelectedCustomerId(existing.customerId ?? '');
    reset({
      date: existing.date,
      customerId: existing.customerId,
      customerName: existing.customerName,
      addressLine1: existing.addressLine1,
      addressLine2: existing.addressLine2,
      addressLine3: existing.addressLine3,
      mobile: existing.mobile,
      email: existing.email,
      status: existing.status,
      terms: existing.terms,
      notes: existing.notes,
      cylinderRate: existing.cylinderRate,
      gstPercent: existing.gstPercent,
      items: existing.items.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        jobName: item.jobName,
        layer: item.layer,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        polyMicron: item.polyMicron,
        quantityKg: item.quantityKg,
        ratePerKg: item.ratePerKg,
        repeatWidth: item.repeatWidth,
        repeatHeight: item.repeatHeight,
        cylinderCount: item.cylinderCount,
        transportCost: item.transportCost,
      })) as CreateQuotationFormValues['items'],
    });
  }, [existing, reset]);

  /** Fills the header block from the customer master. */
  function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setValue('customerId', customerId || null, { shouldDirty: true });
    const chosen = customerList?.items.find((c) => c.id === customerId);
    if (!chosen) return;

    const clean = (value: string) => (value === 'NA' ? '' : value);
    setValue('customerName', chosen.companyName, { shouldDirty: true });
    setValue('addressLine1', clean(chosen.address), { shouldDirty: true });
    setValue(
      'addressLine2',
      [clean(chosen.city), clean(chosen.district)].filter(Boolean).join(', '),
      { shouldDirty: true },
    );
    setValue('addressLine3', clean(chosen.pincode), { shouldDirty: true });
    setValue('mobile', clean(chosen.mobile), { shouldDirty: true });
    setValue('email', clean(chosen.email), { shouldDirty: true });
  }

  /** Copies a saved job's dimensions onto a quotation line. */
  function applyJob(index: number, jobId: string) {
    const job = customerDetail?.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      setValue(`items.${index}.jobId`, null, { shouldDirty: true });
      return;
    }
    setValue(`items.${index}.jobId`, job.id, { shouldDirty: true });
    setValue(`items.${index}.jobName`, job.jobName, { shouldDirty: true });
    if (job.designOpenWidth)
      setValue(`items.${index}.widthMm`, Number(job.designOpenWidth), { shouldDirty: true });
    if (job.designHeight)
      setValue(`items.${index}.heightMm`, Number(job.designHeight), { shouldDirty: true });
    if (job.polyMicron)
      setValue(`items.${index}.polyMicron`, Number(job.polyMicron), { shouldDirty: true });
    if (job.layer)
      setValue(`items.${index}.layer`, Number(job.layer) === 3 ? 3 : 2, { shouldDirty: true });
  }

  const rates = {
    cylinderRate: num(watched.cylinderRate) || settings?.cylinderRate || 2.5,
    gstPercent: num(watched.gstPercent) || settings?.gstPercent || 18,
    materialAdvancePercent: settings?.materialAdvancePercent ?? 70,
    cylinderAdvancePercent: settings?.cylinderAdvancePercent ?? 100,
  };

  const films = useMemo(
    () => (materials ?? []).filter((material) => material.category === 'FILM'),
    [materials],
  );
  const materialById = useMemo(
    () => new Map((materials ?? []).map((material) => [material.id, material])),
    [materials],
  );
  const byName = useMemo(
    () => new Map((materials ?? []).map((material) => [material.name, material])),
    [materials],
  );

  /** Mirrors the server's pricing so the user sees the document total live. */
  const live = useMemo(() => {
    const rows = (watched.items ?? []).map((item) =>
      computeItem(
        {
          layer: num(item?.layer) || 2,
          widthMm: num(item?.widthMm),
          heightMm: num(item?.heightMm),
          polyMicron: num(item?.polyMicron),
          quantityKg: num(item?.quantityKg),
          ratePerKg: num(item?.ratePerKg),
          repeatWidth: num(item?.repeatWidth),
          repeatHeight: num(item?.repeatHeight),
          cylinderCount: num(item?.cylinderCount),
          transportCost: num(item?.transportCost),
        },
        rates.cylinderRate,
      ),
    );

    const totals = computeTotals(
      rows.map((row, index) => ({
        ...row,
        quantityKg: num(watched.items?.[index]?.quantityKg),
        cylinderCount: num(watched.items?.[index]?.cylinderCount),
      })),
      rates,
    );

    // Material cost, mirroring the server so the margin is visible before saving.
    const costs = (watched.items ?? []).map((item) => {
      const film = item?.filmMaterialId ? materialById.get(String(item.filmMaterialId)) : undefined;
      const result = computeMaterialCostPerKg({
        layer: num(item?.layer) || 2,
        polyMicron: num(item?.polyMicron),
        polyDensity: film?.density ?? null,
        petRate: byName.get(settings?.defaultPetMaterial ?? 'PET 12µm')?.currentRate ?? null,
        polyRate: film?.currentRate ?? null,
        inkRate: byName.get(settings?.defaultInkMaterial ?? 'Ink — Black')?.currentRate ?? null,
        adhesiveRate:
          byName.get(settings?.defaultAdhesiveMaterial ?? 'Adhesive — PU')?.currentRate ?? null,
        inkGsm: settings?.inkGsm ?? 1.8,
        adhesiveGsm: settings?.adhesiveGsm ?? 2.5,
      });
      return {
        ...result,
        marginPercent: computeMargin(num(item?.ratePerKg), result.costPerKg),
      };
    });

    return { rows, totals, costs };
  }, [watched, rates.cylinderRate, rates.gstPercent, materialById, byName, settings]);

  async function onSubmit(values: CreateQuotationInput) {
    try {
      const saved = isEdit
        ? await updateQuotation.mutateAsync({ id: id as string, input: values })
        : await createQuotation.mutateAsync(values);
      toast.success(`Quotation #${saved.number} saved`);
      setPreviewId(saved.id);
      if (!isEdit) navigate(`/quotations/${saved.id}/edit`, { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [field, message] of Object.entries(error.fields)) {
          setError(field as keyof CreateQuotationFormValues, { type: 'server', message });
        }
        toast.error(error.message);
        return;
      }
      toast.error('Could not save the quotation');
    }
  }

  if (isEdit && loadingExisting) {
    return <div className="text-ink-400 px-4 py-16 text-center text-sm">Loading quotation…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate('/quotations')}
        className="text-ink-500 hover:text-ink-900 mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to quotations
      </button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
            {isEdit ? `Edit quotation #${existing?.number}` : 'New quotation'}
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            {isEdit
              ? 'Changes are re-priced and the PDF is regenerated on save.'
              : `Will be saved as quotation #${nextNumber?.number ?? '…'}`}
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-8" noValidate>
        <FieldSection title="Customer" description="Pick a saved customer to fill this in.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <Field
                label="Choose customer"
                htmlFor="customerPicker"
                hint="Or type the details below"
              >
                <Select
                  id="customerPicker"
                  value={selectedCustomerId}
                  onChange={(event) => applyCustomer(event.target.value)}
                >
                  <option value="">— Type manually —</option>
                  {(customerList?.items ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Date" htmlFor="date" required error={errors.date?.message}>
                <Input id="date" type="date" {...register('date')} />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Status" htmlFor="status">
                <Select id="status" {...register('status')}>
                  {quotationStatusSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {QUOTATION_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="sm:col-span-6">
              <Field
                label="Customer name"
                htmlFor="customerName"
                required
                error={errors.customerName?.message}
              >
                <Input
                  id="customerName"
                  invalid={Boolean(errors.customerName)}
                  {...register('customerName')}
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Mobile" htmlFor="mobile">
                <Input id="mobile" inputMode="numeric" {...register('mobile')} />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" {...register('email')} />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field label="Address line 1" htmlFor="addressLine1">
                <Input id="addressLine1" {...register('addressLine1')} />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field label="Address line 2" htmlFor="addressLine2">
                <Input id="addressLine2" {...register('addressLine2')} />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field label="Address line 3" htmlFor="addressLine3">
                <Input id="addressLine3" {...register('addressLine3')} />
              </Field>
            </div>
          </div>
        </FieldSection>

        {/* ---- Jobs ---- */}
        <section className="border-ink-200 border-t pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
                Jobs ({itemFields.fields.length})
              </h4>
              <p className="text-ink-500 mt-0.5 text-xs">
                Enter the size and rate — pouches per kg, cylinder size and cost are calculated.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => itemFields.append(BLANK_ITEM)}
            >
              <Plus className="size-4" />
              Add job
            </Button>
          </div>

          {errors.items?.message ? (
            <p className="text-danger-600 mt-2 text-xs">{errors.items.message}</p>
          ) : null}

          <ul className="mt-4 flex flex-col gap-4">
            {itemFields.fields.map((field, index) => {
              const computed = live.rows[index];
              const cost = live.costs[index];
              const itemErrors = errors.items?.[index];
              return (
                <li
                  key={field.id}
                  className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-ink-500 text-xs font-semibold tracking-wider uppercase">
                      Job {index + 1}
                    </span>
                    {itemFields.fields.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => itemFields.remove(index)}
                        aria-label={`Remove job ${index + 1}`}
                        className="text-ink-400 hover:bg-danger-50 hover:text-danger-600 cursor-pointer rounded-[var(--radius-md)] p-2"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                    {customerDetail && customerDetail.jobs.length > 0 ? (
                      <div className="sm:col-span-4">
                        <Field label="Copy from saved job" htmlFor={`items.${index}.jobPicker`}>
                          <Select
                            id={`items.${index}.jobPicker`}
                            onChange={(event) => applyJob(index, event.target.value)}
                            defaultValue=""
                          >
                            <option value="">— None —</option>
                            {customerDetail.jobs.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.jobName}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    ) : null}

                    <div
                      className={customerDetail?.jobs.length ? 'sm:col-span-5' : 'sm:col-span-6'}
                    >
                      <Field
                        label="Job name"
                        htmlFor={`items.${index}.jobName`}
                        required
                        error={itemErrors?.jobName?.message}
                      >
                        <Input
                          id={`items.${index}.jobName`}
                          placeholder="e.g. 5 Kg Paneer Bag"
                          invalid={Boolean(itemErrors?.jobName)}
                          {...register(`items.${index}.jobName`)}
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
                      <Field label="Layers" htmlFor={`items.${index}.layer`}>
                        <Select id={`items.${index}.layer`} {...register(`items.${index}.layer`)}>
                          <option value={2}>2 Layer</option>
                          <option value={3}>3 Layer</option>
                        </Select>
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
                      <Field
                        label="Width"
                        htmlFor={`items.${index}.widthMm`}
                        hint="mm"
                        required
                        error={itemErrors?.widthMm?.message}
                      >
                        <Input
                          id={`items.${index}.widthMm`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.widthMm)}
                          {...register(`items.${index}.widthMm`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Height"
                        htmlFor={`items.${index}.heightMm`}
                        hint="mm"
                        required
                        error={itemErrors?.heightMm?.message}
                      >
                        <Input
                          id={`items.${index}.heightMm`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.heightMm)}
                          {...register(`items.${index}.heightMm`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Poly micron"
                        htmlFor={`items.${index}.polyMicron`}
                        required
                        error={itemErrors?.polyMicron?.message}
                      >
                        <Input
                          id={`items.${index}.polyMicron`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.polyMicron)}
                          {...register(`items.${index}.polyMicron`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Total micron"
                        htmlFor={`items.${index}.micron`}
                        hint="Calculated"
                      >
                        <ReadOnlyValue value={computed ? formatNumber(computed.micron) : null} />
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
                      <Field
                        label="Quantity"
                        htmlFor={`items.${index}.quantityKg`}
                        hint="kg"
                        required
                        error={itemErrors?.quantityKg?.message}
                      >
                        <Input
                          id={`items.${index}.quantityKg`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.quantityKg)}
                          {...register(`items.${index}.quantityKg`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Rate per kg"
                        htmlFor={`items.${index}.ratePerKg`}
                        required
                        error={itemErrors?.ratePerKg?.message}
                      >
                        <Input
                          id={`items.${index}.ratePerKg`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.ratePerKg)}
                          {...register(`items.${index}.ratePerKg`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Film"
                        htmlFor={`items.${index}.filmMaterialId`}
                        hint="Sets the material cost"
                      >
                        <Select
                          id={`items.${index}.filmMaterialId`}
                          {...register(`items.${index}.filmMaterialId`)}
                        >
                          <option value="">— Not costed —</option>
                          {films.map((film) => (
                            <option key={film.id} value={film.id}>
                              {film.name}
                              {film.currentRate === null
                                ? ' (no rate)'
                                : ` — ${formatRs(film.currentRate)}`}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Pouches per kg"
                        htmlFor={`items.${index}.ppk`}
                        hint="Calculated"
                      >
                        <ReadOnlyValue
                          value={computed ? formatNumber(computed.pouchesPerKg, 2) : null}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label="Total pouches" htmlFor={`items.${index}.tp`} hint="Calculated">
                        <ReadOnlyValue
                          value={computed ? formatNumber(computed.totalPouches) : null}
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
                      <Field
                        label="Repeat width"
                        htmlFor={`items.${index}.repeatWidth`}
                        required
                        error={itemErrors?.repeatWidth?.message}
                      >
                        <Input
                          id={`items.${index}.repeatWidth`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.repeatWidth)}
                          {...register(`items.${index}.repeatWidth`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Repeat height"
                        htmlFor={`items.${index}.repeatHeight`}
                        required
                        error={itemErrors?.repeatHeight?.message}
                      >
                        <Input
                          id={`items.${index}.repeatHeight`}
                          inputMode="decimal"
                          invalid={Boolean(itemErrors?.repeatHeight)}
                          {...register(`items.${index}.repeatHeight`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label="No. of cylinders" htmlFor={`items.${index}.cylinderCount`}>
                        <Input
                          id={`items.${index}.cylinderCount`}
                          inputMode="numeric"
                          {...register(`items.${index}.cylinderCount`)}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Transport cost"
                        htmlFor={`items.${index}.transportCost`}
                        hint="Optional"
                      >
                        <Input
                          id={`items.${index}.transportCost`}
                          inputMode="decimal"
                          {...register(`items.${index}.transportCost`)}
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
                      <Field label="Cylinder width" htmlFor={`items.${index}.cw`} hint="Calculated">
                        <ReadOnlyValue
                          value={computed ? formatNumber(computed.cylinderWidth) : null}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Cylinder circumference"
                        htmlFor={`items.${index}.cc`}
                        hint="Calculated"
                      >
                        <ReadOnlyValue
                          value={computed ? formatNumber(computed.cylinderCircumference) : null}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Cost per cylinder"
                        htmlFor={`items.${index}.cpc`}
                        hint="Calculated"
                      >
                        <ReadOnlyValue
                          value={computed ? formatRs(computed.costPerCylinder) : null}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field
                        label="Total cylinder cost"
                        htmlFor={`items.${index}.tcc`}
                        hint="Calculated"
                      >
                        <ReadOnlyValue
                          value={computed ? formatRs(computed.totalCylinderCost) : null}
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-12">
                      <div className="bg-brand-50 text-brand-700 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium">
                        <span>Printing total</span>
                        <span className="tabular-nums">
                          {computed ? formatRs(computed.totalAmount) : formatRs(0)}
                        </span>
                      </div>

                      {/* Costed from the day's rates, so the margin is visible
                          before the quotation goes out rather than after. */}
                      {cost ? (
                        <div className="border-ink-200 text-ink-600 mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-[var(--radius-md)] border border-dashed px-4 py-2.5 text-sm">
                          {cost.costPerKg === null ? (
                            <span className="text-ink-400">
                              Choose a film to see the material cost and margin
                            </span>
                          ) : (
                            <>
                              <span>
                                Material cost{' '}
                                <span className="text-ink-900 font-medium tabular-nums">
                                  {formatRs(cost.costPerKg, 2)}/kg
                                </span>
                                <span className="text-ink-400 ml-1 text-xs">
                                  ({formatNumber(cost.compositeGsm, 1)} GSM)
                                </span>
                              </span>
                              <span
                                className={
                                  cost.marginPercent !== null && cost.marginPercent < 10
                                    ? 'text-danger-600 font-semibold'
                                    : 'text-success-600 font-semibold'
                                }
                              >
                                Margin{' '}
                                {cost.marginPercent === null
                                  ? '—'
                                  : `${formatNumber(cost.marginPercent, 1)}%`}
                              </span>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- Totals ---- */}
        <section className="border-ink-200 border-t pt-6">
          <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">Totals</h4>
          <dl className="border-ink-200 mt-3 divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-lg)] border bg-white text-sm">
            <Row label={`Packaging material`} value={formatRs(live.totals.materialSubtotal)} />
            <Row
              label={`Material + GST ${formatNumber(rates.gstPercent)}%`}
              value={formatRs(live.totals.materialWithGst)}
            />
            <Row label="Cylinder" value={formatRs(live.totals.cylinderSubtotal)} />
            <Row
              label={`Cylinder + GST ${formatNumber(rates.gstPercent)}%`}
              value={formatRs(live.totals.cylinderWithGst)}
            />
            <Row label="Grand total" value={formatRs(live.totals.grandWithGst)} strong />
            <Row label="Advance payable" value={formatRs(live.totals.totalAdvance)} strong accent />
          </dl>
        </section>

        <FieldSection title="Terms & notes">
          <div className="grid grid-cols-1 gap-4">
            <Field label="Note (optional)" htmlFor="notes">
              <Textarea id="notes" rows={2} {...register('notes')} />
            </Field>
          </div>
        </FieldSection>

        <div className="border-ink-200 sticky bottom-0 flex justify-end gap-2 border-t bg-white/95 py-4 backdrop-blur">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isEdit ? 'Save & preview' : 'Create & preview'}
          </Button>
        </div>
      </form>

      <QuotationPreview id={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className={strong ? 'text-ink-900 font-semibold' : 'text-ink-600'}>{label}</dt>
      <dd
        className={[
          'tabular-nums',
          strong ? 'font-bold' : '',
          accent ? 'text-brand-700' : 'text-ink-900',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
