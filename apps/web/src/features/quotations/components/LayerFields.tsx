import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Layers } from 'lucide-react';
import { formatNumber, type CreateQuotationFormValues } from '@yuva/shared';
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
 */

/** What the works laminates. Four is the engine's ceiling, not a common order. */
const LAYER_COUNTS = [2, 3, 4] as const;

interface Film {
  id: string;
  name: string;
  density: number | null;
  currentRate: number | null;
}

function roleOf(index: number, total: number): string {
  if (index === 0) return 'Outer, printed';
  if (index === total - 1) return 'Sealant';
  return 'Middle';
}

export function LayerFields({
  control,
  register,
  itemIndex,
  films,
  errors,
}: {
  control: Control<CreateQuotationFormValues>;
  register: UseFormRegister<CreateQuotationFormValues>;
  itemIndex: number;
  films: Film[];
  errors?: { micron?: { message?: string } }[];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.layers`,
  });

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
          const filmId = (field as { materialId?: string | null }).materialId ?? null;
          const film = filmId ? filmById.get(filmId) : undefined;

          return (
            <div key={field.id} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-6">
                <Field
                  label={`Layer ${index + 1}`}
                  htmlFor={`items.${itemIndex}.layers.${index}.materialId`}
                  hint={roleOf(index, fields.length)}
                >
                  <Select
                    id={`items.${itemIndex}.layers.${index}.materialId`}
                    {...register(`items.${itemIndex}.layers.${index}.materialId`)}
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

              <div className="col-span-6 sm:col-span-3">
                <Field
                  label="Thickness"
                  htmlFor={`items.${itemIndex}.layers.${index}.micron`}
                  hint="micron"
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

              <div className="text-ink-500 col-span-6 pb-2 text-xs sm:col-span-3">
                {/*
                 * The weight this ply contributes. Shown per row because it is
                 * the number that explains the cost — the sealant is usually
                 * four times the PET and dominates the average.
                 */}
                {film?.density
                  ? `${formatNumber(film.density, 2)} g/cm³`
                  : filmId
                    ? 'No density recorded'
                    : 'Not chosen'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
