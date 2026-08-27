import { useEffect } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerSchema,
  type CreateCustomerFormValues,
  type CreateCustomerInput,
  type Customer,
  type CustomerJob,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Field, FieldSection, Input, Textarea } from '@/components/ui/Field';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import { useCreateCustomer, useCustomer, useUpdateCustomer } from '../api/customer-api';
import { JobCard } from './JobCard';

/** 'NA' is the legacy placeholder — show an empty box instead of the word. */
function fromNA(value: string | null | undefined): string {
  return !value || value === 'NA' ? '' : value;
}

type JobFormValues = NonNullable<CreateCustomerFormValues['jobs']>[number];

/**
 * A blank form starts genuinely blank. The schema turns an empty box back into
 * 'NA' on submit, so pre-filling the literal text would only force the user to
 * delete it before they can type.
 */
const EMPTY: CreateCustomerFormValues = {
  companyName: '',
  contactPerson: '',
  address: '',
  city: '',
  district: '',
  pincode: '',
  mobile: '',
  altPhone: '',
  email: '',
  isVerified: false,
  jobs: [],
};

const BLANK_JOB = { jobName: '', jobType: 'NA' } as JobFormValues;

/** Fields the system owns: never sent back, never editable. */
const DERIVED_FIELDS = new Set(['id', 'jobCode', 'compositeGsm', 'pouchesPerKg']);

/** Maps an API job onto form values, blanking every 'NA' and null. */
function toFormJob(job: CustomerJob): JobFormValues {
  const form: Record<string, unknown> = { id: job.id };
  for (const [key, value] of Object.entries(job)) {
    if (DERIVED_FIELDS.has(key)) continue;
    form[key] = fromNA(value as string | null);
  }
  form['jobName'] = job.jobName;
  form['jobType'] =
    job.jobType === 'Pouch Form' || job.jobType === 'Roll Form' ? job.jobType : 'NA';
  return form as JobFormValues;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Passing a customer switches the dialog to edit mode. */
  customer: Customer | null;
}

export function CustomerFormModal({ open, onClose, customer }: Props) {
  const isEdit = customer !== null;
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  // Jobs live on the detail endpoint, so they are only fetched when a row is
  // actually opened for editing.
  const { data: detail, isPending: detailLoading } = useCustomer(customer?.id ?? null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
    // TFieldValues is the pre-default shape; the resolver transforms it into
    // CreateCustomerInput before onSubmit sees it.
  } = useForm<CreateCustomerFormValues, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: EMPTY,
  });

  const jobFields = useFieldArray({ control, name: 'jobs' });

  // Drives each card's summary line and its calculated fields as the user types.
  const watchedJobs = useWatch({ control, name: 'jobs' });

  /**
   * Mirrors the server's formulas so the calculated fields update while typing.
   * The server recomputes both on save and its value wins — this is feedback,
   * not the source of truth.
   */
  function deriveFor(index: number) {
    const job = watchedJobs?.[index];
    const toNumber = (value: unknown) => {
      const parsed = Number(value);
      return value === '' || value === null || value === undefined || !Number.isFinite(parsed)
        ? null
        : parsed;
    };

    const layers = [job?.inkGsm, job?.petGsm, job?.metPetGsm, job?.polyGsm, job?.adhesiveGsm].map(
      toNumber,
    );
    const compositeGsm = layers.some((value) => value !== null)
      ? Number(layers.reduce<number>((total, value) => total + (value ?? 0), 0).toFixed(3))
      : null;

    const height = toNumber(job?.designHeight);
    const width = toNumber(job?.designOpenWidth);
    const pouchesPerKg =
      compositeGsm && compositeGsm > 0 && height && height > 0 && width && width > 0
        ? (1_000_000_000 / (height * width * compositeGsm)).toFixed(2)
        : null;

    return { compositeGsm: compositeGsm === null ? null : String(compositeGsm), pouchesPerKg };
  }

  // Refill the form whenever a different row is opened, and again once that
  // customer's jobs have loaded.
  useEffect(() => {
    if (!open) return;
    reset(
      customer
        ? {
            companyName: customer.companyName,
            contactPerson: fromNA(customer.contactPerson),
            address: fromNA(customer.address),
            city: fromNA(customer.city),
            district: fromNA(customer.district),
            pincode: fromNA(customer.pincode),
            mobile: fromNA(customer.mobile),
            altPhone: fromNA(customer.altPhone),
            email: fromNA(customer.email),
            isVerified: customer.isVerified,
            jobs: (detail?.jobs ?? []).map(toFormJob),
          }
        : EMPTY,
    );
  }, [open, customer, detail, reset]);

  async function onSubmit(values: CreateCustomerInput) {
    try {
      if (isEdit) {
        await updateCustomer.mutateAsync({ id: customer.id, input: values });
        toast.success(`${values.companyName} updated`);
      } else {
        await createCustomer.mutateAsync(values);
        toast.success(`${values.companyName} added`);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        // Map server-side field errors back onto the matching inputs.
        const entries = Object.entries(error.fields);
        for (const [field, message] of entries) {
          setError(field as keyof CreateCustomerFormValues, { type: 'server', message });
        }
        if (entries.length === 0) toast.error(error.message);
        return;
      }
      toast.error('Could not save the customer');
    }
  }

  const jobCount = jobFields.fields.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEdit ? `Edit ${customer.companyName}` : 'Add customer'}
      description="Anything left blank is saved as NA. Only the company name and each job's name are required."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="customer-form"
            loading={isSubmitting}
            disabled={isEdit && !isDirty}
          >
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form
        id="customer-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        noValidate
      >
        <FieldSection title="Company" description="Who the customer is and how to reach them.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <Field
                label="Company name"
                htmlFor="companyName"
                required
                error={errors.companyName?.message}
              >
                <Input
                  id="companyName"
                  autoComplete="off"
                  placeholder="e.g. Bunty Food Products"
                  invalid={Boolean(errors.companyName)}
                  {...register('companyName')}
                />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field
                label="Contact person"
                htmlFor="contactPerson"
                error={errors.contactPerson?.message}
              >
                <Input id="contactPerson" autoComplete="off" {...register('contactPerson')} />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field
                label="Mobile"
                htmlFor="mobile"
                hint="10 digits, starting 6-9"
                error={errors.mobile?.message}
              >
                <Input
                  id="mobile"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="9876543210"
                  invalid={Boolean(errors.mobile)}
                  {...register('mobile')}
                />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field
                label="GST number"
                htmlFor="gstNumber"
                hint="Carried onto their quotations"
                error={errors.gstNumber?.message}
              >
                {/* Upper-cased by the schema — it is printed and read back aloud. */}
                <Input
                  id="gstNumber"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="27ABCDE1234F1Z5"
                  invalid={Boolean(errors.gstNumber)}
                  {...register('gstNumber')}
                />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field
                label="Alternate phone"
                htmlFor="altPhone"
                hint="Extra mobiles or landlines"
                error={errors.altPhone?.message}
              >
                <Input
                  id="altPhone"
                  autoComplete="off"
                  invalid={Boolean(errors.altPhone)}
                  {...register('altPhone')}
                />
              </Field>
            </div>

            <div className="sm:col-span-4">
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </Field>
            </div>
          </div>
        </FieldSection>

        <FieldSection title="Address">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-12">
              <Field label="Address" htmlFor="address" error={errors.address?.message}>
                <Textarea id="address" rows={2} {...register('address')} />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field label="City / Taluka" htmlFor="city" error={errors.city?.message}>
                <Input id="city" autoComplete="off" {...register('city')} />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field label="District" htmlFor="district" error={errors.district?.message}>
                <Input id="district" autoComplete="off" {...register('district')} />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field
                label="Pincode"
                htmlFor="pincode"
                hint="6 digits"
                error={errors.pincode?.message}
              >
                <Input
                  id="pincode"
                  inputMode="numeric"
                  autoComplete="off"
                  invalid={Boolean(errors.pincode)}
                  {...register('pincode')}
                />
              </Field>
            </div>
          </div>
        </FieldSection>

        {/* ---- Jobs ---------------------------------------------------- */}
        <section className="border-ink-200 border-t pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
                Jobs {jobCount > 0 ? `(${jobCount})` : ''}
              </h4>
              <p className="text-ink-500 mt-0.5 max-w-xl text-xs">
                Everything this customer orders, with its full specification. Click a job to open
                it. Removing a job does not delete it — it returns to the &ldquo;needs a
                customer&rdquo; list.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => jobFields.append(BLANK_JOB)}
            >
              <Plus className="size-4" />
              Add job
            </Button>
          </div>

          {isEdit && detailLoading ? (
            <div className="text-ink-400 flex items-center gap-2 py-6 text-sm">
              <Spinner size="sm" />
              Loading jobs…
            </div>
          ) : jobCount === 0 ? (
            <p className="text-ink-500 border-ink-200 mt-4 rounded-[var(--radius-md)] border border-dashed px-4 py-8 text-center text-sm">
              No jobs yet. Use <span className="font-medium">Add job</span> to record what this
              customer orders.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {jobFields.fields.map((field, index) => {
                const watched = watchedJobs?.[index];
                // The code belongs to the saved job, not to the form.
                const savedJob = detail?.jobs.find((job) => job.id === watched?.id);
                return (
                  <JobCard
                    key={field.id}
                    index={index}
                    register={register}
                    errors={errors}
                    setValue={setValue}
                    watch={watch}
                    onRemove={() => jobFields.remove(index)}
                    summary={{
                      jobName: String(watched?.jobName ?? ''),
                      jobCode: savedJob?.jobCode ?? '',
                      jobType: String(watched?.jobType ?? 'NA'),
                    }}
                    derived={deriveFor(index)}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <div className="border-ink-200 border-t pt-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-brand-600 mt-0.5 size-4 cursor-pointer"
              {...register('isVerified')}
            />
            <span className="text-ink-700">
              Details confirmed
              <span className="text-ink-400 block text-xs">
                Tick once the address and phone number have been checked with the customer.
              </span>
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
