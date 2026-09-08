import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Layers3 } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  marginsAt,
  type CostingBreakdown,
  type CreateQuotationFormValues,
  type PricingBasis,
} from '@yuva/shared';
import { Field, NumberInput } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * The quantities this line is priced at.
 *
 * A customer asking "and if we took fifty thousand?" used to mean a second
 * quotation. Two or three quantities on one document answers it in the same
 * breath, and answers it honestly: the cylinders cost the same in every column,
 * so the per-pouch figure genuinely falls as the order grows.
 *
 * **Kilogram or pouches is chosen here.** The style suggests it — the trade
 * quotes a standup pouch per piece and a centre-seal one by weight — but that
 * suggestion used to be the only answer available, and a customer who orders
 * standup pouches by the kilogram could not be quoted the way they buy.
 *
 * Whichever unit is chosen, only that pair is asked for — but **both** are
 * reported beside the result. The film is ordered by weight however it is
 * sold, and the works needs the count however it is priced.
 */

/** What each quantity works out to, computed live so nothing is a surprise. */
export interface QuantityResult {
  quantityKg: number;
  /** Effective rupees per kilogram — typed on a per-kg line, derived on a per-pouch one. */
  ratePerKg: number;
  totalPouches: number;
  totalAmount: number;
  costPerPouch: number;
  marginPercent: number | null;
  /** The other half of the margin, so the row can show its working. */
  materialCostPerKg: number | null;
}

export function QuantityFields({
  control,
  register,
  itemIndex,
  pricingBasis,
  onBasisChange,
  showsPouches = true,
  results,
  costings,
  errors,
  selectedQuantity,
  onSelectQuantity,
}: {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  itemIndex: number;
  pricingBasis: PricingBasis;
  /**
   * What each quantity costs to MAKE — the full activity-based figure, one per
   * row. Absent while the line is not costable, which is why the net margin
   * disappears rather than reading zero.
   */
  costings?: (CostingBreakdown | null)[];
  /**
   * Absent on a roll, where the switch is not shown at all — a reel has no
   * pouches to count, so offering the choice would be offering a mistake.
   */
  onBasisChange?: ((next: PricingBasis) => void) | undefined;
  /**
   * False on a roll. Weight is reported either way, but a reel has no pieces,
   * and "0 pouches" reads as a count rather than as an absence.
   */
  showsPouches?: boolean;
  /** One per row, in order. Absent entries render as blanks, not zeroes. */
  results: (QuantityResult | undefined)[];
  errors?: Record<string, { message?: string } | undefined>[];
  /**
   * Which quantity the customer is quoted, 1-based.
   *
   * One quotation-wide choice rather than one per job, because it decides which
   * column the document has: two jobs quoted at different quantities would not
   * make a table.
   */
  selectedQuantity?: number;
  onSelectQuantity?: (position: number) => void;
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
        <div className="flex flex-wrap items-center gap-2">
          {onBasisChange ? (
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="How this line is sold"
            >
              <span className="text-ink-400 mr-1 text-xs">Sold by</span>
              {(
                [
                  ['PER_KG', 'Kilogram'],
                  ['PER_POUCH', 'Pouches'],
                ] as const
              ).map(([basis, label]) => (
                <button
                  key={basis}
                  type="button"
                  aria-pressed={pricingBasis === basis}
                  onClick={() => onBasisChange(basis)}
                  className={cn(
                    'focus-visible:ring-brand-500 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none',
                    pricingBasis === basis
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-ink-400 text-xs">Sold per kilogram</span>
          )}
          {onSelectQuantity && fields.length > 1 ? (
            <span className="text-ink-400 text-xs">Ticked one is quoted</span>
          ) : null}
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

          const chosen = (selectedQuantity ?? 1) === index + 1;
          const showsRadio = Boolean(onSelectQuantity) && fields.length > 1;

          return (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
              {/*
               * Which quantity the customer actually gets.
               *
               * Only shown once there is something to choose between. A radio
               * beside a single row is a decision nobody has to make, and reads
               * as though the row might somehow be switched off.
               */}
              {showsRadio ? (
                <div className="col-span-2 flex items-center pb-3 sm:col-span-1 sm:justify-center">
                  <input
                    type="radio"
                    name={`items.${itemIndex}.selectedQuantity`}
                    checked={chosen}
                    onChange={() => onSelectQuantity?.(index + 1)}
                    aria-label={`Quote quantity ${index + 1}`}
                    title="Quote this quantity — the others stay as working"
                    className="accent-brand-600 size-4 cursor-pointer"
                  />
                </div>
              ) : null}
              <div className="col-span-1 sm:col-span-2">
                <Field
                  label={`Quantity ${index + 1}`}
                  htmlFor={`items.${itemIndex}.quantities.${index}.${quantityField}`}
                  hint={perPouch ? 'pouches' : 'kg'}
                  error={errors?.[index]?.[quantityField]?.message}
                >
                  <NumberInput
                    /*
                     * Keyed on the field, so switching the unit remounts the
                     * box instead of reusing it.
                     *
                     * `register` is uncontrolled: it never writes back into an
                     * input it is already holding. React reuses this node
                     * across the switch because nothing about its position
                     * changed, so the box went on displaying the kilograms
                     * that were typed while the form was reading and writing
                     * `quantityPouches` underneath — 100 and Rs. 400 on
                     * screen, Rs. 0 as the total beside them. Remounting makes
                     * react-hook-form register a fresh element and fill it
                     * from what it actually holds.
                     */
                    key={quantityField}
                    id={`items.${itemIndex}.quantities.${index}.${quantityField}`}
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
                  <NumberInput
                    key={rateField}
                    id={`items.${itemIndex}.quantities.${index}.${rateField}`}
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
              <div className={cn('col-span-2', showsRadio ? 'sm:col-span-6' : 'sm:col-span-7')}>
                <div className="text-ink-500 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-2 text-xs">
                  {result ? (
                    <>
                      <span className="text-ink-800 font-medium">
                        {formatRs(result.totalAmount)}
                      </span>
                      {/*
                       * Both units, always — not just the one that was not
                       * typed. The office quotes in whichever the customer
                       * buys, but the works runs on the other: a per-pouch
                       * order still has to be laminated and slit by weight,
                       * and a per-kilo one still has to come off the machine
                       * as a countable number of pouches. Showing only the
                       * derived half meant reading the typed figure off the
                       * box above and holding the pair in your head.
                       */}
                      <span className="tabular-nums">{formatNumber(result.quantityKg, 2)} kg</span>
                      {showsPouches ? (
                        <span className="tabular-nums">
                          {formatNumber(result.totalPouches)} pouches
                        </span>
                      ) : null}
                      {/* Gross and net — see the Margins component below. */}
                      {result.marginPercent === null ? (
                        <span
                          className="text-ink-400"
                          title="No margin without a costed structure — every ply needs a film with a rate."
                        >
                          margin —
                        </span>
                      ) : (
                        <Margins
                          ratePerKg={result.ratePerKg}
                          materialCostPerKg={result.materialCostPerKg ?? 0}
                          costing={costings?.[index] ?? null}
                        />
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

/**
 * Both margins on the rate that was actually typed.
 *
 * They used to be one figure, and it was the flattering one: margin over
 * MATERIALS, with the labour, the power, the transport, the packing and the
 * setup left out entirely. On a real quotation that read 41.9% where the job
 * earned 8%.
 *
 * Worse, it was most wrong where it mattered. Materials cost the same per
 * kilogram at any volume, so a short run at a higher rate showed the FATTEST
 * margin on the page — while actually earning least, because the same hour of
 * press setup was spread over a fraction of the film. Somebody reading that
 * row would take the small order thinking it the best one there.
 *
 * So: gross stays, because it is the figure the trade talks in, and net sits
 * beside it in the stronger type, because it is the one that is true. Net
 * needs the whole costing, so it is absent — not zero — when the line cannot
 * yet be costed.
 */
function Margins({
  ratePerKg,
  materialCostPerKg,
  costing,
}: {
  ratePerKg: number;
  materialCostPerKg: number;
  costing: CostingBreakdown | null;
}) {
  const both = costing ? marginsAt(ratePerKg, costing) : null;
  const gross = both
    ? both.grossPercent
    : ratePerKg > 0
      ? ((ratePerKg - materialCostPerKg) / ratePerKg) * 100
      : 0;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className="text-ink-500"
        title={`(${formatRs(ratePerKg, 2)} per kg − ${formatRs(
          costing?.materialCostPerKg ?? materialCostPerKg,
          2,
        )} of material) ÷ ${formatRs(ratePerKg, 2)}. Film, ink and adhesive only.`}
      >
        {formatNumber(gross, 1)}% gross
      </span>
      <span className="text-ink-300">·</span>
      {both === null ? (
        <span
          className="text-ink-400"
          title="Net needs the full costing — choose a film for every ply, and a quantity of at least a kilogram."
        >
          net —
        </span>
      ) : (
        <span
          title={`(${formatRs(ratePerKg, 2)} per kg − ${formatRs(
            costing!.fullCostPerKg,
            2,
          )} it costs to make) ÷ ${formatRs(ratePerKg, 2)}. Everything: film, ink, adhesive, wages, power, transport, packing and the setup.`}
          className={cn(
            'font-semibold',
            both.netPercent < 5
              ? 'text-danger-600'
              : both.netPercent < 12
                ? 'text-warning-600'
                : 'text-success-600',
          )}
        >
          {formatNumber(both.netPercent, 1)}% net
        </span>
      )}
    </span>
  );
}
