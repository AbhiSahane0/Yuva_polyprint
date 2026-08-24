import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerSchema,
  type CreateCustomerFormValues,
  type CreateCustomerInput,
  type Customer,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import { useCreateCustomer, useUpdateCustomer } from '../api/customer-api';

/** 'NA' is the legacy placeholder — show an empty box instead of the word. */
function fromNA(value: string | undefined): string {
  return !value || value === 'NA' ? '' : value;
}

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
};

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

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
    // TFieldValues is the pre-default shape; the resolver transforms it into
    // CreateCustomerInput before onSubmit sees it.
  } = useForm<CreateCustomerFormValues, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: EMPTY,
  });

  // Refill the form whenever a different row is opened.
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
          }
        : EMPTY,
    );
  }, [open, customer, reset]);

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit customer' : 'Add customer'}
      description={
        isEdit
          ? 'Blank fields are stored as NA, matching the imported spreadsheet.'
          : 'Only the company name is required — the rest can be filled in later.'
      }
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
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <div className="sm:col-span-2">
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

        <Field label="Contact person" htmlFor="contactPerson" error={errors.contactPerson?.message}>
          <Input id="contactPerson" autoComplete="off" {...register('contactPerson')} />
        </Field>

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

        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Address" htmlFor="address" error={errors.address?.message}>
            <Textarea id="address" rows={2} {...register('address')} />
          </Field>
        </div>

        <Field label="City / Taluka" htmlFor="city" error={errors.city?.message}>
          <Input id="city" autoComplete="off" {...register('city')} />
        </Field>

        <Field label="District" htmlFor="district" error={errors.district?.message}>
          <Input id="district" autoComplete="off" {...register('district')} />
        </Field>

        <Field label="Pincode" htmlFor="pincode" hint="6 digits" error={errors.pincode?.message}>
          <Input
            id="pincode"
            inputMode="numeric"
            autoComplete="off"
            invalid={Boolean(errors.pincode)}
            {...register('pincode')}
          />
        </Field>

        <div className="flex items-end sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="accent-brand-600 size-4"
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
