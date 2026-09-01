import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Layers3 } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  type CreateQuotationFormValues,
  type PricingBasis,
} from '@yuva/shared';
import { Field, Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * The quantities this line is priced at.
 *
 * A customer asking "and if we took fifty thousand?" used to mean a second
 * quotation. Two or three quantities on one document answers it in the same
 * breath, and answers it honestly: the cylinders cost the same in every column,
 * so the per-pouch figure genuinely falls as the order grows.
 *
 * Which pair is typed depends on the construction, not on a choice made here —
 * standup and standup-zipper are sold by the piece, everything else by weight.
 */

/** What each quantity works out to, computed live so nothing is a surprise. */
export interface QuantityResult {
  quantityKg: number;
  totalPouches: number;
  totalAmount: number;
  costPerPouch: number;
  marginPercent: number | null;
}

export function QuantityFields({
  control,
  register,
  itemIndex,
  pricingBasis,
  results,
  errors,
}: {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  itemIndex: number;
  pricingBasis: PricingBasis;
  /** One per row, in order. Absent entries render as blanks, not zeroes. */
  results: (QuantityResult | undefined)[];
  errors?: Record<string, { message?: string } | undefined>[];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.quantities`,
  });

  const perPouch = pricingBasis === 'PER_POUCH';
  const quantityField = perPouch ? 'quantityPouches' : 'quantityKg';
  const rateField = perPouch ? 'ratePerPouch' : 'ratePerKg';

  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-ink-500 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Layers3 className="size-3.5" aria-hidden />
          Quantities
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-400 text-xs">
            {perPouch ? 'Sold per pouch' : 'Sold per kilogram'}
          </span>
          {fields.length < 3 ? (
            <button
              type="button"
              onClick={() =>
                append({ quantityKg: 0, ratePerKg: 0, quantityPouches: 0, ratePerPouch: 0 })
              }
              className="border-ink-200 text-ink-600 hover:bg-ink-50 focus-visible:ring-brand-500 rounded-[var(--radius-sm)] border bg-white px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              Add a quantity
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {fields.map((field, index) => {
          const result = results[index];

          return (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
              <div className="col-span-1 sm:col-span-2">
                <Field
                  label={`Quantity ${index + 1}`}
                  htmlFor={`items.${itemIndex}.quantities.${index}.${quantityField}`}
                  hint={perPouch ? 'pouches' : 'kg'}
                  error={errors?.[index]?.[quantityField]?.message}
                >
                  <Input
                    id={`items.${itemIndex}.quantities.${index}.${quantityField}`}
                    inputMode="decimal"
                    invalid={Boolean(errors?.[index]?.[quantityField])}
                    {...register(`items.${itemIndex}.quantities.${index}.${quantityField}`)}
                  />
                </Field>
              </div>

              <div className="col-span-1 sm:col-span-2">
                <Field
                  label={`Rate ${index + 1}`}
                  htmlFor={`items.${itemIndex}.quantities.${index}.${rateField}`}
                  hint={perPouch ? 'per pouch' : 'per kg'}
                  error={errors?.[index]?.[rateField]?.message}
                >
                  <Input
                    id={`items.${itemIndex}.quantities.${index}.${rateField}`}
                    inputMode="decimal"
                    invalid={Boolean(errors?.[index]?.[rateField])}
                    {...register(`items.${itemIndex}.quantities.${index}.${rateField}`)}
                  />
                </Field>
              </div>

              {/*
               * What that quantity comes to. Live, because the office is
               * choosing a price here and the margin is the thing they are
               * actually watching.
               */}
              <div className="col-span-2 sm:col-span-7">
                <div className="text-ink-500 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-2 text-xs">
                  {result ? (
                    <>
                      <span className="text-ink-800 font-medium">
                        {formatRs(result.totalAmount)}
                      </span>
                      <span>
                        {perPouch
                          ? `${formatNumber(result.quantityKg, 2)} kg`
                          : `${formatNumber(result.totalPouches)} pouches`}
                      </span>
                      {result.marginPercent === null ? (
                        <span className="text-ink-400">margin —</span>
                      ) : (
                        <span
                          className={cn(
                            'font-medium',
                            result.marginPercent < 15 ? 'text-warning-600' : 'text-success-600',
                          )}
                        >
                          {formatNumber(result.marginPercent, 1)}% margin
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-300">&mdash;</span>
                  )}
                </div>
              </div>

              <div className="col-span-2 pb-2.5 sm:col-span-1">
                {fields.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove quantity ${index + 1}`}
                    className="text-ink-400 hover:text-danger-600 focus-visible:ring-brand-500 rounded px-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
