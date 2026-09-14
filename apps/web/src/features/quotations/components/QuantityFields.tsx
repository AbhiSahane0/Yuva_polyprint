import { useState } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Info, Layers3 } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  marginsAt,
  round,
  type CostingBreakdown,
  type CreateQuotationFormValues,
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
 * **Kilograms and pouches, side by side, both typed.** It used to be a
 * `Sold by [Kilogram | Pouches]` switch, and the switch decided which pair of
 * boxes existed — so whichever unit was picked, the other was off screen.
 * Quoting per piece hid the weight the film is bought in; quoting per kilo hid
 * the count the customer asks for.
 *
 * They are two readings of one number, so they are shown as one: `500 kg =
 * 21,565 pouches`, and typing in either fills the other. An order arrives as
 * "five hundred kilos" or as "a lakh pouches" depending on who is ringing, and
 * neither should need converting by hand before it can be keyed in.
 *
 * The **rate** is the same pair: `Rs. 281.24 per kg = Rs. 6.52 per pouch`. The
 * costing works in kilograms and fills the left box in, but a customer haggles
 * in the unit they buy — "make it six and a half and we'll take it" — and
 * typing that into the right box is the whole of it. Nothing has to be worked
 * backwards on paper to find the per-kilo figure that lands on a round price.
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

interface RowProps {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  itemIndex: number;
  index: number;
  pouchesPerKg: number;
  pouchWeightG: number;
  showsPouches: boolean;
  result: QuantityResult | undefined;
  costing: CostingBreakdown | null;
  onShowWorking?: ((index: number) => void) | undefined;
  errors?: Record<string, { message?: string } | undefined>;
  chosen: boolean;
  showsRadio: boolean;
  onSelectQuantity?: ((position: number) => void) | undefined;
  onRemove?: (() => void) | undefined;
}

export function QuantityFields({
  control,
  register,
  setValue,
  itemIndex,
  pouchesPerKg = 0,
  showsPouches = true,
  results,
  costings,
  onShowWorking,
  errors,
  selectedQuantity,
  onSelectQuantity,
}: {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  /** Needed because the pouch box writes back into the kilogram one. */
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  itemIndex: number;
  /**
   * What a kilogram of this laminate comes to in pouches.
   *
   * What links the two boxes, and what the pouch figures hang off. Zero until
   * every ply has a film with a density, and the row says so rather than
   * offering a box that cannot answer.
   */
  pouchesPerKg?: number;
  /**
   * What each quantity costs to MAKE — the full activity-based figure, one per
   * row. Absent while the line is not costable, which is why the net margin
   * disappears rather than reading zero.
   */
  costings?: (CostingBreakdown | null)[];
  /** Opens the working behind one row's rate. */
  onShowWorking?: ((index: number) => void) | undefined;
  /**
   * False on a roll. A reel is film on a core: there is no pouch to count, so
   * the pouch box and the strip are not shown at all rather than shown empty.
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

  /* One pouch's weight, the same at every quantity on this line. */
  const pouchWeightG = pouchesPerKg > 0 ? 1000 / pouchesPerKg : 0;

  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-ink-500 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Layers3 className="size-3.5" aria-hidden />
          Quantities
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <QuantityRow
            key={field.id}
            control={control}
            register={register}
            setValue={setValue}
            itemIndex={itemIndex}
            index={index}
            pouchesPerKg={pouchesPerKg}
            pouchWeightG={pouchWeightG}
            showsPouches={showsPouches}
            result={results[index]}
            costing={costings?.[index] ?? null}
            onShowWorking={onShowWorking}
            errors={errors?.[index]}
            chosen={(selectedQuantity ?? 1) === index + 1}
            showsRadio={Boolean(onSelectQuantity) && fields.length > 1}
            onSelectQuantity={onSelectQuantity}
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function QuantityRow({
  register,
  control,
  setValue,
  itemIndex,
  index,
  pouchesPerKg,
  pouchWeightG,
  showsPouches,
  result,
  costing,
  onShowWorking,
  errors,
  chosen,
  showsRadio,
  onSelectQuantity,
  onRemove,
}: RowProps) {
  const kg = Number(
    useWatch({ control, name: `items.${itemIndex}.quantities.${index}.quantityKg` }) ?? 0,
  );

  const ratePerKg = Number(
    useWatch({ control, name: `items.${itemIndex}.quantities.${index}.ratePerKg` }) ?? 0,
  );

  const write = (field: string, value: number | string) =>
    setValue(`items.${itemIndex}.quantities.${index}.${field}` as never, String(value) as never, {
      shouldDirty: true,
      shouldValidate: true,
    });

  /*
   * Typing pouches sets the kilograms. Three decimals, because a pouch is grams
   * — the weight it implies is exact enough to price and short enough to read.
   */
  const takePouches = (count: number) => {
    write('quantityKg', count > 0 ? round(count / pouchesPerKg, 3) : '');
    write('quantityPouches', Math.max(0, Math.round(count)));
  };

  /*
   * Typing a rate each sets the rate per kilogram, which is the one the line is
   * actually priced on. Four decimals, because a pouch is often under ten rupees
   * and two would round a half-paisa negotiation away.
   */
  const takeRateEach = (each: number) => {
    write('ratePerKg', each > 0 ? round(each * pouchesPerKg, 4) : '');
    write('ratePerPouch', each > 0 ? round(each, 4) : '');
  };

  /* Whether this row can be read as pouches at all — a roll never can, and a
     laminate with a ply still to choose has no weight to divide by yet. */
  const countable =
    showsPouches && pouchWeightG > 0 && result !== undefined && result.totalPouches > 0;

  const quantityId = `items.${itemIndex}.quantities.${index}.quantityKg`;
  const pouchId = `items.${itemIndex}.quantities.${index}.quantityPouches`;
  const rateId = `items.${itemIndex}.quantities.${index}.ratePerKg`;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border',
        /* The quoted row is the one the document carries, so it is the one that
           reads as chosen rather than merely ticked. */
        chosen && showsRadio ? 'border-brand-500 bg-brand-50/30' : 'border-ink-200 bg-white',
      )}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
        {/*
         * Which quantity the customer actually gets.
         *
         * Only shown once there is something to choose between. A radio beside a
         * single row is a decision nobody has to make, and reads as though the
         * row might somehow be switched off.
         */}
        {showsRadio ? (
          <input
            type="radio"
            name={`items.${itemIndex}.selectedQuantity`}
            checked={chosen}
            onChange={() => onSelectQuantity?.(index + 1)}
            aria-label={`Quote quantity ${index + 1}`}
            title="Quote this quantity — the others stay as working"
            className="accent-brand-600 size-4 shrink-0 cursor-pointer self-center"
          />
        ) : null}

        {/*
         * Two readings of one number, joined by the equals sign that says so.
         * Type into whichever the customer gave you.
         */}
        <div className="min-w-0">
          <Field
            label={`Quantity ${index + 1}`}
            htmlFor={quantityId}
            error={errors?.quantityKg?.message}
          >
            <div className="flex items-center gap-2">
              <div className="w-24">
                <NumberInput
                  id={quantityId}
                  invalid={Boolean(errors?.quantityKg)}
                  {...register(quantityId as never)}
                />
                <p className="text-ink-400 mt-1 text-xs">kg</p>
              </div>

              {showsPouches ? (
                <>
                  <Equals />
                  <PairedBox
                    id={pouchId}
                    ariaLabel={`Quantity ${index + 1} in pouches`}
                    hint="pouches"
                    derived={pouchesPerKg > 0 && kg > 0 ? kg * pouchesPerKg : 0}
                    decimals={0}
                    disabled={pouchesPerKg <= 0}
                    onType={takePouches}
                  />
                </>
              ) : null}
            </div>
          </Field>
        </div>

        <div className="min-w-0">
          <div className="relative">
            <Field label={`Rate ${index + 1}`} htmlFor={rateId} error={errors?.ratePerKg?.message}>
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <NumberInput
                    id={rateId}
                    invalid={Boolean(errors?.ratePerKg)}
                    {...register(rateId as never)}
                  />
                  <p className="text-ink-400 mt-1 text-xs">per kg</p>
                </div>

                {showsPouches ? (
                  <>
                    <Equals />
                    <PairedBox
                      id={`items.${itemIndex}.quantities.${index}.ratePerPouch`}
                      ariaLabel={`Rate ${index + 1} per pouch`}
                      hint="per pouch"
                      derived={pouchesPerKg > 0 && ratePerKg > 0 ? ratePerKg / pouchesPerKg : 0}
                      decimals={4}
                      disabled={pouchesPerKg <= 0}
                      onType={takeRateEach}
                    />
                  </>
                ) : null}
              </div>
            </Field>
            {/*
              The working, beside the figure it produced. The rate arrives filled
              in — there is no reason to make somebody press a button to accept a
              number the system already worked out — and this is how they check
              where it came from.
            */}
            {costing && onShowWorking ? (
              <button
                type="button"
                onClick={() => onShowWorking(index)}
                title="How this rate was worked out"
                aria-label={`How rate ${index + 1} was worked out`}
                className="text-ink-400 hover:text-brand-600 absolute top-0 left-28 cursor-pointer p-0.5"
              >
                <Info className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/*
         * The margin sits beside the RATE, because it is a judgement about the
         * rate — the office types a price here and watches this move. What the
         * order comes to is money, so it is in the strip with the other money.
         */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-1 text-xs">
          {result === undefined ? (
            <span className="text-ink-300">&mdash;</span>
          ) : result.marginPercent === null ? (
            <span
              className="text-ink-400"
              title="No margin without a costed structure — every ply needs a film with a rate."
            >
              margin &mdash;
            </span>
          ) : (
            <Margins
              ratePerKg={result.ratePerKg}
              materialCostPerKg={result.materialCostPerKg ?? 0}
              costing={costing}
            />
          )}
        </div>

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove quantity ${index + 1}`}
            className="text-ink-400 hover:text-danger-600 focus-visible:ring-brand-500 ml-auto shrink-0 rounded px-1 pb-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            Remove
          </button>
        ) : null}
      </div>

      {/*
       * What the order comes to, and the two facts that are not boxes.
       *
       * Everything the office types is above; this is what falls out of it. The
       * total is the figure that goes on the document, so it carries the weight
       * here — and the count with its weight each is the working behind the
       * pouch boxes, so the arithmetic can be followed without leaving the row.
       *
       * The strip is here on a roll too, carrying the total alone: money belongs
       * in one place whether or not the job has pouches in it.
       */}
      <div className="border-ink-200 bg-brand-50/60 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-b-[var(--radius-md)] border-t px-3 py-2">
        {result === undefined ? (
          <span className="text-ink-300 text-xs">&mdash;</span>
        ) : (
          <>
            <span className="text-brand-700 text-base font-semibold tabular-nums">
              {formatRs(result.totalAmount)}
            </span>
            <span className="text-ink-500 text-xs">in all</span>

            {countable ? (
              <>
                <span className="text-ink-300 text-xs">&middot;</span>
                <span className="text-ink-500 text-xs tabular-nums">
                  {formatNumber(result.totalPouches)} pouches at {formatNumber(pouchWeightG, 2)} g
                  each
                </span>
              </>
            ) : null}

            {showsPouches && !countable ? (
              <>
                <span className="text-ink-300 text-xs">&middot;</span>
                <span className="text-ink-400 text-xs">
                  the pouch boxes need a film on every ply — the densities are what turn kilograms
                  into a count
                </span>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** What says the two boxes are one number rather than two settings. */
function Equals() {
  return (
    <span className="text-ink-300 mb-5 text-sm" aria-hidden>
      =
    </span>
  );
}

/**
 * The other half of a pair: shown from the half the form holds, typed into
 * freely.
 *
 * Both pairs work the same way. One box is the field — kilograms, rupees per
 * kilogram — and the other is that field read through the laminate's weight per
 * pouch. Typing into this one converts and writes back into the field, so there
 * is one source of truth and no chance of the two drifting.
 *
 * **The local `typing` state is what makes it usable.** Without it the box is
 * rewritten from the field on every keystroke: type "1" into pouches, that is
 * 0.023 kg, which renders back as "1" — but the intermediate states of "1000"
 * fight the cursor, and a rate typed as "6.5" briefly becomes "6.5000000001"
 * through the round trip. Held while the box has focus and dropped on blur, so
 * it re-syncs the moment the other half changes anywhere else.
 *
 * Disabled rather than hidden when there is nothing to convert with: the row
 * should not change shape as films are chosen, and a dead box beside a live one
 * reads as "waiting" where a missing box reads as "not offered".
 */
function PairedBox({
  id,
  ariaLabel,
  hint,
  derived,
  decimals,
  disabled,
  onType,
}: {
  id: string;
  ariaLabel: string;
  hint: string;
  derived: number;
  /** 0 for a count of pouches; 4 for a rate, where half a paisa is negotiable. */
  decimals: number;
  disabled: boolean;
  onType: (value: number) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (derived > 0 ? String(round(derived, decimals)) : '');

  return (
    <div className="w-24">
      <NumberInput
        id={id}
        aria-label={ariaLabel}
        value={shown}
        disabled={disabled}
        title={disabled ? 'Choose a film for every ply first' : undefined}
        onChange={(event) => {
          setTyping(event.target.value);
          if (disabled) return;
          const value = Number(event.target.value);
          /* An empty box and a half-typed "1." are both Not-a-Number. Neither is
             an instruction to reprice the line, so neither writes. */
          if (Number.isFinite(value)) onType(value);
        }}
        onBlur={() => setTyping(null)}
      />
      <p className="text-ink-400 mt-1 text-xs">{hint}</p>
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
          net &mdash;
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
