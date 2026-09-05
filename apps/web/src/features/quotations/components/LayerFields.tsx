import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Layers } from 'lucide-react';
import { formatRs, micronFromFilmName, type CreateQuotationFormValues } from '@yuva/shared';
import { Field, Input, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * The laminate, stated ply by ply.
 *
 * This replaces a single "Film" dropdown that set only the sealant, with the
 * printed PET and the metallised ply assumed. The client could not read what he
 * was quoting off that control, and the assumption made a 19-micron PET or a
 * foil ply impossible to price without a developer.
 *
 * Choosing the count adds or removes rows rather than swapping the form, so
 * moving 2 → 3 keeps everything already typed and only asks for the new ply.
 *
 * **The gauge is typed, and the film fills it in.** Choosing `PET 12µm` puts 12
 * in the box; the box stays editable, because the works quotes gauges the rates
 * master does not stock and a dropdown cannot offer a number nobody has priced.
 *
 * Typing a gauge the film is not stocked at is the interesting case. A 20µ PET
 * is not priced like a 12µ one, so the film's rate stops applying and the row
 * asks for the rate instead of quietly costing the ply at the wrong price. What
 * is typed is used for this quotation only — see `rateOverride` on the schema.
 */

/**
 * What the works laminates.
 *
 * Two and three, which is what it produces. The engine and the schema handle
 * four, so a foil laminate can be quoted the day it is genuinely needed — it is
 * simply not offered here, because an option nobody uses is one more thing to
 * read past on every job.
 */
const LAYER_COUNTS = [2, 3] as const;

interface Film {
  id: string;
  name: string;
  density: number | null;
  currentRate: number | null;
}

export function LayerFields({
  control,
  register,
  setValue,
  itemIndex,
  films,
  errors,
}: {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  itemIndex: number;
  films: Film[];
  errors?: { micron?: { message?: string }; rateOverride?: { message?: string } }[];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.layers`,
  });

  /*
   * Watched rather than read off `fields`, which is a snapshot taken when the
   * array last changed: picking a film does not change the array, so the row
   * would go on describing whatever was chosen before it.
   */
  const layers = useWatch({ control, name: `items.${itemIndex}.layers` }) ?? [];

  const filmById = new Map(films.map((film) => [film.id, film]));

  function setCount(next: number) {
    // Add to the inside of the structure and remove from there too, so the
    // outer printed ply and the sealant — the two the office actually chose —
    // stay where they are.
    if (next > fields.length) {
      for (let i = fields.length; i < next; i += 1) append({ materialId: null, micron: 0 });
      return;
    }
    for (let i = fields.length - 1; i >= next; i -= 1) remove(i);
  }

  /**
   * Picking a film fills the gauge in, and clears any rate typed for the old one.
   *
   * The rate is cleared because it belonged to the previous film: a figure
   * entered for a 20µ PET must not survive a switch to `Foil 7µm` and go on
   * costing it. Leaving it would be a wrong price that nobody typed.
   */
  function chooseFilm(index: number, filmId: string) {
    setValue(`items.${itemIndex}.layers.${index}.materialId`, filmId || null, {
      shouldDirty: true,
    });
    setValue(`items.${itemIndex}.layers.${index}.rateOverride`, '' as never, {
      shouldDirty: true,
    });

    const film = filmId ? filmById.get(filmId) : undefined;
    const micron = film ? micronFromFilmName(film.name) : null;
    if (micron === null) return;

    // As a string: the form holds these while they are being typed, and the
    // schema coerces on submit. Writing a raw number leaves react-hook-form
    // and the input element disagreeing about the field's type.
    setValue(`items.${itemIndex}.layers.${index}.micron`, String(micron) as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-ink-500 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Layers className="size-3.5" aria-hidden />
          Structure
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Number of layers">
          {LAYER_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={fields.length === count}
              onClick={() => setCount(count)}
              className={cn(
                'focus-visible:ring-brand-500 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none',
                fields.length === count
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white',
              )}
            >
              {count} layer
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {fields.map((field, index) => {
          const layer = layers[index];
          const filmId = (layer?.materialId ?? null) as string | null;
          const film = filmId ? filmById.get(filmId) : undefined;

          /*
           * The gauge the film is stocked and priced at, or null when its name
           * states none — `PP Woven`, which is specified by GSM.
           */
          const stocked = film ? micronFromFilmName(film.name) : null;
          const typed = Number(layer?.micron ?? 0);

          /*
           * A gauge this film is not priced at, so its rate cannot be used.
           *
           * Only once both are known and the typed figure is a real number: an
           * empty box mid-edit is not an override, and asking for a rate the
           * moment a digit is deleted would make the row flicker.
           */
          const offStock = Boolean(film) && stocked !== null && typed > 0 && typed !== stocked;

          return (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
              <div className="col-span-2 sm:col-span-4">
                <Field
                  label={`Layer ${index + 1}`}
                  htmlFor={`items.${itemIndex}.layers.${index}.materialId`}
                >
                  <Select
                    id={`items.${itemIndex}.layers.${index}.materialId`}
                    value={filmId ?? ''}
                    onChange={(event) => chooseFilm(index, event.target.value)}
                  >
                    <option value="">— Choose a film —</option>
                    {films.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                        {option.currentRate === null ? ' (no rate)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/*
               * Always asked for, never derived silently.
               *
               * The film fills this in, but the works quotes gauges the rates
               * master does not stock — a 20µ PET when 12 and 19 are on the
               * list — and a dropdown of stocked films cannot express one.
               * Leaving it editable is what makes those quotable at all.
               */}
              <div className="col-span-1 sm:col-span-2">
                <Field
                  label="Micron"
                  htmlFor={`items.${itemIndex}.layers.${index}.micron`}
                  error={errors?.[index]?.micron?.message}
                >
                  <Input
                    id={`items.${itemIndex}.layers.${index}.micron`}
                    inputMode="decimal"
                    invalid={Boolean(errors?.[index]?.micron)}
                    {...register(`items.${itemIndex}.layers.${index}.micron`)}
                  />
                </Field>
              </div>

              {/*
               * The rate, asked for only when the film's own cannot apply.
               *
               * `PET 12µm` prices a 12µ PET. Quote 20µ against it and neither
               * the 12µ nor the 19µ rate is right, so rather than cost the ply
               * at a price that happens to be on file, the row asks. Used for
               * this quotation and stored on it; the rates master is not
               * touched, because a figure keyed while quoting should not
               * change what every other quotation costs.
               */}
              {offStock ? (
                <div className="col-span-1 sm:col-span-3">
                  <Field
                    label="Rate for this gauge"
                    htmlFor={`items.${itemIndex}.layers.${index}.rateOverride`}
                    error={errors?.[index]?.rateOverride?.message}
                  >
                    <Input
                      id={`items.${itemIndex}.layers.${index}.rateOverride`}
                      inputMode="decimal"
                      placeholder="Rs. / kg"
                      invalid={Boolean(errors?.[index]?.rateOverride)}
                      {...register(`items.${itemIndex}.layers.${index}.rateOverride`)}
                    />
                  </Field>
                </div>
              ) : null}

              {/*
               * The film's rate, and nothing else.
               *
               * This column used to state the gauge, the density and the
               * resulting GSM. Every one of those is an input to the cost
               * rather than a fact the office needs while choosing a film, and
               * three figures per ply on a six-ply screen read as noise. The
               * rate is the one that answers the question actually being asked
               * here — what does this film cost today — and it is the reason a
               * ply gets swapped.
               *
               * "No rate" is said out loud rather than left blank, because a
               * film without one makes the whole line uncostable: the material
               * cost comes back null and the margin reads as a dash, and this
               * is where that starts.
               */}
              <div
                className={cn(
                  'text-ink-500 pb-2.5 text-xs',
                  offStock ? 'col-span-2 sm:col-span-3' : 'col-span-1 sm:col-span-6',
                )}
              >
                {!film ? null : offStock ? (
                  /*
                   * Which rate is on file and why it is not being used. Saying
                   * only "enter a rate" leaves the office wondering whether the
                   * film is unpriced; naming the stocked gauge makes it obvious
                   * that a 20 was typed where the list holds a 12.
                   */
                  <span className="text-warning-700">
                    {film.name} is priced at {stocked}µ
                    {film.currentRate === null ? '' : ` — ${formatRs(film.currentRate, 2)}/kg`}
                  </span>
                ) : film.currentRate === null ? (
                  <span className="text-warning-600">No rate on record</span>
                ) : (
                  <span className="text-ink-800 font-medium tabular-nums">
                    {formatRs(film.currentRate, 2)}
                    <span className="text-ink-400 font-normal"> / kg</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
