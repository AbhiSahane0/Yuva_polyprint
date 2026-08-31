import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Building2, Check, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  type CreateQuotationFormValues,
  type CreateQuotationInput,
  DEFAULT_TERMS,
  MAX_PAGE_SIZE,
  type ItemGeometry,
  type MaterialCostResult,
  PET_MICRON_PER_LAYER,
  type PouchType,
  type PricingBasis,
  computeItemGeometry,
  computeMargin,
  computeMaterialCostPerKg,
  computeTier,
  computeTotals,
  createQuotationSchema,
  formatNumber,
  formatRs,
  pricingBasisFor,
  totalMicronForLayers,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { Field, FieldSection, Input, ReadOnlyValue, Textarea } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import { useCustomer, useCustomers } from '@/features/customers/api/customer-api';
import { useMaterials } from '@/features/rates/api/rate-api';
import {
  useCreateQuotation,
  useNextQuotationNumber,
  useQuotation,
  useSettings,
  useUpdateQuotation,
} from '../api/quotation-api';
import { QuotationPreview } from '../components/QuotationPreview';
import { ConstructionPicker } from '../components/ConstructionPicker';
import { LayerFields } from '../components/LayerFields';
import { QuantityFields, type QuantityResult } from '../components/QuantityFields';
import { StepIndicator, type Step } from '../components/StepIndicator';

/**
 * Making a quotation, one step at a time.
 *
 * The old single page put customer, jobs, terms and totals on one scroll. It
 * worked, but it never said how much was left or what still needed doing, and
 * the costing strip sat a long way from the rates that drove it.
 *
 * The steps are genuinely sequential — a job cannot be priced before the
 * customer is known, and nothing can be reviewed before there are jobs — so
 * each validates only its own fields before letting you on. Going back is
 * always free, and nothing is submitted until the last step.
 */

const STEPS: Step[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'details', label: 'Details' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'terms', label: 'Terms' },
  { id: 'review', label: 'Review' },
];

/** Which fields each step owns, so Next checks that step and nothing else. */
const STEP_FIELDS: (keyof CreateQuotationFormValues)[][] = [
  ['customerName'],
  ['addressLine1', 'addressLine2', 'addressLine3', 'mobile', 'email', 'gstNumber'],
  ['items'],
  ['date', 'notes'],
  [],
];

type ItemValues = NonNullable<CreateQuotationFormValues['items']>[number];

/** A two-ply structure, which is what most enquiries turn out to be. */
const BLANK_ITEM = {
  jobName: '',
  jobKind: 'POUCH',
  pouchType: 'STANDUP',
  pouchTypeNote: '',
  widthMm: '',
  heightMm: '',
  layers: [
    { materialId: null, micron: PET_MICRON_PER_LAYER },
    { materialId: null, micron: 50 },
  ],
  quantities: [{ quantityKg: '', ratePerKg: '', quantityPouches: '', ratePerPouch: '' }],
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
  transportCost: 0,
  chargeCylinders: true,
} as unknown as ItemValues;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface Film {
  id: string;
  name: string;
  density: number | null;
  currentRate: number | null;
}

/** Everything the screen works out about one line, mirroring the server. */
interface ItemCosting {
  basis: PricingBasis;
  material: MaterialCostResult;
  geometry: ItemGeometry;
  quantities: QuantityResult[];
}

export default function QuotationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: settings } = useSettings();
  // Only asked for on a new quotation; an existing one already has its number.
  const { data: nextNumber } = useNextQuotationNumber(!isEdit);
  const { data: existing, isPending: loadingExisting } = useQuotation(id ?? null);
  const { data: materials } = useMaterials();

  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();

  const form = useForm<CreateQuotationFormValues>({
    resolver: zodResolver(createQuotationSchema),
    mode: 'onBlur',
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      customerId: null,
      saveAsCustomer: false,
      customerName: '',
      addressLine1: '',
      addressLine2: '',
      addressLine3: '',
      mobile: '',
      email: '',
      gstNumber: '',
      status: 'DRAFT',
      terms: DEFAULT_TERMS,
      notes: '',
      items: [BLANK_ITEM],
    },
  });

  const { control, register, handleSubmit, setValue, trigger, formState, reset } = form;
  const items = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control });

  /*
   * Searched on the server, not filtered in the browser.
   *
   * This asked for 200 in a page — over MAX_PAGE_SIZE, so the request was
   * rejected and the suggestions list was silently empty: typing a company name
   * offered nothing at all. Capping it at 100 would have fixed today's symptom
   * and reintroduced it the day the works passes a hundred customers, so the
   * typed name goes to the API as a search term instead.
   */
  const { data: customerPage } = useCustomers({
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    q: customerMode === 'existing' ? (watched.customerName ?? '') : '',
  });

  const customerId = (watched.customerId ?? null) as string | null;
  const { data: chosenCustomer } = useCustomer(customerMode === 'existing' ? customerId : null);

  /* ---------------------------------------------- prefill from the customer */

  useEffect(() => {
    if (!chosenCustomer) return;
    // 'NA' is the importer's placeholder; showing it as if it were an address
    // is worse than showing nothing.
    const real = (value: string | null | undefined) => (value && value !== 'NA' ? value : '');
    setValue('customerName', chosenCustomer.companyName);
    setValue('addressLine1', real(chosenCustomer.address));
    setValue('addressLine2', real(chosenCustomer.city));
    setValue('addressLine3', real(chosenCustomer.district));
    setValue('mobile', real(chosenCustomer.mobile));
    setValue('email', real(chosenCustomer.email));
    setValue('gstNumber', real(chosenCustomer.gstNumber));
  }, [chosenCustomer, setValue]);

  /* ------------------------------------------------------- editing a draft */

  useEffect(() => {
    if (!existing) return;
    setCustomerMode(existing.customerId ? 'existing' : 'new');
    reset({
      date: existing.date,
      customerId: existing.customerId,
      saveAsCustomer: false,
      customerName: existing.customerName,
      addressLine1: existing.addressLine1,
      addressLine2: existing.addressLine2,
      addressLine3: existing.addressLine3,
      mobile: existing.mobile,
      email: existing.email,
      gstNumber: existing.gstNumber,
      status: existing.status,
      terms: existing.terms,
      notes: existing.notes,
      items: existing.items.map((item) => ({
        id: item.id,
        jobId: item.jobId,
        jobName: item.jobName,
        jobKind: item.jobKind,
        pouchType: item.pouchType,
        pouchTypeNote: item.pouchTypeNote,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        layers: item.layers.map((layer) => ({
          materialId: layer.materialId,
          micron: layer.micron,
        })),
        quantities: item.quantities.map((quantity) => ({
          quantityKg: quantity.quantityKg,
          ratePerKg: quantity.ratePerKg,
          quantityPouches: quantity.quantityPouches,
          ratePerPouch: quantity.ratePerPouch,
        })),
        repeatWidth: item.repeatWidth,
        repeatHeight: item.repeatHeight,
        cylinderCount: item.cylinderCount,
        transportCost: item.transportCost,
        chargeCylinders: item.chargeCylinders,
      })) as CreateQuotationFormValues['items'],
    });
    // An existing quotation is complete, so every step is already reachable.
    setFurthest(STEPS.length - 1);
  }, [existing, reset]);

  /* ----------------------------------------------------------- live costing */

  const films: Film[] = useMemo(
    () =>
      (materials ?? [])
        .filter((material) => material.category === 'FILM')
        .map((material) => ({
          id: material.id,
          name: material.name,
          density: material.density,
          currentRate: material.currentRate,
        })),
    [materials],
  );

  const filmById = useMemo(() => new Map(films.map((film) => [film.id, film])), [films]);
  const byName = useMemo(
    () => new Map((materials ?? []).map((material) => [material.name, material])),
    [materials],
  );

  const cylinderRate = settings?.cylinderRate ?? 2.5;

  /**
   * The same arithmetic the server runs, so the margin shown while choosing a
   * price is the one that gets stored.
   */
  const costed: ItemCosting[] = useMemo(() => {
    return (watched.items ?? []).map((item) => {
      const jobKind = (item?.jobKind ?? 'POUCH') as 'POUCH' | 'ROLL';
      const pouchType = (item?.pouchType || null) as PouchType | null;
      const basis = pricingBasisFor(jobKind, pouchType);

      const layers = (item?.layers ?? []).map((layer) => {
        const film = layer?.materialId ? filmById.get(String(layer.materialId)) : undefined;
        return {
          name: film?.name ?? 'Not chosen',
          micron: num(layer?.micron),
          density: film?.density ?? null,
          ratePerKg: film?.currentRate ?? null,
        };
      });

      const material = computeMaterialCostPerKg({
        layers,
        inkGsm: settings?.inkGsm ?? 1.8,
        adhesiveGsm: settings?.adhesiveGsm ?? 2.5,
        inkRate: byName.get(settings?.defaultInkMaterial ?? 'Ink — Black')?.currentRate ?? null,
        adhesiveRate:
          byName.get(settings?.defaultAdhesiveMaterial ?? 'Adhesive — PU')?.currentRate ?? null,
      });

      const geometry = computeItemGeometry(
        {
          layerCount: layers.length,
          micron: totalMicronForLayers(layers),
          widthMm: num(item?.widthMm),
          heightMm: num(item?.heightMm),
          repeatWidth: num(item?.repeatWidth),
          repeatHeight: num(item?.repeatHeight),
          cylinderCount: num(item?.cylinderCount),
          transportCost: num(item?.transportCost),
          chargeCylinders: item?.chargeCylinders !== false,
        },
        cylinderRate,
      );

      const quantities: QuantityResult[] = (item?.quantities ?? []).map((quantity) => {
        const tier = computeTier(geometry.pouchesPerKg, {
          pricingBasis: basis,
          quantityKg: num(quantity?.quantityKg),
          ratePerKg: num(quantity?.ratePerKg),
          quantityPouches: num(quantity?.quantityPouches),
          ratePerPouch: num(quantity?.ratePerPouch),
        });
        return { ...tier, marginPercent: computeMargin(tier.ratePerKg, material.costPerKg) };
      });

      return { basis, material, geometry, quantities };
    });
  }, [watched.items, filmById, byName, settings, cylinderRate]);

  /** Totals per quantity column, for the review step. */
  const tierTotals = useMemo(() => {
    const columns = Math.max(1, ...costed.map((entry) => entry.quantities.length));
    return Array.from({ length: columns }, (_, index) =>
      computeTotals(
        costed.map((entry, itemIndex) => ({
          quantityKg: entry.quantities[index]?.quantityKg ?? 0,
          cylinderCount: num(watched.items?.[itemIndex]?.cylinderCount),
          totalAmount: entry.quantities[index]?.totalAmount ?? 0,
          totalCylinderCost: entry.geometry.totalCylinderCost,
        })),
        {
          gstPercent: settings?.gstPercent ?? 18,
          materialAdvancePercent: settings?.materialAdvancePercent ?? 70,
          cylinderAdvancePercent: settings?.cylinderAdvancePercent ?? 100,
        },
      ),
    );
  }, [costed, watched.items, settings]);

  /* -------------------------------------------------------------- movement */

  async function goNext() {
    const fields = STEP_FIELDS[step] ?? [];
    if (fields.length > 0 && !(await trigger(fields))) return;
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((seen) => Math.max(seen, next));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(status: 'DRAFT' | 'SENT') {
    await handleSubmit(async (values) => {
      const payload = {
        ...values,
        status,
        saveAsCustomer: customerMode === 'new',
        customerId: customerMode === 'existing' ? values.customerId : null,
      } as CreateQuotationInput;

      try {
        const saved = isEdit
          ? await updateQuotation.mutateAsync({ id: id!, input: payload })
          : await createQuotation.mutateAsync(payload);
        toast.success(`Quotation ${saved.number} saved`);
        setPreviewId(saved.id);
      } catch (cause) {
        toast.error(cause instanceof ApiClientError ? cause.message : 'Could not save.');
      }
    })();
  }

  if (isEdit && loadingExisting) return <LoadingState label="Loading quotation…" />;

  const busy = createQuotation.isPending || updateQuotation.isPending;
  const customers = customerPage?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/quotations')}
            className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" />
            Quotations
          </button>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
            {isEdit ? `Quotation ${existing?.number ?? ''}` : 'New quotation'}
          </h1>
          {!isEdit && nextNumber ? (
            <p className="text-ink-500 mt-0.5 text-sm">Will be number {nextNumber.number}</p>
          ) : null}
        </div>

        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)]">
          <StepIndicator steps={STEPS} current={step} furthest={furthest} onGoTo={setStep} />
        </div>
      </header>

      <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-5">
        {step === 0 ? (
          <FieldSection title="Who is this for?">
            <div className="col-span-12 flex flex-wrap gap-2">
              {(
                [
                  ['existing', 'Existing company', Building2],
                  ['new', 'New company', UserPlus],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setCustomerMode(mode);
                    setValue('customerId', null);
                    if (mode === 'new') setValue('customerName', '');
                  }}
                  className={cn(
                    'focus-visible:ring-brand-500 inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3.5 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none',
                    customerMode === mode
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="col-span-12 sm:col-span-8">
              {customerMode === 'existing' ? (
                <Field
                  label="Company"
                  htmlFor="customerId"
                  hint="Type to search"
                  error={formState.errors.customerName?.message}
                >
                  <Combobox
                    id="customerName"
                    options={customers.map((customer) => customer.companyName)}
                    registration={register('customerName')}
                    value={watched.customerName ?? ''}
                    invalid={Boolean(formState.errors.customerName)}
                    placeholder="Search companies…"
                    onPick={(name) => {
                      setValue('customerName', name, { shouldValidate: true });
                      // The name is what the office types; the link to the
                      // customer record follows from it.
                      setValue(
                        'customerId',
                        customers.find((customer) => customer.companyName === name)?.id ?? null,
                      );
                    }}
                  />
                </Field>
              ) : (
                <Field
                  label="Company name"
                  htmlFor="customerName"
                  hint="Added to the customer list when this saves"
                  error={formState.errors.customerName?.message}
                >
                  <Input
                    id="customerName"
                    invalid={Boolean(formState.errors.customerName)}
                    {...register('customerName')}
                  />
                </Field>
              )}
            </div>
          </FieldSection>
        ) : null}

        {step === 1 ? (
          <FieldSection
            title="Where it goes"
            description={
              customerMode === 'existing'
                ? 'Filled in from the customer list. Corrections here apply to this quotation only.'
                : 'Typed once — the company joins the customer list when this saves.'
            }
          >
            <div className="col-span-12 sm:col-span-6">
              <Field label="Address" htmlFor="addressLine1">
                <Input id="addressLine1" {...register('addressLine1')} />
              </Field>
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Field label="City" htmlFor="addressLine2">
                <Input id="addressLine2" {...register('addressLine2')} />
              </Field>
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Field label="District" htmlFor="addressLine3">
                <Input id="addressLine3" {...register('addressLine3')} />
              </Field>
            </div>
            <div className="col-span-6 sm:col-span-4">
              <Field label="Mobile" htmlFor="mobile">
                <Input id="mobile" {...register('mobile')} />
              </Field>
            </div>
            <div className="col-span-6 sm:col-span-4">
              <Field label="Email" htmlFor="email" hint="Used when sending the quotation">
                <Input id="email" type="email" {...register('email')} />
              </Field>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <Field label="GST number" htmlFor="gstNumber">
                <Input id="gstNumber" {...register('gstNumber')} />
              </Field>
            </div>
          </FieldSection>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            {items.fields.map((field, index) => (
              <JobCard
                key={field.id}
                index={index}
                control={control}
                register={register}
                setValue={setValue}
                films={films}
                item={watched.items?.[index] as Partial<ItemValues> | undefined}
                cost={costed[index]}
                errors={formState.errors.items?.[index] as JobErrors | undefined}
                canRemove={items.fields.length > 1}
                onRemove={() => items.remove(index)}
              />
            ))}

            <div>
              <Button variant="secondary" onClick={() => items.append(BLANK_ITEM)}>
                <Plus className="size-4" />
                Add another job
              </Button>
              {typeof formState.errors.items?.message === 'string' ? (
                <p className="text-danger-600 mt-2 text-sm">{formState.errors.items.message}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <FieldSection
            title="Terms and notes"
            description="Printed at the foot of the quotation. Edits apply to this document only."
          >
            <div className="col-span-12 sm:col-span-4">
              <Field label="Quotation date" htmlFor="date" error={formState.errors.date?.message}>
                <Input id="date" type="date" {...register('date')} />
              </Field>
            </div>
            <div className="col-span-12">
              <Field label="Terms" htmlFor="terms" hint="One per line">
                <Textarea
                  id="terms"
                  rows={7}
                  defaultValue={(watched.terms ?? DEFAULT_TERMS).join('\n')}
                  onChange={(event) =>
                    setValue(
                      'terms',
                      event.target.value.split('\n').filter((line) => line.trim().length > 0),
                    )
                  }
                />
              </Field>
            </div>
            <div className="col-span-12">
              <Field label="Notes" htmlFor="notes" hint="Optional">
                <Textarea id="notes" rows={3} {...register('notes')} />
              </Field>
            </div>
          </FieldSection>
        ) : null}

        {step === 4 ? (
          <ReviewStep
            items={(watched.items ?? []) as Partial<ItemValues>[]}
            costed={costed}
            tierTotals={tierTotals}
            gstPercent={settings?.gstPercent ?? 18}
          />
        ) : null}

        <div className="border-ink-200 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" onClick={goBack} disabled={step === 0 || busy}>
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => void goNext()} disabled={busy}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void save('DRAFT')} loading={busy}>
                Save as draft
              </Button>
              <Button onClick={() => void save('SENT')} loading={busy}>
                <Check className="size-4" />
                Save and send
              </Button>
            </div>
          )}
        </div>
      </form>

      <QuotationPreview
        id={previewId}
        onClose={() => {
          setPreviewId(null);
          navigate('/quotations');
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

type JobErrors = Record<string, { message?: string } | undefined>;

function JobCard({
  index,
  control,
  register,
  setValue,
  films,
  item,
  cost,
  errors,
  canRemove,
  onRemove,
}: {
  index: number;
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  films: Film[];
  item: Partial<ItemValues> | undefined;
  cost: ItemCosting | undefined;
  errors: JobErrors | undefined;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const jobKind = (item?.jobKind ?? 'POUCH') as 'POUCH' | 'ROLL';
  const pouchType = (item?.pouchType || null) as PouchType | null;
  const basis = pricingBasisFor(jobKind, pouchType);
  const chargeCylinders = item?.chargeCylinders !== false;

  return (
    <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-ink-900 text-base font-semibold">Job {index + 1}</h2>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove job ${index + 1}`}
            className="text-ink-400 hover:text-danger-600"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6">
          <Field
            label="Job name"
            htmlFor={`items.${index}.jobName`}
            error={errors?.jobName?.message}
          >
            <Input
              id={`items.${index}.jobName`}
              invalid={Boolean(errors?.jobName)}
              {...register(`items.${index}.jobName`)}
            />
          </Field>
        </div>
        <div className="col-span-6 sm:col-span-3">
          <Field
            label="Width"
            htmlFor={`items.${index}.widthMm`}
            hint="mm"
            error={errors?.widthMm?.message}
          >
            <Input
              id={`items.${index}.widthMm`}
              inputMode="decimal"
              invalid={Boolean(errors?.widthMm)}
              {...register(`items.${index}.widthMm`)}
            />
          </Field>
        </div>
        <div className="col-span-6 sm:col-span-3">
          <Field
            label="Height"
            htmlFor={`items.${index}.heightMm`}
            hint="mm"
            error={errors?.heightMm?.message}
          >
            <Input
              id={`items.${index}.heightMm`}
              inputMode="decimal"
              invalid={Boolean(errors?.heightMm)}
              {...register(`items.${index}.heightMm`)}
            />
          </Field>
        </div>

        <div className="col-span-12">
          <p className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">
            What the customer receives
          </p>
          <ConstructionPicker
            value={{ jobKind, pouchType }}
            onChange={(next) => {
              setValue(`items.${index}.jobKind`, next.jobKind as ItemValues['jobKind']);
              setValue(`items.${index}.pouchType`, next.pouchType as ItemValues['pouchType']);
            }}
          />
          {errors?.pouchType?.message ? (
            <p className="text-danger-600 mt-2 text-sm">{errors.pouchType.message}</p>
          ) : null}
        </div>

        {pouchType === 'OTHER' ? (
          <div className="col-span-12 sm:col-span-6">
            <Field
              label="Describe it"
              htmlFor={`items.${index}.pouchTypeNote`}
              error={errors?.pouchTypeNote?.message}
            >
              <Input
                id={`items.${index}.pouchTypeNote`}
                {...register(`items.${index}.pouchTypeNote`)}
              />
            </Field>
          </div>
        ) : null}

        <div className="col-span-12">
          <LayerFields
            control={control}
            register={register}
            itemIndex={index}
            films={films}
            errors={errors?.layers as never}
          />
        </div>

        <div className="col-span-12">
          <QuantityFields
            control={control}
            register={register}
            itemIndex={index}
            pricingBasis={basis}
            results={cost?.quantities ?? []}
            errors={errors?.quantities as never}
          />
        </div>

        <div className="col-span-12">
          <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                Cylinders
              </span>
              {/*
               * Per design, not per customer. A customer of ten years ordering a
               * new pouch still needs a new set engraved — which is what the
               * printed terms have always said.
               */}
              <label className="text-ink-600 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand-600 size-4"
                  {...register(`items.${index}.chargeCylinders`)}
                />
                Charge for cylinders (new design)
              </label>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6 sm:col-span-3">
                <Field label="Repeat width" htmlFor={`items.${index}.repeatWidth`}>
                  <Input
                    id={`items.${index}.repeatWidth`}
                    inputMode="decimal"
                    {...register(`items.${index}.repeatWidth`)}
                  />
                </Field>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Field label="Repeat height" htmlFor={`items.${index}.repeatHeight`}>
                  <Input
                    id={`items.${index}.repeatHeight`}
                    inputMode="decimal"
                    {...register(`items.${index}.repeatHeight`)}
                  />
                </Field>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Field
                  label="Cylinders"
                  htmlFor={`items.${index}.cylinderCount`}
                  hint="One per colour"
                >
                  <Input
                    id={`items.${index}.cylinderCount`}
                    inputMode="numeric"
                    {...register(`items.${index}.cylinderCount`)}
                  />
                </Field>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Field label="Transport" htmlFor={`items.${index}.transportCost`} hint="Optional">
                  <Input
                    id={`items.${index}.transportCost`}
                    inputMode="decimal"
                    disabled={!chargeCylinders}
                    {...register(`items.${index}.transportCost`)}
                  />
                </Field>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <Field
                  label="Cost per cylinder"
                  htmlFor={`items.${index}.costPerCylinder`}
                  hint="Calculated"
                >
                  <ReadOnlyValue value={formatRs(cost?.geometry.costPerCylinder ?? 0)} />
                </Field>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Field
                  label="Cylinder total"
                  htmlFor={`items.${index}.totalCylinderCost`}
                  hint={
                    chargeCylinders
                      ? 'Charged on this quotation'
                      : 'This design already has cylinders'
                  }
                >
                  <ReadOnlyValue value={formatRs(cost?.geometry.totalCylinderCost ?? 0)} />
                </Field>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12">
          <div className="border-ink-200 text-ink-600 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[var(--radius-md)] border border-dashed px-3 py-2.5 text-sm">
            <span>
              Structure{' '}
              <strong className="text-ink-900">{formatNumber(cost?.geometry.micron ?? 0)}µ</strong>
            </span>
            <span>{formatNumber(cost?.geometry.pouchesPerKg ?? 0, 2)} pouches/kg</span>
            {/*
             * Only once the line can actually be costed. With no film chosen
             * the composite is just the ink and adhesive — a confident 4.3 GSM
             * for a pouch that weighs twenty times that.
             */}
            {cost?.material.costPerKg == null ? null : (
              <span>{formatNumber(cost.material.compositeGsm, 1)} GSM</span>
            )}
            <span className="ml-auto">
              {cost?.material.costPerKg == null ? (
                <span className="text-ink-400">Not costed — every ply needs a film</span>
              ) : (
                <>
                  Material{' '}
                  <strong className="text-ink-900">
                    {formatRs(cost.material.costPerKg, 2)}/kg
                  </strong>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewStep({
  items,
  costed,
  tierTotals,
  gstPercent,
}: {
  items: Partial<ItemValues>[];
  costed: ItemCosting[];
  tierTotals: ReturnType<typeof computeTotals>[];
  gstPercent: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        <div className="border-ink-100 border-b px-4 py-3">
          <h2 className="text-ink-900 text-base font-semibold">What the customer sees</h2>
          <p className="text-ink-500 mt-0.5 text-sm">
            {tierTotals.length > 1
              ? `Priced at ${tierTotals.length} quantities. The cylinders cost the same in every column — which is why the unit price falls.`
              : 'Priced at one quantity.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-ink-50 text-ink-500 text-xs tracking-wide uppercase">
                <th className="px-4 py-2 text-left font-semibold">Job</th>
                {tierTotals.map((_, index) => (
                  <th key={index} className="px-4 py-2 text-right font-semibold">
                    Quantity {index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {items.map((item, index) => (
                <tr key={index}>
                  <td className="text-ink-800 px-4 py-2.5">
                    {item?.jobName || `Job ${index + 1}`}
                  </td>
                  {tierTotals.map((_, tier) => (
                    <td key={tier} className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                      {formatRs(costed[index]?.quantities[tier]?.totalAmount ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-ink-50/70">
                <td className="text-ink-800 px-4 py-2.5 font-medium">Cylinders</td>
                {tierTotals.map((total, tier) => (
                  <td
                    key={tier}
                    className="text-ink-800 px-4 py-2.5 text-right font-medium tabular-nums"
                  >
                    {formatRs(total.cylinderSubtotal)}
                  </td>
                ))}
              </tr>
              <tr className="bg-brand-50/60">
                <td className="text-ink-900 px-4 py-3 font-semibold">
                  Total including {gstPercent}% GST
                </td>
                {tierTotals.map((total, tier) => (
                  <td
                    key={tier}
                    className="text-ink-900 px-4 py-3 text-right font-semibold tabular-nums"
                  >
                    {formatRs(total.grandWithGst)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-ink-500 px-4 py-2.5">Advance</td>
                {tierTotals.map((total, tier) => (
                  <td key={tier} className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                    {formatRs(total.totalAdvance)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-ink-500 text-sm">
        Saving as a draft keeps it editable. Saving and sending opens the printed quotation so you
        can check it before it goes out.
      </p>
    </div>
  );
}
