import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Layers } from 'lucide-react';
import {
  filmFamily,
  formatNumber,
  formatRs,
  micronFromFilmName,
  resolveFilm,
  type CreateQuotationFormValues,
} from '@yuva/shared';
import { Field, Select, NumberInput } from '@/components/ui/Field';
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
 * **The film and the gauge are two questions, asked once each.** The dropdown
 * offers families — PET, PE, MET PET — and the gauge is typed beside it.
 *
 * **One rate per film, used at every gauge.** The works pays near enough the
 * same for a kilogram of PET whether the reel is 12 micron or 15, so it keeps
 * one PET rate rather than one per thickness, and the same for every other
 * film. The gauge decides how many metres that kilogram covers — which is the
 * GSM, and is already carried — never what the kilogram costs.
 *
 * So no ply is ever unpriced for being quoted at an unusual thickness. The rate
 * box is filled with the film's own figure the moment a film is picked, and is
 * there to be typed over when this job was agreed at something else. See
 * `plyRatePerKg`.
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

/** What the laminate gains in adhesive, as `totalMicron` in the engine counts it. */
const ADHESIVE_MICRON = 2;

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

  /*
   * The families, in the order the rates master lists them, without repeats.
   * Nine entries where there were eleven — PET and PE each appeared twice, once
   * per stocked gauge.
   */
  const families = [...new Set(films.map((film) => filmFamily(film.name)))];

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
   * Point a ply at the stocked film its family and gauge name between them.
   *
   * The form stores a material id, so the family on screen is really "the
   * family of whatever film is currently set". Changing either the family or
   * the gauge re-resolves it — which is what makes typing 19 against PET move
   * the ply from `PET 12µm` to `PET 19µm` and pick up its own rate.
   */
  function point(index: number, family: string, micron: number) {
    const film = family ? resolveFilm(family, micron, films) : undefined;
    setValue(`items.${itemIndex}.layers.${index}.materialId`, film?.id ?? null, {
      shouldDirty: true,
    });
    return film;
  }

  /**
   * Picking a family fills the gauge in, and puts that film's rate in the box.
   *
   * The rate is written rather than shown as a greyed hint. A hint reads as an
   * empty field, and an empty field beside the word "rate" is the one thing on
   * this row that looks like it still needs doing — the office kept asking why
   * the figure was not filled in. It is the film's own rate, it is right, and
   * it is now sitting there to be typed over on the job where it was agreed at
   * something else.
   *
   * It is written on every switch of film, never carried across: a figure
   * agreed for PET must not survive a change to Foil and go on costing it.
   *
   * The gauge is only filled in when the box is empty or the family cannot hold
   * what is in it. Overwriting a typed gauge would undo the office's own figure
   * the moment they corrected the film beside it.
   */
  function chooseFamily(index: number, family: string) {
    const typed = Number(layers[index]?.micron ?? 0);
    const film = point(index, family, typed);

    setValue(`items.${itemIndex}.layers.${index}.rateOverride`, rateText(film) as never, {
      shouldDirty: true,
    });

    if (!film) return;
    const micron = micronFromFilmName(film.name);
    if (micron === null) return;

    /*
     * The gauge is filled in when the box is empty — and also when the family
     * is stocked at one thickness only.
     *
     * MET PET is the case: the works buys it at 12µ and nothing else, so a row
     * switched to it from a 50µ poly was left reading 50µ of a film that does
     * not exist at 50. Where a family IS stocked at several gauges, a typed
     * figure is the office's own and is left alone — that is what keeps a 19µ
     * PET from being pulled back to 12.
     */
    const stockedGauges = new Set(
      films
        .filter((candidate) => filmFamily(candidate.name) === family)
        .map((candidate) => micronFromFilmName(candidate.name))
        .filter((gauge): gauge is number => gauge !== null),
    );
    if (typed > 0 && stockedGauges.size !== 1) return;

    setValue(`items.${itemIndex}.layers.${index}.micron`, String(micron) as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  /**
   * Retyping the gauge can move the ply onto a different row of the same family.
   *
   * It no longer wipes the rate. The gauge does not decide the price — one rate
   * covers the film at every thickness — so a corrected micron is no reason to
   * throw away a figure the office typed beside it.
   *
   * When the move does land on a different row, the box follows that row's rate
   * only if it still holds the previous one's, untouched. That is the case
   * where the figure was put there by this form and means nothing more than
   * "the list"; anything else in the box was typed by somebody, and is theirs.
   */
  function changeMicron(index: number, raw: string) {
    const family = currentFamily(index);
    if (!family) return;

    const before = filmOf(index);
    const film = point(index, family, Number(raw));
    if (!film || !before || film.id === before.id) return;

    const box = String(layers[index]?.rateOverride ?? '').trim();
    if (box !== rateText(before)) return;

    setValue(`items.${itemIndex}.layers.${index}.rateOverride`, rateText(film) as never, {
      shouldDirty: true,
    });
  }

  /** The family shown in the dropdown: that of the film the ply points at. */
  function currentFamily(index: number): string {
    const id = (layers[index]?.materialId ?? null) as string | null;
    const film = id ? filmById.get(id) : undefined;
    return film ? filmFamily(film.name) : '';
  }

  /** The film a ply currently points at, or undefined while none is chosen. */
  function filmOf(index: number): Film | undefined {
    const id = (layers[index]?.materialId ?? null) as string | null;
    return id ? filmById.get(id) : undefined;
  }

  /**
   * A film's rate as the form holds it: a string, because that is what an input
   * carries while it is being typed, and the schema coerces on submit. Writing
   * a raw number leaves react-hook-form and the element disagreeing about the
   * field's type. Empty for a film with no rate on record.
   */
  function rateText(film: Film | undefined): string {
    return (film?.currentRate ?? '').toString();
  }

  /*
   * The structure's thickness, the way the costing counts it.
   *
   * Two microns a lamination for the adhesive, which is what `totalMicron` in
   * the engine adds — so the figure shown here is the figure the job is priced
   * on, and not a sum of the boxes that happens to be 2µ lighter.
   */
  const plyMicrons = layers
    .map((layer) => Number(layer?.micron ?? 0))
    .filter((micron) => Number.isFinite(micron) && micron > 0);
  const total = {
    plies: plyMicrons.length,
    adhesive: plyMicrons.length > 1 ? ADHESIVE_MICRON : 0,
    micron:
      Math.round(
        (plyMicrons.reduce((sum, micron) => sum + micron, 0) +
          (plyMicrons.length > 1 ? ADHESIVE_MICRON : 0)) *
          100,
      ) / 100,
  };

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
           * What this job is being charged against what the film costs today.
           *
           * The box holds the rate, so the column beside it can no longer just
           * repeat it. What it says instead is whether this job has moved off
           * the list — which is the thing nobody can see once the figure is
           * editable and pre-filled.
           */
          const listRate = film?.currentRate ?? null;
          const typedRate = Number(layer?.rateOverride ?? 0);
          const offList =
            listRate !== null && typedRate > 0 && Math.abs(typedRate - listRate) >= 0.005;

          return (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
              <div className="col-span-2 sm:col-span-4">
                <Field
                  label={`Layer ${index + 1}`}
                  htmlFor={`items.${itemIndex}.layers.${index}.materialId`}
                >
                  <Select
                    id={`items.${itemIndex}.layers.${index}.materialId`}
                    value={currentFamily(index)}
                    onChange={(event) => chooseFamily(index, event.target.value)}
                  >
                    <option value="">— Choose a film —</option>
                    {families.map((family) => (
                      <option key={family} value={family}>
                        {family}
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
                  <NumberInput
                    id={`items.${itemIndex}.layers.${index}.micron`}
                    invalid={Boolean(errors?.[index]?.micron)}
                    {...register(`items.${itemIndex}.layers.${index}.micron`, {
                      onChange: (event) => changeMicron(index, event.target.value),
                    })}
                  />
                </Field>
              </div>

              {/*
               * The rate this job's film is charged at.
               *
               * Filled with the film's own rate when the film is picked, and
               * editable, because a film price is agreed job to job: the works'
               * own sheets carry PET at 185, 175 and 190 — all at 12µ, all
               * written on the same day.
               *
               * What is typed here is used for this quotation and stored on it.
               * The rates master is never touched, because a figure keyed while
               * quoting should not change what every other quotation costs.
               *
               * Left empty it falls back to the film's rate, which is what
               * every quotation saved before the box was pre-filled does.
               */}
              {film ? (
                <div className="col-span-1 sm:col-span-3">
                  <Field
                    label="Rate for this job"
                    htmlFor={`items.${itemIndex}.layers.${index}.rateOverride`}
                    error={errors?.[index]?.rateOverride?.message}
                  >
                    <NumberInput
                      id={`items.${itemIndex}.layers.${index}.rateOverride`}
                      placeholder={listRate === null ? 'Rs. / kg' : formatNumber(listRate, 2)}
                      invalid={Boolean(errors?.[index]?.rateOverride)}
                      {...register(`items.${itemIndex}.layers.${index}.rateOverride`)}
                    />
                  </Field>
                </div>
              ) : null}

              {/*
               * What the list says, so a job priced away from it shows.
               *
               * This column used to state the gauge, the density and the
               * resulting GSM. Every one of those is an input to the cost
               * rather than a fact the office needs while choosing a film, and
               * three figures per ply on a six-ply screen read as noise.
               *
               * It then showed the film's current rate — which was the answer
               * to "what does this film cost today" while the box beside it was
               * empty. Now that the box carries that figure, repeating it says
               * nothing. So it names it as the LIST rate, quietly while the two
               * agree, and says how far apart they are when they do not: a
               * hundred typed where 185 was meant is otherwise a plausible
               * number in an editable box, and nothing else on the screen would
               * catch it.
               *
               * "No rate" is said out loud rather than left blank, because a
               * film without one makes the whole line uncostable: the material
               * cost comes back null and the margin reads as a dash, and this
               * is where that starts.
               */}
              <div
                className={cn(
                  'text-ink-500 pb-2.5 text-xs',
                  film ? 'col-span-2 sm:col-span-3' : 'col-span-1 sm:col-span-6',
                )}
              >
                {!film ? null : listRate === null ? (
                  <span className="text-warning-600">No rate on record</span>
                ) : offList ? (
                  <span className="text-warning-700">
                    List {formatRs(listRate, 2)}/kg — this job is{' '}
                    {formatRs(Math.abs(typedRate - listRate), 2)}{' '}
                    {typedRate > listRate ? 'above' : 'below'}
                  </span>
                ) : (
                  <span className="tabular-nums">
                    List {formatRs(listRate, 2)}
                    <span className="text-ink-400"> / kg</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        The total, where the office looks for it.
        
        The plies are typed one at a time and the figure that matters is their
        sum — it is the number on the customer's own enquiry ("91 micron"), and
        it was the one thing on this panel that had to be done in somebody's
        head. The adhesive is in it because it is in the laminate: two microns
        a lamination, which is what the costing adds.
      */}
      {total.plies > 0 ? (
        <div className="border-ink-100 mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
          <span className="text-ink-500 text-xs">
            {total.plies} {total.plies === 1 ? 'ply' : 'plies'}
            {total.adhesive > 0 ? ` + ${total.adhesive}µ adhesive` : ''}
          </span>
          <span className="text-ink-900 text-sm font-semibold tabular-nums">
            {total.micron}µ total
          </span>
        </div>
      ) : null}
    </div>
  );
}
