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
 * There is no thickness box. Every film in the rates master is named with its
 * gauge — a 12µ PET and a 19µ PET are two separate materials, bought and priced
 * separately — so the film IS the thickness, and asking for it again only
 * created a way for the two to disagree. Choosing the film sets the micron
 * silently. A film whose name states no gauge is the one exception and asks for
 * the figure, because guessing at it would silently under-weigh the laminate
 * and report a confident, wrong cost.
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
  errors?: { micron?: { message?: string } }[];
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

  /** Picking a film carries its gauge onto the ply. */
  function chooseFilm(index: number, filmId: string) {
    setValue(`items.${itemIndex}.layers.${index}.materialId`, filmId || null, {
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

          // The one case the film cannot answer: a name that states no gauge.
          const needsMicron = Boolean(film) && micronFromFilmName(film!.name) === null;

          return (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
              <div className="col-span-2 sm:col-span-5">
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

              {needsMicron ? (
                <div className="col-span-1 sm:col-span-2">
                  <Field
                    label="Thickness"
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
                  needsMicron ? 'col-span-1 sm:col-span-5' : 'col-span-2 sm:col-span-7',
                )}
              >
                {film ? (
                  film.currentRate === null ? (
                    <span className="text-warning-600">No rate on record</span>
                  ) : (
                    <span className="text-ink-800 font-medium tabular-nums">
                      {formatRs(film.currentRate, 2)}
                      <span className="text-ink-400 font-normal"> / kg</span>
                    </span>
                  )
                ) : null}
              </div>

              {/*
               * A gauge the film cannot state is still a validation error worth
               * surfacing, and there is no input here to hang it on.
               */}
              {!needsMicron && errors?.[index]?.micron?.message ? (
                <p className="text-danger-600 col-span-2 text-xs sm:col-span-12">
                  {errors[index]!.micron!.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
