import { useEffect, useMemo, useRef, useState } from 'react';
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
  type CustomerJob,
  type QuotationSummary,
  MAX_PAGE_SIZE,
  type ItemGeometry,
  type MaterialCostResult,
  PET_MICRON_PER_LAYER,
  JOB_KINDS,
  JOB_KIND_LABELS,
  POUCH_TYPES,
  POUCH_TYPE_LABELS,
  type PouchType,
  type PricingBasis,
  computeItemGeometry,
  computeMargin,
  computeMaterialCostPerKg,
  overriddenRate,
  plyRatePerKg,
  resolveSelectedQuantity,
  suggestRepeatHeight,
  suggestRepeatWidth,
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
import { Field, FieldSection, Input, ReadOnlyValue, Select, Textarea } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import {
  useCustomer,
  useCustomers,
  useSaveCustomerJob,
  useUpdateCustomer,
} from '@/features/customers/api/customer-api';
import { useMaterials } from '@/features/rates/api/rate-api';
import {
  useCreateQuotation,
  useNextQuotationNumber,
  useQuotation,
  useSettings,
  useUpdateQuotation,
} from '../api/quotation-api';
import { GstinField } from '@/features/gstin/components/GstinField';
import {
  baselineFromCustomer,
  changedCustomerFields,
  customerDetailsFromForm,
  designFingerprint,
  fingerprintFromSavedJob,
  isSaveableDesign,
  jobPayloadFromLine,
  type CustomerDetails,
} from '../lib/step-save';
import { QuotationPreview } from '../components/QuotationPreview';
import { SendQuotationModal } from '../components/SendQuotationModal';
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
  { id: 'review', label: 'Review' },
];

/** Which fields each step owns, so Next checks that step and nothing else. */
const STEP_FIELDS: (keyof CreateQuotationFormValues)[][] = [
  ['customerName'],
  ['addressLine1', 'addressLine2', 'addressLine3', 'mobile', 'email', 'gstNumber'],
  ['items'],
  [],
];

/**
 * Today, as the office's calendar has it.
 *
 * Not `toISOString().slice(0, 10)`, which is the date in UTC: this works runs a
 * night shift, and between midnight and half past five in the morning IST that
 * reads yesterday. A quotation dated the day before it was written is the kind
 * of error nobody catches until a customer queries it.
 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

type ItemValues = NonNullable<CreateQuotationFormValues['items']>[number];

/**
 * A design nobody has specified yet.
 *
 * Defined once, because two paths need it: a line added from scratch, and a
 * line switched back to "new design" after a saved job was picked. If those
 * drifted apart, one of them would leave the previous job's dimensions behind.
 */
const BLANK_DESIGN = {
  jobName: '',
  widthMm: '',
  heightMm: '',
  isGazette: false,
  gazetteBottom: 0,
  gazetteLeft: 0,
  gazetteRight: 0,
  layers: [
    { materialId: null, micron: PET_MICRON_PER_LAYER, rateOverride: '' },
    { materialId: null, micron: 50, rateOverride: '' },
  ],
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
  transportCost: 0,
  chargeCylinders: true,
} as const;

/** A two-ply structure, which is what most enquiries turn out to be. */
const BLANK_ITEM = {
  ...BLANK_DESIGN,
  jobKind: 'POUCH',
  pouchType: 'STANDUP',
  pouchTypeNote: '',
  // The trade convention for a standup pouch, which the office can change on
  // the line — see the switch in the Quantities panel.
  pricingBasis: pricingBasisFor('POUCH', 'STANDUP'),
  quantities: [{ quantityKg: '', ratePerKg: '', quantityPouches: '', ratePerPouch: '' }],
} as unknown as ItemValues;

/**
 * How a line is sold — what the office chose, or the convention if they never
 * touched the switch.
 *
 * One place, because the live costing and the form controls have to agree on
 * it: if they disagreed, the margin shown while choosing a price would not be
 * the one that gets stored.
 */
function basisOf(
  item: { jobKind?: unknown; pouchType?: unknown; pricingBasis?: unknown } | undefined,
): PricingBasis {
  const jobKind = (item?.jobKind ?? 'POUCH') as 'POUCH' | 'ROLL';
  const pouchType = (item?.pouchType || null) as PouchType | null;
  const chosen = (item?.pricingBasis || null) as PricingBasis | null;

  // A reel has no pouches to count, whatever was stored against it.
  if (jobKind === 'ROLL') return 'PER_KG';
  return chosen ?? pricingBasisFor(jobKind, pouchType);
}

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

/**
 * Writes a number onto a form field that the schema will coerce.
 *
 * The form holds these as strings while they are being typed, so the value goes
 * in as one — setting a raw number leaves react-hook-form and the input element
 * disagreeing about the field's type.
 */
function setNumber(
  setValue: UseFormSetValue<CreateQuotationFormValues>,
  path: string,
  value: number | string,
) {
  setValue(path as never, String(value) as never, { shouldDirty: true });
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
  /**
   * The saved quotation the office asked to send, or null.
   *
   * Two pieces of state rather than one because they answer different
   * questions: `previewId` is what is on screen, and this is whether Send
   * belongs on it. Saving as a draft opens the same preview with no Send.
   */
  const [reviewing, setReviewing] = useState<QuotationSummary | null>(null);
  const [sending, setSending] = useState<QuotationSummary | null>(null);

  const { data: settings } = useSettings();
  // Only asked for on a new quotation; an existing one already has its number.
  const { data: nextNumber } = useNextQuotationNumber(!isEdit);
  const { data: existing, isPending: loadingExisting } = useQuotation(id ?? null);
  const { data: materials } = useMaterials();

  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const updateCustomer = useUpdateCustomer();
  const saveJob = useSaveCustomerJob();

  /*
   * What the server already holds, so a step can tell whether anything moved.
   *
   * A ref rather than state: nothing renders from it, and making it state would
   * re-render the whole wizard every time a step advanced. The customer's
   * details live under `customer`; each line's design lives under its job id,
   * so a design edited after it was saved is recognised and one that was only
   * looked at is not written again.
   */
  const saved = useRef<{
    customer: CustomerDetails | null;
    /**
     * What the form was last filled in with, by `reset` or by the prefill.
     *
     * Separate from `customer` because they are different questions. `customer`
     * is what the record holds; `shown` is what the office was looking at. Only
     * a difference from `shown` is something they decided.
     */
    shown: CustomerDetails | null;
    designs: Map<string, string>;
  }>({
    customer: null,
    shown: null,
    designs: new Map(),
  });

  const form = useForm<CreateQuotationFormValues>({
    resolver: zodResolver(createQuotationSchema),
    mode: 'onBlur',
    defaultValues: {
      date: today(),
      customerId: null,
      saveAsCustomer: false,
      selectedQuantity: 1,
      customerName: '',
      brandName: '',
      addressLine1: '',
      addressLine2: '',
      addressLine3: '',
      mobile: '',
      email: '',
      gstNumber: '',
      status: 'DRAFT',
      // Terms are the company's standard set and no longer editable per
      // document — the schema supplies them when the field is left out.
      notes: '',
      items: [BLANK_ITEM],
    },
  });

  const { control, register, handleSubmit, setValue, trigger, formState, reset } = form;
  const items = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control });

  /*
   * Which quantity the customer is quoted, 1-based.
   *
   * Clamped against the quantities that exist, using the same rule the server
   * applies on save — removing the quantity that was ticked must fall back to
   * one that is there rather than leave the document pointing at nothing.
   */
  const selectedQuantity = resolveSelectedQuantity(
    Number(watched.selectedQuantity ?? 1),
    watched.items?.[0]?.quantities?.length ?? 1,
  );

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

  /*
   * Seeded from the customer as they are loaded, and from every design they
   * already hold. Without this the first Next would rewrite rows that nobody
   * touched, purely because the wizard had nothing to compare against.
   */
  useEffect(() => {
    if (!chosenCustomer) {
      saved.current = { customer: null, shown: null, designs: new Map() };
      return;
    }
    saved.current = {
      customer: baselineFromCustomer(chosenCustomer),
      // Filled in by whichever effect populates the form last — see below.
      shown: saved.current.shown,
      designs: new Map(
        chosenCustomer.jobs.map((job) => [job.id, fingerprintFromSavedJob(job)] as const),
      ),
    };
  }, [chosenCustomer]);

  useEffect(() => {
    if (!chosenCustomer) return;
    // 'NA' is the importer's placeholder; showing it as if it were an address
    // is worse than showing nothing.
    const real = (value: string | null | undefined) => (value && value !== 'NA' ? value : '');
    setValue('customerName', chosenCustomer.companyName);
    setValue('brandName', real(chosenCustomer.brandName));
    setValue('addressLine1', real(chosenCustomer.address));
    setValue('addressLine2', real(chosenCustomer.city));
    setValue('addressLine3', real(chosenCustomer.district));
    setValue('mobile', real(chosenCustomer.mobile));
    setValue('email', real(chosenCustomer.email));
    setValue('gstNumber', real(chosenCustomer.gstNumber));

    // What the office is now looking at. Anything that differs from this later
    // is something they typed.
    saved.current.shown = customerDetailsFromForm({
      customerName: chosenCustomer.companyName,
      brandName: real(chosenCustomer.brandName),
      addressLine1: real(chosenCustomer.address),
      addressLine2: real(chosenCustomer.city),
      addressLine3: real(chosenCustomer.district),
      mobile: real(chosenCustomer.mobile),
      email: real(chosenCustomer.email),
      gstNumber: real(chosenCustomer.gstNumber),
    });
  }, [chosenCustomer, setValue]);

  /* ------------------------------------------------------- editing a draft */

  useEffect(() => {
    if (!existing) return;
    setCustomerMode(existing.customerId ? 'existing' : 'new');
    reset({
      date: existing.date,
      customerId: existing.customerId,
      saveAsCustomer: false,
      selectedQuantity: existing.selectedQuantity,
      customerName: existing.customerName,
      /*
       * Blank, not from the quotation: the brand lives on the customer and is
       * not snapshotted here, so the prefill fills it in once their record
       * loads. Starting undefined would leave the box uncontrolled for a beat.
       */
      brandName: '',
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
        // Taken from the stored line, not re-derived: a quotation sold by the
        // kilogram must not silently become a per-piece one on reopening.
        pricingBasis: item.pricingBasis,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        isGazette: item.isGazette,
        gazetteBottom: item.gazetteBottom,
        gazetteLeft: item.gazetteLeft,
        gazetteRight: item.gazetteRight,
        layers: item.layers.map((layer) => ({
          materialId: layer.materialId,
          micron: layer.micron,
          /*
           * A rate that was typed goes back in the box; one that came from the
           * film does not.
           *
           * There is no stored flag saying which it was, and there does not
           * need to be: the ply keeps the film's name, and a name stating a
           * gauge different from the one quoted is exactly the case the box is
           * shown for. Reading it back this way means reopening a quotation
           * shows what was actually charged rather than an empty box beside a
           * price nobody can account for.
           */
          rateOverride: overriddenRate(layer),
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
    /*
     * The document's own snapshot is what the office sees on an edit, and it
     * may legitimately differ from the customer's record — that is history, not
     * a correction. Recording it here stops the next Next from writing the
     * quotation's old address back over their current one.
     */
    saved.current.shown = customerDetailsFromForm({
      customerName: existing.customerName,
      brandName: '',
      addressLine1: existing.addressLine1,
      addressLine2: existing.addressLine2,
      addressLine3: existing.addressLine3,
      mobile: existing.mobile,
      email: existing.email,
      gstNumber: existing.gstNumber,
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
      const basis = basisOf(item);

      const layers = (item?.layers ?? []).map((layer) => {
        const film = layer?.materialId ? filmById.get(String(layer.materialId)) : undefined;
        const override = num(layer?.rateOverride);
        return {
          name: film?.name ?? 'Not chosen',
          micron: num(layer?.micron),
          density: film?.density ?? null,
          /*
           * Shared, so the margin shown while a price is being chosen is the
           * one the quotation is saved with. It also refuses to guess: a gauge
           * off the price list with no rate yet costs nothing, so the line
           * reads as uncostable rather than quietly borrowing the stocked
           * gauge's price.
           */
          ratePerKg: plyRatePerKg({
            materialName: film?.name ?? null,
            micron: num(layer?.micron),
            stockRate: film?.currentRate ?? null,
            override: override > 0 ? override : null,
          }),
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
          makesPouches: (item?.jobKind ?? 'POUCH') !== 'ROLL',
          gazette: item?.isGazette
            ? {
                bottom: num(item?.gazetteBottom),
                left: num(item?.gazetteLeft),
                right: num(item?.gazetteRight),
              }
            : undefined,
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
        return {
          ...tier,
          marginPercent: computeMargin(tier.ratePerKg, material.costPerKg),
          materialCostPerKg: material.costPerKg,
        };
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

  /**
   * Empties every box on the customer step.
   *
   * Switching between Existing and New is a statement that this quotation is
   * for somebody else, so nothing typed for the last one should survive it.
   * Only the company name used to be cleared, and only in one direction —
   * which left a chosen customer's address, mobile, GSTIN and brand sitting
   * under a New company heading, ready to be saved onto a firm they belong to
   * no part of.
   */
  function clearCustomerFields() {
    setValue('customerId', null);
    for (const field of [
      'customerName',
      'brandName',
      'addressLine1',
      'addressLine2',
      'addressLine3',
      'mobile',
      'email',
      'gstNumber',
    ] as const) {
      setValue(field, '', { shouldDirty: false });
    }
    // The baseline goes with them: it described a customer this quotation is
    // no longer for, and keeping it would make the next Next diff against the
    // wrong record.
    saved.current = { customer: null, shown: null, designs: new Map() };
  }

  /**
   * Pushes this quotation's corrections back onto the customer record.
   *
   * NOT CALLED — see persistStep for why. Kept rather than deleted because the
   * bug is in how the form reports its values, not in this logic, and throwing
   * it away would mean rebuilding it once the cause is found.
   *
   * Only what changed, and only for an existing customer — a new company has no
   * record to correct until the quotation saves and creates one.
   */
  async function _persistCustomerDetails() {
    const id = customerId;
    const baseline = saved.current.customer;
    if (customerMode !== 'existing' || !id || !baseline) return;

    const current: CustomerDetails = {
      companyName: watched.customerName ?? '',
      brandName: watched.brandName ?? '',
      address: watched.addressLine1 ?? '',
      city: watched.addressLine2 ?? '',
      district: watched.addressLine3 ?? '',
      mobile: watched.mobile ?? '',
      email: watched.email ?? '',
      gstNumber: watched.gstNumber ?? '',
    };

    /*
     * Only what somebody actually typed in. The form is filled in from the
     * customer's own record, so a value that nobody touched can only ever
     * match what is already stored — or be a value the form had not received
     * yet, which must never be written back over them.
     */
    /*
     * Against what the form was filled in with, not just against the record.
     * A value nobody changed on this screen is never written — see
     * changedCustomerFields for the address this rule exists to protect.
     */
    const changes = changedCustomerFields(baseline, current, saved.current.shown ?? current);
    if (!changes) return;

    await updateCustomer.mutateAsync({ id, input: changes });
    // Only after it lands. Moving the baseline first would swallow the change
    // on a failure, and the next Next would think there was nothing to send.
    saved.current.customer = { ...baseline, ...changes };
    saved.current.shown = current;
    toast.success('Customer details updated');
  }

  /**
   * Records each line's design against the customer.
   *
   * A line with no `jobId` is a new design: it is created and its id written
   * back onto the line, which is what links the quotation to the job from then
   * on. A line that already has one is only updated if its design actually
   * moved. Either way the line ends up carrying the id, so stepping back and
   * forward again writes nothing.
   */
  async function persistDesigns() {
    const id = customerId;
    if (customerMode !== 'existing' || !id) return;

    let created = 0;
    let updated = 0;

    for (const [index, item] of (watched.items ?? []).entries()) {
      const line = {
        jobName: (item?.jobName as string) ?? '',
        jobKind: (item?.jobKind as string) ?? 'POUCH',
        pouchType: (item?.pouchType as string | null) ?? null,
        widthMm: num(item?.widthMm),
        heightMm: num(item?.heightMm),
        cylinderCount: num(item?.cylinderCount),
        microns: (item?.layers ?? []).map((layer) => num(layer?.micron)),
        pouchesPerKg: costed[index]?.geometry.pouchesPerKg ?? 0,
      };

      // A half-typed line is not a design. Saving one would leave the customer
      // holding something nameless for somebody to find and delete later.
      if (!isSaveableDesign(line)) continue;

      const payload = jobPayloadFromLine(line);
      const jobId = (item?.jobId as string | null) ?? null;
      const fingerprint = designFingerprint(payload);

      // Unchanged since it was last seen — nothing to send.
      if (jobId && saved.current.designs.get(jobId) === fingerprint) continue;

      const job = await saveJob.mutateAsync({ customerId: id, jobId, input: payload });

      /*
       * The id comes back and goes onto the line. This is the mapping: from
       * here on the quotation points at a real job, the cylinder section knows
       * it is a repeat, and winning the quotation will not create a second copy.
       */
      if (job.id !== jobId) {
        setValue(`items.${index}.jobId`, job.id, { shouldDirty: true });
        created += 1;
      } else {
        updated += 1;
      }
      saved.current.designs.set(job.id, fingerprint);
    }

    if (created > 0) toast.success(`${created} design${created > 1 ? 's' : ''} saved`);
    else if (updated > 0) toast.success('Design updated');
  }

  /** What each step writes on the way out. Steps not listed write nothing. */
  async function persistStep(leaving: number) {
    /*
     * DISABLED — writing customer details back from this form erased them.
     *
     * Observed four times against a real record: correct an existing
     * customer's district here, press Next, and their address, city, mobile
     * and brand were all stored as 'NA' while the district saved correctly.
     * The form's own boxes held the right values throughout — checked in the
     * DOM — so something between the form state and the request reported them
     * as empty, and an empty string is stored as 'NA'.
     *
     * Three fixes were tried and none of them stopped it: comparing against
     * what the form was populated with rather than the record, requiring
     * react-hook-form to mark the field dirty, and refusing to let an empty
     * value overwrite a stored one. The last of those should have made the
     * damage impossible on its own, and did not, which says the fault is not
     * where any of them looked.
     *
     * So it stays off until the cause is actually understood. Correcting a
     * customer is done on the Customers screen, which has always worked.
     * Saving designs is untouched — that half was verified and is correct.
     */
    if (leaving === 2) await persistDesigns();
  }

  async function goNext() {
    const fields = STEP_FIELDS[step] ?? [];
    if (fields.length > 0 && !(await trigger(fields))) return;

    /*
     * Saving must never cost the office their place in the form. If the network
     * is down the step still advances with a warning: everything typed is still
     * in the form, the final Save writes the whole quotation regardless, and
     * winning it creates any design that never made it. Blocking here would
     * strand somebody mid-quotation over a record they can fix later.
     */
    try {
      await persistStep(step);
    } catch (cause) {
      toast.error(
        cause instanceof ApiClientError
          ? `Could not save yet: ${cause.message}`
          : 'Could not save that yet — it will be saved with the quotation.',
      );
    }

    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((seen) => Math.max(seen, next));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Save, then show what the customer would get.
   *
   * **Nothing is sent from here.** `intent` decides only what happens after the
   * save: either back to the list, or the printed quotation on screen with a
   * Send button on it.
   *
   * The status is not touched. It used to be set to SENT by this button, which
   * made every quotation say it had been sent whether or not an email ever left
   * — and the office's own work queue is ordered by that status. Sending is what
   * advances it, and that happens once the provider accepts the message.
   */
  async function save(intent: 'CLOSE' | 'REVIEW') {
    await handleSubmit(async (values) => {
      const payload = {
        ...values,
        saveAsCustomer: customerMode === 'new',
        brandName: values.brandName ?? '',
        customerId: customerMode === 'existing' ? values.customerId : null,
      } as CreateQuotationInput;

      try {
        const saved = isEdit
          ? await updateQuotation.mutateAsync({ id: id!, input: payload })
          : await createQuotation.mutateAsync(payload);
        toast.success(`Quotation ${saved.number} saved`);
        setPreviewId(saved.id);
        setReviewing(intent === 'REVIEW' ? saved : null);
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
            {/* FieldSection stacks its children, so the grid has to be here. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <div className="flex flex-wrap gap-2 sm:col-span-12">
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
                      if (mode === customerMode) return;
                      setCustomerMode(mode);
                      clearCustomerFields();
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

              <div className="sm:col-span-7">
                {customerMode === 'existing' ? (
                  <>
                    <Field
                      label="Company"
                      htmlFor="customerId"
                      error={formState.errors.customerName?.message}
                    >
                      <Combobox
                        id="customerName"
                        options={customers.map((customer) => customer.companyName)}
                        registration={register('customerName')}
                        value={watched.customerName ?? ''}
                        invalid={Boolean(formState.errors.customerName)}
                        placeholder="Search company or brand…"
                        /*
                         * The list is already what the server matched, on
                         * company name OR brand. Filtering it again by company
                         * name here discarded every customer found by their
                         * brand — typing "Ashoka" returned ADF Foods Ltd from
                         * the API and then showed nothing at all.
                         */
                        filterLocally={false}
                        describe={(name) => {
                          const brand = customers.find((c) => c.companyName === name)?.brandName;
                          return brand && brand !== 'NA' ? brand : undefined;
                        }}
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
                  </>
                ) : (
                  <Field
                    label="Company name"
                    htmlFor="customerName"
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

              {/*
                Beside the company, on both paths.
                
                For an existing customer it arrives filled in and stays
                editable — a brand the office corrects here is written back to
                their record, the same way a corrected address already is. For a
                new company it is simply typed, and set when the record is
                created on save.
              */}
              <div className="sm:col-span-5">
                <Field label="Brand" htmlFor="brandName">
                  <Input id="brandName" placeholder="e.g. Ashoka" {...register('brandName')} />
                </Field>
              </div>
            </div>
          </FieldSection>
        ) : null}

        {step === 1 ? (
          <FieldSection
            title="Where it goes"
            description={
              customerMode === 'existing'
                ? 'Filled in from the customer list. Corrections apply to this quotation only — edit the customer to change their record.'
                : 'Typed once — the company joins the customer list when this saves.'
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              {/* The address is the one genuinely long field here; everything
                  else is a phone number or a code, and a box the width of the
                  page invites the eye to expect far more than it should. */}
              <div className="sm:col-span-8">
                <Field label="Address" htmlFor="addressLine1">
                  <Input id="addressLine1" {...register('addressLine1')} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="City" htmlFor="addressLine2">
                  <Input id="addressLine2" {...register('addressLine2')} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="District" htmlFor="addressLine3">
                  <Input id="addressLine3" {...register('addressLine3')} />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Mobile" htmlFor="mobile">
                  <Input id="mobile" inputMode="tel" {...register('mobile')} />
                </Field>
              </div>
              <div className="sm:col-span-5">
                <Field label="Email" htmlFor="email">
                  <Input id="email" type="email" {...register('email')} />
                </Field>
              </div>
              <div className="sm:col-span-8">
                {/*
                  Verify is offered here too, not only on the customer screen.
                  A new company is created from this form, and asking the office
                  to go and add them properly somewhere else first is how a
                  quotation ends up addressed to a name nobody checked.
                */}
                <GstinField
                  registration={register('gstNumber')}
                  value={(watched.gstNumber as string | undefined) ?? ''}
                  error={formState.errors.gstNumber?.message}
                  onApply={(lookup) => {
                    const set = (
                      field: 'customerName' | 'addressLine1' | 'addressLine2' | 'addressLine3',
                      value: string | null,
                    ) => {
                      // An empty answer from the registry is not a correction —
                      // never blank something the office already typed.
                      if (value)
                        setValue(field, value, { shouldDirty: true, shouldValidate: true });
                    };
                    /*
                     * The company name is only taken for a new company. On an
                     * existing one it is the link to their customer record, and
                     * rewriting it would quietly point the quotation at a name
                     * that no longer matches anything in the list.
                     */
                    if (customerMode === 'new') {
                      // Trade name first — see the customer form. A
                      // proprietorship's legal name is a person's name.
                      set('customerName', lookup.tradeName ?? lookup.legalName);
                    }
                    set('addressLine1', lookup.address);
                    set('addressLine2', lookup.city);
                    set('addressLine3', lookup.district);
                    toast.success('Filled in from the GST registry');
                  }}
                />
              </div>
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
                jobs={chosenCustomer?.jobs ?? []}
                item={watched.items?.[index] as Partial<ItemValues> | undefined}
                cost={costed[index]}
                errors={formState.errors.items?.[index] as JobErrors | undefined}
                canRemove={items.fields.length > 1}
                onRemove={() => items.remove(index)}
                selectedQuantity={selectedQuantity}
                onSelectQuantity={(position) =>
                  setValue('selectedQuantity', position as never, { shouldDirty: true })
                }
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

        {/*
          There is no terms step. The terms were the same six lines on every
          quotation this works has ever sent, and a seven-row textarea asking to
          confirm them was a step the office had to walk past to reach the
          totals. They are the company's standard set now, printed from the
          schema, and the date is simply today.
        */}
        {step === 3 ? (
          <ReviewStep
            items={(watched.items ?? []) as Partial<ItemValues>[]}
            costed={costed}
            tierTotals={tierTotals}
            gstPercent={settings?.gstPercent ?? 18}
            register={register}
            selectedQuantity={selectedQuantity}
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
              <Button variant="secondary" onClick={() => void save('CLOSE')} loading={busy}>
                Save as draft
              </Button>
              <Button onClick={() => void save('REVIEW')} loading={busy}>
                <Check className="size-4" />
                Save and send
              </Button>
            </div>
          )}
        </div>
      </form>

      {/*
       * The saved quotation, exactly as it prints, with Send on it.
       *
       * `onSend` is passed only when the office asked to send — pressing Save
       * as draft opens the same preview without it, because offering Send there
       * would make "draft" and "send" the same button with different wording.
       */}
      <QuotationPreview
        id={previewId}
        onSend={
          reviewing
            ? () => {
                /*
                 * The preview closes before the dialog opens, matching the list.
                 * `Modal` installs its own Escape handler and focus trap, so two
                 * at once fight over both — Escape would dismiss whichever
                 * bound last rather than the one on top.
                 */
                setPreviewId(null);
                setSending(reviewing);
              }
            : undefined
        }
        onClose={() => {
          setPreviewId(null);
          setReviewing(null);
          navigate('/quotations');
        }}
      />

      {/*
       * Who it goes to, asked after the document has been looked at rather than
       * before. The dialog owns the actual send; this screen never sends.
       *
       * Closing it leaves for the list either way. The quotation is saved by
       * this point, so staying on a wizard whose work is already recorded would
       * invite a second save of the same document.
       */}
      <SendQuotationModal
        quotation={sending}
        onClose={() => {
          setSending(null);
          setReviewing(null);
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
  jobs,
  item,
  cost,
  errors,
  canRemove,
  onRemove,
  selectedQuantity,
  onSelectQuantity,
}: {
  index: number;
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  films: Film[];
  /** The chosen customer's saved jobs. Empty for a new company. */
  jobs: CustomerJob[];
  item: Partial<ItemValues> | undefined;
  cost: ItemCosting | undefined;
  errors: JobErrors | undefined;
  canRemove: boolean;
  onRemove: () => void;
  /** Quotation-wide: which quantity the customer is quoted, 1-based. */
  selectedQuantity: number;
  onSelectQuantity: (position: number) => void;
}) {
  const jobKind = (item?.jobKind ?? 'POUCH') as 'POUCH' | 'ROLL';
  const pouchType = (item?.pouchType || null) as PouchType | null;
  const basis = basisOf(item);

  /*
   * Whether the office has taken the repeats over.
   *
   * Held here rather than in the form, because it is about how this screen is
   * being used and not about the quotation: a saved document records the
   * repeats it was priced with, and nothing about who typed them.
   *
   * Once set it stays set for the life of the card. Suggesting again after
   * someone has decided would quietly undo their decision the next time the
   * size is touched, which is worse than not suggesting at all.
   */
  const [repeatsTaken, setRepeatsTaken] = useState(false);

  /** False on a repeat order, whose cylinders already exist. */
  const charged = item?.chargeCylinders !== false;

  /*
   * The film the cylinder actually carries — the pouch plus any gusset.
   *
   * Read from the costed geometry rather than recomputed, so the suggestion and
   * the cylinder size it produces cannot disagree.
   */
  const filmWidthMm = cost?.geometry.filmWidthMm ?? 0;
  const filmHeightMm = cost?.geometry.filmHeightMm ?? 0;

  /**
   * Fill the repeats in as the size is typed, until the office says otherwise.
   *
   * The circumference is the design's height times the repeat, so the repeat is
   * what decides whether the job lands on a cylinder the works owns. Left at 1,
   * a 250mm pouch asks for a 250mm cylinder — below anything in the racks — and
   * the cylinder cost that follows is wrong by whatever the real one would be.
   *
   * Only for a design being charged for. A repeat order's cylinders exist, and
   * their size is a fact about what was engraved rather than something to work
   * out again from the size on screen.
   */
  useEffect(() => {
    if (repeatsTaken || !charged) return;
    if (filmWidthMm <= 0 || filmHeightMm <= 0) return;

    const width = suggestRepeatWidth(filmWidthMm);
    const height = suggestRepeatHeight(filmHeightMm);

    /*
     * Compared before writing, and that comparison is what stops this looping.
     *
     * The effect depends on `item`, which its own `setValue` changes — so it
     * runs again after every write. Writing only on a difference means the
     * second run is a no-op and it settles, where writing unconditionally would
     * not. Written as strings, matching every other number the form holds while
     * it is being typed; the schema coerces on submit.
     */
    if (num(item?.repeatWidth) !== width) {
      setValue(`items.${index}.repeatWidth`, String(width) as never, { shouldDirty: true });
    }
    if (num(item?.repeatHeight) !== height) {
      setValue(`items.${index}.repeatHeight`, String(height) as never, { shouldDirty: true });
    }
  }, [filmWidthMm, filmHeightMm, repeatsTaken, charged, index, setValue, item]);

  /*
   * Whether this line is quoted for cylinders.
   *
   * Keyed on `chargeCylinders`, not on whether the line has a job id. Those
   * were the same thing until the wizard began saving new designs as the office
   * steps past them — after which a brand-new design acquires an id
   * immediately, and keying on that silently stopped charging for the very
   * cylinders it had just been decided needed cutting.
   *
   * Picking a saved job from the dropdown sets it false: that design's
   * cylinders are already in the works. A new design leaves it true, whoever is
   * ordering and whether or not it has been recorded yet.
   */
  const fromSavedJob = item?.chargeCylinders === false;

  /** Copies a saved job's specification onto this line. */
  function applyJob(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);

    /*
     * "New design" starts clean. Leaving the previous job's name and dimensions
     * behind is how a new design gets saved under an existing job's name, which
     * is far harder to notice than an empty box.
     *
     * The quantities are left alone: what to charge is the office's decision
     * about this order, not part of the design being described.
     */
    if (!job) {
      setValue(`items.${index}.jobId`, null, { shouldDirty: true });
      setValue(`items.${index}.jobName`, BLANK_DESIGN.jobName, { shouldDirty: true });
      setValue(`items.${index}.chargeCylinders`, true, { shouldDirty: true });
      setValue(
        `items.${index}.layers`,
        BLANK_DESIGN.layers.map((layer) => ({ ...layer })) as unknown as ItemValues['layers'],
        { shouldDirty: true },
      );
      for (const field of [
        'widthMm',
        'heightMm',
        'repeatWidth',
        'repeatHeight',
        'cylinderCount',
        'transportCost',
      ] as const) {
        setNumber(setValue, `items.${index}.${field}`, BLANK_DESIGN[field]);
      }
      return;
    }

    setValue(`items.${index}.jobId`, job.id, { shouldDirty: true });
    setValue(`items.${index}.jobName`, job.jobName, { shouldDirty: true });
    setValue(`items.${index}.chargeCylinders`, false, { shouldDirty: true });

    if (job.designOpenWidth) setNumber(setValue, `items.${index}.widthMm`, job.designOpenWidth);
    if (job.designHeight) setNumber(setValue, `items.${index}.heightMm`, job.designHeight);
    if (job.totalCylinders) {
      setNumber(setValue, `items.${index}.cylinderCount`, job.totalCylinders);
    }

    /*
     * The jobs table keeps three fixed thicknesses — the printed ply, an
     * optional metallised one, and the sealant. Rebuild the structure from
     * whichever of them the job has; the materials are left for the office to
     * confirm, because the job record never stored which film was used.
     */
    const microns = [job.petMicron, job.metPetMicron, job.polyMicron]
      .map((value) => Number(value ?? 0))
      .filter((value) => value > 0);

    if (microns.length >= 2) {
      setValue(
        `items.${index}.layers`,
        microns.map((micron) => ({ materialId: null, micron })) as ItemValues['layers'],
        { shouldDirty: true },
      );
    }
  }

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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-12">
        {/*
          A customer with jobs on record gets to pick one rather than retype it.
          Choosing one fills in the size, the structure and the cylinder count,
          and marks the line as a repeat so it is not quoted for cylinders.
        */}
        {jobs.length > 0 ? (
          <div className="col-span-2 sm:col-span-5">
            <Field label="Saved job" htmlFor={`items.${index}.jobId`}>
              <Select
                id={`items.${index}.jobId`}
                value={item?.jobId ?? ''}
                onChange={(event) => applyJob(event.target.value)}
              >
                <option value="">— New design —</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <div className={cn('col-span-2', jobs.length > 0 ? 'sm:col-span-4' : 'sm:col-span-6')}>
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
        <div className="sm:col-span-2">
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
        <div className="sm:col-span-2">
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

        {/*
          Type and style are two questions, not one.
          
          They were merged into a single list for a while, which read tidily and
          hid the thing that matters most: a roll is not a pouch at all. It is
          film on a reel, it has no style, and nothing about it is counted in
          pieces. Asking Type first makes that a decision rather than an option
          buried at the bottom of eight.
        */}
        <div className="col-span-1 sm:col-span-3">
          <Field label="Type" htmlFor={`items.${index}.jobKind`}>
            <Select
              id={`items.${index}.jobKind`}
              value={jobKind}
              onChange={(event) => {
                const nextKind = event.target.value as 'POUCH' | 'ROLL';
                setValue(`items.${index}.jobKind`, nextKind as ItemValues['jobKind'], {
                  shouldDirty: true,
                });

                /*
                 * A roll has no style and no gusset — nothing has been
                 * converted. Clearing them here rather than rejecting the
                 * combination means switching Pouch to Roll is not an error the
                 * office has to go and clear; the schema does the same on the
                 * way in, so a request cannot smuggle them back.
                 */
                const nextPouchType = nextKind === 'ROLL' ? null : (pouchType ?? 'STANDUP');
                setValue(`items.${index}.pouchType`, nextPouchType as ItemValues['pouchType'], {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                if (nextKind === 'ROLL') {
                  setValue(`items.${index}.isGazette`, false, { shouldDirty: true });
                }
                setValue(
                  `items.${index}.pricingBasis`,
                  pricingBasisFor(nextKind, nextPouchType) as ItemValues['pricingBasis'],
                  { shouldDirty: true },
                );
              }}
            >
              {JOB_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {JOB_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Only a pouch has a style. A roll is just film. */}
        {jobKind === 'POUCH' ? (
          <div className="col-span-1 sm:col-span-3">
            <Field
              label="Pouch type"
              htmlFor={`items.${index}.pouchType`}
              error={errors?.pouchType?.message}
            >
              <Select
                id={`items.${index}.pouchType`}
                value={pouchType ?? ''}
                invalid={Boolean(errors?.pouchType)}
                onChange={(event) => {
                  const next = (event.target.value || null) as PouchType | null;
                  setValue(`items.${index}.pouchType`, next as ItemValues['pouchType'], {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  /*
                   * The style resets the unit to the trade's convention for it.
                   * Landing on the conventional answer is what someone who never
                   * touches the switch expects.
                   */
                  setValue(
                    `items.${index}.pricingBasis`,
                    pricingBasisFor('POUCH', next) as ItemValues['pricingBasis'],
                    { shouldDirty: true },
                  );
                }}
              >
                <option value="">— Choose —</option>
                {POUCH_TYPES.map((style) => (
                  <option key={style} value={style}>
                    {POUCH_TYPE_LABELS[style]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {pouchType === 'OTHER' ? (
          <div className="col-span-2 sm:col-span-5">
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

        {/*
          A gazette gussets at the sides and the base so the pouch stands.
          
          Off by default, because most jobs are flat bags. The three depths are
          film the flat sheet has to carry, so they enlarge the weight — fewer
          pouches to the kilogram — and the cylinder, which prints that film.
          Hidden entirely on a roll: nothing has been converted.
        */}
        {jobKind === 'POUCH' ? (
          <div className="col-span-2 sm:col-span-12">
            <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="accent-brand-600 size-4 cursor-pointer"
                  checked={item?.isGazette === true}
                  onChange={(event) =>
                    setValue(`items.${index}.isGazette`, event.target.checked, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <span className="text-ink-800 text-sm font-medium">Gazette pouch</span>
              </label>

              {item?.isGazette ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-12">
                  {(
                    [
                      ['gazetteBottom', 'Bottom gazette'],
                      ['gazetteLeft', 'Left gazette'],
                      ['gazetteRight', 'Right gazette'],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="sm:col-span-2">
                      <Field
                        label={label}
                        htmlFor={`items.${index}.${field}`}
                        error={errors?.[field]?.message}
                      >
                        <Input
                          id={`items.${index}.${field}`}
                          inputMode="decimal"
                          invalid={Boolean(errors?.[field])}
                          {...register(`items.${index}.${field}`)}
                        />
                      </Field>
                    </div>
                  ))}

                  {/*
                    The film, spelled out. On a gazette the pouch's own
                    dimensions no longer explain the weight or the cylinder, and
                    this is the number that does.
                  */}
                  <div className="col-span-2 sm:col-span-6">
                    <Field label="Film size" htmlFor={`items.${index}.filmSize`}>
                      <ReadOnlyValue
                        value={`${formatNumber(cost?.geometry.filmWidthMm ?? 0)} × ${formatNumber(
                          cost?.geometry.filmHeightMm ?? 0,
                        )}`}
                      />
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="col-span-2 sm:col-span-12">
          <LayerFields
            control={control}
            register={register}
            setValue={setValue}
            itemIndex={index}
            films={films}
            errors={errors?.layers as never}
          />
        </div>

        <div className="col-span-2 sm:col-span-12">
          <QuantityFields
            control={control}
            register={register}
            itemIndex={index}
            pricingBasis={basis}
            showsPouches={jobKind !== 'ROLL'}
            onBasisChange={
              jobKind === 'ROLL'
                ? undefined
                : (next) =>
                    setValue(`items.${index}.pricingBasis`, next as ItemValues['pricingBasis'], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
            }
            results={cost?.quantities ?? []}
            errors={errors?.quantities as never}
            selectedQuantity={selectedQuantity}
            onSelectQuantity={onSelectQuantity}
          />
        </div>

        {fromSavedJob ? (
          <div className="col-span-2 sm:col-span-12">
            <p className="border-ink-200 text-ink-500 rounded-[var(--radius-md)] border border-dashed px-3 py-2.5 text-sm">
              Repeat of a saved design —{' '}
              <strong className="text-ink-800">no cylinder charge</strong>. Cylinders for{' '}
              {item?.jobName || 'this job'} are already in the works.
            </p>
          </div>
        ) : (
          <div className="col-span-2 sm:col-span-12">
            <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                  Cylinders
                </span>
                <div className="flex items-center gap-3">
                  {/*
                   * Said out loud, because a box that fills itself in is
                   * otherwise indistinguishable from one somebody already typed
                   * — and the office needs to know whether the figure is theirs
                   * before they trust it. Once they change one, the label goes
                   * and stays gone.
                   */}
                  {repeatsTaken ? (
                    <button
                      type="button"
                      onClick={() => setRepeatsTaken(false)}
                      className="text-brand-600 hover:text-brand-700 cursor-pointer text-xs underline underline-offset-2"
                    >
                      Fit to the size again
                    </button>
                  ) : (
                    <span className="text-ink-400 text-xs">Fitted to the size</span>
                  )}
                  <span className="text-ink-400 text-xs">New design — charged once</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  {/*
                   * "Repeat width" read as a measurement — a width in
                   * millimetres — when it is a count of how many pouches sit
                   * side by side across the web. "Ups" is the works' own word
                   * for it and the column the jobs table has always used.
                   */}
                  <Field label="Ups across" htmlFor={`items.${index}.repeatWidth`}>
                    <Input
                      id={`items.${index}.repeatWidth`}
                      inputMode="decimal"
                      {...register(`items.${index}.repeatWidth`, {
                        onChange: () => setRepeatsTaken(true),
                      })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Repeats around" htmlFor={`items.${index}.repeatHeight`}>
                    <Input
                      id={`items.${index}.repeatHeight`}
                      inputMode="decimal"
                      {...register(`items.${index}.repeatHeight`, {
                        onChange: () => setRepeatsTaken(true),
                      })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Cylinders" htmlFor={`items.${index}.cylinderCount`}>
                    <Input
                      id={`items.${index}.cylinderCount`}
                      inputMode="numeric"
                      {...register(`items.${index}.cylinderCount`)}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Transport" htmlFor={`items.${index}.transportCost`} hint="Optional">
                    <Input
                      id={`items.${index}.transportCost`}
                      inputMode="decimal"
                      {...register(`items.${index}.transportCost`)}
                    />
                  </Field>
                </div>
                {/*
                  The working, not just the answer.
                  
                  A cylinder is charged by the area it is engraved over, so the
                  size comes first: width is the pouch across the repeat plus an
                  80mm margin for the gripper, circumference is the pouch down
                  the repeat. These were dropped when the form became a wizard,
                  which left the office with a total and no way to see where it
                  came from — and no way to spot a repeat typed wrong.
                */}
                <div className="sm:col-span-3">
                  <Field label="Cylinder width" htmlFor={`items.${index}.cylinderWidth`}>
                    <ReadOnlyValue value={formatNumber(cost?.geometry.cylinderWidth ?? 0)} />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field
                    label="Cylinder circumference"
                    htmlFor={`items.${index}.cylinderCircumference`}
                  >
                    <ReadOnlyValue
                      value={formatNumber(cost?.geometry.cylinderCircumference ?? 0)}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Cost per cylinder" htmlFor={`items.${index}.costPerCylinder`}>
                    <ReadOnlyValue value={formatRs(cost?.geometry.costPerCylinder ?? 0)} />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Total cylinder cost" htmlFor={`items.${index}.totalCylinderCost`}>
                    <ReadOnlyValue value={formatRs(cost?.geometry.totalCylinderCost ?? 0)} />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewStep({
  items,
  costed,
  tierTotals,
  gstPercent,
  register,
  selectedQuantity,
}: {
  items: Partial<ItemValues>[];
  costed: ItemCosting[];
  tierTotals: ReturnType<typeof computeTotals>[];
  gstPercent: number;
  register: UseFormRegister<CreateQuotationFormValues>;
  selectedQuantity: number;
}) {
  /*
   * The step is called "What the customer sees", so it shows one column.
   *
   * The others were priced to find out what volume does to the margin, which is
   * the office's business. Showing all three here and one on the PDF would make
   * this screen a rehearsal of a different document.
   */
  const priced = tierTotals.length;
  const chosen = Math.min(Math.max(selectedQuantity, 1), Math.max(priced, 1)) - 1;
  const total = tierTotals[chosen];

  return (
    <div className="flex flex-col gap-5">
      <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        <div className="border-ink-100 border-b px-4 py-3">
          <h2 className="text-ink-900 text-base font-semibold">What the customer sees</h2>
          <p className="text-ink-500 mt-0.5 text-sm">
            {priced > 1
              ? `Quoted at quantity ${chosen + 1}. The other ${priced - 1} ${
                  priced === 2 ? 'was' : 'were'
                } priced to compare and stay off the document — go back to Jobs to quote a different one.`
              : 'Priced at one quantity.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-ink-50 text-ink-500 text-xs tracking-wide uppercase">
                <th className="px-4 py-2 text-left font-semibold">Job</th>
                <th className="px-4 py-2 text-right font-semibold">Quantity {chosen + 1}</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {items.map((item, index) => (
                <tr key={index}>
                  <td className="text-ink-800 px-4 py-2.5">
                    {item?.jobName || `Job ${index + 1}`}
                  </td>
                  <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                    {formatRs(costed[index]?.quantities[chosen]?.totalAmount ?? 0)}
                  </td>
                </tr>
              ))}
              <tr className="bg-ink-50/70">
                <td className="text-ink-800 px-4 py-2.5 font-medium">Cylinders</td>
                <td className="text-ink-800 px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatRs(total?.cylinderSubtotal ?? 0)}
                </td>
              </tr>
              <tr className="bg-brand-50/60">
                <td className="text-ink-900 px-4 py-3 font-semibold">
                  Total including {gstPercent}% GST
                </td>
                <td className="text-ink-900 px-4 py-3 text-right font-semibold tabular-nums">
                  {formatRs(total?.grandWithGst ?? 0)}
                </td>
              </tr>
              <tr>
                <td className="text-ink-500 px-4 py-2.5">Advance</td>
                <td className="text-ink-600 px-4 py-2.5 text-right tabular-nums">
                  {formatRs(total?.totalAdvance ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/*
        Notes lost their step along with the terms, but not their purpose: a
        line about a sample or a delivery week belongs on the document, and this
        is the last screen before it goes out. Left empty, nothing is printed.
      */}
      <FieldSection
        title="Anything to add?"
        description="Optional. Printed under the totals on the quotation."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <div className="sm:col-span-12">
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" rows={3} {...register('notes')} />
            </Field>
          </div>
        </div>
      </FieldSection>

      <p className="text-ink-500 text-sm">
        Saving as a draft keeps it editable. Saving and sending opens the printed quotation so you
        can check it before it goes out.
      </p>
    </div>
  );
}
