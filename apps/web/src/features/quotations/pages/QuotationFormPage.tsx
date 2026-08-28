import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  type CreateQuotationFormValues,
  type CreateQuotationInput,
  DEFAULT_TERMS,
  JOB_KINDS,
  JOB_KIND_LABELS,
  type JobKind,
  POUCH_TYPES,
  POUCH_TYPE_LABELS,
  type PouchType,
  QUOTATION_STATUS_LABELS,
  computeItem,
  computeMargin,
  computeMaterialCostPerKg,
  computeTotals,
  createQuotationSchema,
  formatNumber,
  formatRs,
  pricingBasisFor,
  quotationStatusSchema,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { Field, FieldSection, Input, ReadOnlyValue, Select, Textarea } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';
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
  // Every imported line is a pouch; a roll is the newer, rarer case.
  jobKind: 'POUCH',
  pouchType: '',
  pouchTypeNote: '',
  layer: 2,
  widthMm: '',
  heightMm: '',
  polyMicron: '',
  quantityKg: '',
  ratePerKg: '',
  quantityPouches: '',
  ratePerPouch: '',
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
  /*
   * Existing means pick a company we already hold; new means type one in and
   * add it to the master as the quotation saves. Editing always starts as
   * existing — the company was already chosen when the quotation was raised.
   */
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');

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
      gstNumber: existing.gstNumber,
      status: existing.status,
      saveAsCustomer: false,
      terms: existing.terms,
      notes: existing.notes,
      cylinderRate: existing.cylinderRate,
      gstPercent: existing.gstPercent,
      items: existing.items.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        jobName: item.jobName,
        jobKind: item.jobKind,
        // The select works in strings; null is "nothing chosen".
        pouchType: item.pouchType ?? '',
        pouchTypeNote: item.pouchTypeNote,
        layer: item.layer,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        polyMicron: item.polyMicron,
        quantityKg: item.quantityKg,
        ratePerKg: item.ratePerKg,
        quantityPouches: item.quantityPouches,
        ratePerPouch: item.ratePerPouch,
        repeatWidth: item.repeatWidth,
        repeatHeight: item.repeatHeight,
        cylinderCount: item.cylinderCount,
        transportCost: item.transportCost,
      })) as CreateQuotationFormValues['items'],
    });
  }, [existing, reset]);

  /** Fills the header block from the customer master. */
  const customers = customerList?.items ?? [];
  const customerNames = customers.map((customer) => customer.companyName);

  /** The combobox deals in names; this maps one back to its record. */
  function applyCustomerByName(companyName: string) {
    const chosen = customers.find(
      (customer) => customer.companyName.toLowerCase() === companyName.trim().toLowerCase(),
    );
    if (chosen) applyCustomer(chosen.id);
  }

  /**
   * Switches between picking a saved company and typing a new one.
   *
   * Changing mode clears the block. Leaving a half-filled form behind is how a
   * new company inherits the previous one's GST number.
   */
  function changeCustomerMode(mode: 'existing' | 'new') {
    setCustomerMode(mode);
    setSelectedCustomerId('');
    setValue('customerId', null, { shouldDirty: true });
    setValue('saveAsCustomer', mode === 'new', { shouldDirty: true });
    for (const field of [
      'customerName',
      'mobile',
      'email',
      'gstNumber',
      'addressLine1',
      'addressLine2',
      'addressLine3',
    ] as const) {
      setValue(field, '', { shouldDirty: true });
    }
  }

  function applyCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setValue('customerId', customerId || null, { shouldDirty: true });
    const chosen = customerList?.items.find((c) => c.id === customerId);
    if (!chosen) return;

    const clean = (value: string) => (value === 'NA' ? '' : value);
    setValue('customerName', chosen.companyName, { shouldDirty: true });
    setValue('gstNumber', clean(chosen.gstNumber), { shouldDirty: true });
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
          pricingBasis: pricingBasisFor(
            (item?.jobKind as JobKind) ?? 'POUCH',
            (item?.pouchType as PouchType) || null,
          ),
          quantityPouches: num(item?.quantityPouches),
          ratePerPouch: num(item?.ratePerPouch),
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
    const costs = (watched.items ?? []).map((item, index) => {
      const film = item?.filmMaterialId ? materialById.get(String(item.filmMaterialId)) : undefined;
      const result = computeMaterialCostPerKg({
        layer: num(item?.layer) || 2,
        polyMicron: num(item?.polyMicron),
        polyDensity: film?.density ?? null,
        petRate: byName.get(settings?.defaultPetMaterial ?? 'PET 12µm')?.currentRate ?? null,
        metpetRate:
          byName.get(settings?.defaultMetpetMaterial ?? 'MET PET 12µm')?.currentRate ?? null,
        polyRate: film?.currentRate ?? null,
        inkRate: byName.get(settings?.defaultInkMaterial ?? 'Ink — Black')?.currentRate ?? null,
        adhesiveRate:
          byName.get(settings?.defaultAdhesiveMaterial ?? 'Adhesive — PU')?.currentRate ?? null,
        inkGsm: settings?.inkGsm ?? 1.8,
        adhesiveGsm: settings?.adhesiveGsm ?? 2.5,
      });
      return {
        ...result,
        /*
         * Margin is taken against the COMPUTED rate per kg, not the typed one.
         * A per-pouch line never fills the per-kg box in — the office types a
         * rate per pouch — so reading the field directly showed no margin at
         * all on exactly the lines this feature added. `rows` has the rate
         * resolved for whichever basis the line uses.
         */
        marginPercent: computeMargin(rows[index]?.ratePerKg ?? 0, result.costPerKg),
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
    return <LoadingState label="Loading quotation…" />;
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
        <FieldSection
          title="Customer"
          description={
            customerMode === 'existing'
              ? 'Start typing to find a company you already hold.'
              : 'Type the details in. The company is added to your customer list when you save.'
          }
        >
          {/*
            Two clearly separate paths rather than one field that behaves
            differently depending on what is typed into it. Which of the two
            you are doing is a decision the office makes before they start.
          */}
          <div
            role="radiogroup"
            aria-label="Customer"
            /*
              w-fit and self-start: the section lays its children out in a
              stretching column, so inline-flex alone still spanned the full
              width and the two buttons floated in a long empty box.
            */
            className="border-ink-200 mb-4 flex w-fit self-start rounded-[var(--radius-md)] border p-0.5"
          >
            {(
              [
                ['existing', 'Existing company'],
                ['new', 'New company'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={customerMode === mode}
                onClick={() => changeCustomerMode(mode)}
                className={cn(
                  'cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  customerMode === mode
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
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
                hint={
                  customerMode === 'existing'
                    ? 'Type to search. Choosing one fills in the rest.'
                    : undefined
                }
              >
                {/*
                  A searchable text box rather than a dropdown: with dozens of
                  companies, typing three letters beats scrolling a list, and it
                  stays a text field so an unusual name can still be typed.
                */}
                {customerMode === 'existing' ? (
                  <Combobox
                    id="customerName"
                    options={customerNames}
                    registration={register('customerName')}
                    value={String(watched.customerName ?? '')}
                    onPick={applyCustomerByName}
                    placeholder="Search companies…"
                    invalid={Boolean(errors.customerName)}
                  />
                ) : (
                  <Input
                    id="customerName"
                    invalid={Boolean(errors.customerName)}
                    placeholder="Company name"
                    {...register('customerName')}
                  />
                )}
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
            <div className="sm:col-span-3">
              <Field
                label="GST number"
                htmlFor="gstNumber"
                hint="Printed on the quotation"
                error={errors.gstNumber?.message}
              >
                {/* Upper-cased by the schema, so it reads back consistently. */}
                <Input
                  id="gstNumber"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="27ABCDE1234F1Z5"
                  invalid={Boolean(errors.gstNumber)}
                  {...register('gstNumber')}
                />
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
              const watchedItem = watched.items?.[index];
              // Derived from the style, never chosen — the same rule the server
              // applies, so the form cannot show a basis the API will not use.
              const perPouch =
                pricingBasisFor(
                  (watchedItem?.jobKind as JobKind) ?? 'POUCH',
                  (watchedItem?.pouchType as PouchType) || null,
                ) === 'PER_POUCH';
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

                  {/*
                    The line splits in two because the office fills it in as
                    two jobs: what gets printed and converted, and the cylinder
                    tooling that has to be made for it. They are quoted and paid
                    for separately — cylinders are one-time and 100% advance —
                    so running them together as one long row of boxes hid that.
                  */}
                  <p className="text-ink-400 mb-2 text-xs font-semibold tracking-wider uppercase">
                    Printing &amp; pouching
                  </p>
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
                      <Field
                        label="Type"
                        htmlFor={`items.${index}.jobKind`}
                        hint="What the customer receives"
                      >
                        <Select
                          id={`items.${index}.jobKind`}
                          {...register(`items.${index}.jobKind`)}
                        >
                          {JOB_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {JOB_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    {/*
                      Only a pouch has a style, so the field appears with it
                      rather than sitting there greyed out on a roll.
                    */}
                    {watched.items?.[index]?.jobKind !== 'ROLL' ? (
                      <div className="sm:col-span-3">
                        <Field
                          label="Pouch type"
                          htmlFor={`items.${index}.pouchType`}
                          required
                          error={itemErrors?.pouchType?.message}
                        >
                          <Select
                            id={`items.${index}.pouchType`}
                            invalid={Boolean(itemErrors?.pouchType)}
                            {...register(`items.${index}.pouchType`)}
                          >
                            <option value="">— Choose —</option>
                            {POUCH_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {POUCH_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    ) : null}

                    {/* "Other" is only useful if it says what the other is. */}
                    {watched.items?.[index]?.jobKind !== 'ROLL' &&
                    watched.items?.[index]?.pouchType === 'OTHER' ? (
                      <div className="sm:col-span-3">
                        <Field
                          label="Describe it"
                          htmlFor={`items.${index}.pouchTypeNote`}
                          required
                          error={itemErrors?.pouchTypeNote?.message}
                        >
                          <Input
                            id={`items.${index}.pouchTypeNote`}
                            placeholder="e.g. Four side seal"
                            invalid={Boolean(itemErrors?.pouchTypeNote)}
                            {...register(`items.${index}.pouchTypeNote`)}
                          />
                        </Field>
                      </div>
                    ) : null}

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

                    {/*
                      Standup and standup-zipper pouches are sold by the piece,
                      so those lines ask for a pouch count and a rate per pouch,
                      and show the weight worked back from it. Every other style
                      and every roll is sold by weight, unchanged. The boxes
                      swap rather than sitting side by side, because only one
                      pair is ever the one being quoted on.
                    */}
                    {perPouch ? (
                      <>
                        <div className="sm:col-span-3">
                          <Field
                            label="Quantity"
                            htmlFor={`items.${index}.quantityPouches`}
                            hint="pouches"
                            required
                            error={itemErrors?.quantityPouches?.message}
                          >
                            <Input
                              id={`items.${index}.quantityPouches`}
                              inputMode="numeric"
                              invalid={Boolean(itemErrors?.quantityPouches)}
                              {...register(`items.${index}.quantityPouches`)}
                            />
                          </Field>
                        </div>
                        <div className="sm:col-span-3">
                          <Field
                            label="Rate per pouch"
                            htmlFor={`items.${index}.ratePerPouch`}
                            required
                            error={itemErrors?.ratePerPouch?.message}
                          >
                            <Input
                              id={`items.${index}.ratePerPouch`}
                              inputMode="decimal"
                              invalid={Boolean(itemErrors?.ratePerPouch)}
                              {...register(`items.${index}.ratePerPouch`)}
                            />
                          </Field>
                        </div>
                        <div className="sm:col-span-3">
                          <Field
                            label="Weight"
                            htmlFor={`items.${index}.kgOut`}
                            hint="kg — the film is ordered by this"
                          >
                            <ReadOnlyValue
                              value={computed ? `${formatNumber(computed.quantityKg, 3)} kg` : null}
                            />
                          </Field>
                        </div>
                        <div className="sm:col-span-3">
                          <Field
                            label="Works out at"
                            htmlFor={`items.${index}.rateOut`}
                            hint="per kg"
                          >
                            <ReadOnlyValue
                              value={computed ? formatRs(computed.ratePerKg, 2) : null}
                            />
                          </Field>
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                  </div>

                  <p className="text-ink-400 mt-5 mb-2 text-xs font-semibold tracking-wider uppercase">
                    Cylinder
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
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
                        /*
                         * Show the working, not just the answer. Transport is
                         * added to this total, so anyone checking it as
                         * cylinders × cost-per-cylinder lands short by exactly
                         * the transport and concludes the figure is wrong.
                         */
                        hint={
                          computed
                            ? `${formatNumber(num(watchedItem?.cylinderCount))} × ${formatRs(
                                computed.costPerCylinder,
                              )}${
                                num(watchedItem?.transportCost) > 0
                                  ? ` + ${formatRs(num(watchedItem?.transportCost))} transport`
                                  : ''
                              }`
                            : 'Calculated'
                        }
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

                      {/*
                        The plies the cost is built from, with the rate each was
                        costed against. A 3-layer structure is PET + MET PET +
                        Poly, and the metallised ply is dearer — showing the
                        working is what makes a margin figure trustworthy
                        instead of a number to be taken on faith. Rates come
                        from the Rates screen automatically, as of the
                        quotation's date.
                      */}
                      {cost && cost.breakdown.length > 0 ? (
                        <div className="text-ink-500 mt-2 flex flex-wrap gap-x-4 gap-y-1 px-4 text-xs">
                          {cost.breakdown.map((part) => (
                            <span key={part.component} className="tabular-nums">
                              <span className="text-ink-700 font-medium">{part.component}</span>{' '}
                              {formatNumber(part.gsm, 1)} GSM ·{' '}
                              {part.rate === null ? (
                                // Naming the gap beats a blank: the office can
                                // go and enter the rate that is missing.
                                <span className="text-danger-600">no rate today</span>
                              ) : (
                                formatRs(part.rate, 2)
                              )}
                            </span>
                          ))}
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
