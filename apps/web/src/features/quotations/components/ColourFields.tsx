import { Check, Plus, X } from 'lucide-react';
import { formatRs, SPECIAL_COLOUR_NAME, type JobColour } from '@yuva/shared';
import { cn } from '@/lib/utils';

/**
 * Which inks this job prints.
 *
 * Most printed work is CMYK, so a new line starts with the four — but plenty of
 * packs are one or two colours, and a single-colour job carrying four cylinders
 * and four stations is money and press time that were never spent. A cylinder
 * is around Rs 9,000 and the sixth and seventh stations add Rs 5.50 and Rs 7.50
 * a kilogram, so this is not a cosmetic list.
 *
 * **The four are toggles, not deletions.** "Take the colour off" and "put it
 * back" are the same gesture, which is what somebody correcting a mistake
 * expects; a delete with no way back would send them to the job list to start
 * again. Turning one off is a decision about the job, so the chip stays on
 * screen rather than disappearing.
 *
 * **On and off have to be unmistakable**, because the difference is the price.
 * Grey text against dark text is not enough — somebody scanning the row reads
 * four chips and moves on. So a chosen colour is solid: its own ink in the dot,
 * a tick, a white ground and a full border. An unchosen one is hollow: a dashed
 * border, a ring instead of a dot, and a plus where the tick was. Two signals
 * each, and neither is only colour, which is also what makes it work for
 * somebody who cannot tell cyan from grey.
 *
 * **A special is anonymous, and there may be several.** Which one it is — the
 * brand's red, a metallic, a white base coat — is settled at artwork, weeks
 * after the price is given, so the office adds a row per special station and
 * every one is priced at the dearest ink on the rates list. That is the only
 * honest assumption while the colour is unknown: quote the cheapest and the
 * works loses the difference on every job where it guessed low.
 */

/** What each process colour looks like, so a chip reads at a glance. */
const SWATCH: Record<string, string> = {
  Cyan: '#00AEEF',
  Magenta: '#EC008C',
  Yellow: '#FFF200',
  Black: '#231F20',
};

export function ColourFields({
  colours,
  processPalette,
  special,
  onChange,
  disabled = false,
}: {
  /** The inks this line prints, in order. */
  colours: JobColour[];
  /**
   * The four the works can price, whether or not this job uses them.
   *
   * Passed in rather than derived from `colours`, because a colour that has
   * been turned off still has to be offerable — and a works that has not priced
   * an ink cannot offer it at all, which is why this can be short.
   */
  processPalette: JobColour[];
  /** A special at today's dearest ink, or null when nothing can be priced. */
  special: JobColour | null;
  onChange: (next: JobColour[]) => void;
  disabled?: boolean;
}) {
  const specials = colours.filter((colour) => colour.kind === 'SPECIAL');
  const chosen = colours.length;
  const isOn = (name: string) => colours.some((c) => c.kind === 'PROCESS' && c.name === name);

  /*
   * Order is the palette's, not the order things were clicked. A job that had
   * magenta taken off and put back should read CMYK again, not CYKM — the list
   * is a description of the job and not a history of the editing.
   */
  const toggle = (colour: JobColour) => {
    const next = isOn(colour.name)
      ? colours.filter((c) => !(c.kind === 'PROCESS' && c.name === colour.name))
      : [...processPalette.filter((p) => p.name === colour.name || isOn(p.name)), ...specials];
    onChange(next);
  };

  const addSpecial = () => {
    if (!special) return;
    onChange([...colours, { ...special }]);
  };

  const removeSpecialAt = (index: number) => {
    let seen = -1;
    onChange(
      colours.filter((colour) => {
        if (colour.kind !== 'SPECIAL') return true;
        seen += 1;
        return seen !== index;
      }),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {processPalette.map((colour) => {
          const on = isOn(colour.name);
          return (
            <button
              key={colour.name}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(colour)}
              title={
                on
                  ? `Printing ${colour.name} — click to take it off`
                  : `Not printing ${colour.name} — click to add it`
              }
              className={cn(
                'focus-visible:ring-brand-500 inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 pl-2 text-xs transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
                on
                  ? 'border-ink-400 text-ink-900 bg-white font-semibold shadow-[var(--shadow-card)]'
                  : 'border-ink-200 text-ink-400 hover:border-ink-300 hover:text-ink-600 border-dashed bg-transparent font-medium',
              )}
            >
              {/* The ink itself when it is printing, a hollow ring when it is not. */}
              <span
                aria-hidden
                className={cn('size-3 shrink-0 rounded-full border', on ? 'border-ink-400' : '')}
                style={
                  on
                    ? { background: SWATCH[colour.name] ?? '#9ca3af' }
                    : { borderColor: SWATCH[colour.name] ?? '#9ca3af', opacity: 0.45 }
                }
              />
              {colour.name}
              {on ? (
                <Check className="text-ink-500 size-3 shrink-0" aria-hidden />
              ) : (
                <Plus className="size-3 shrink-0" aria-hidden />
              )}
            </button>
          );
        })}

        {specials.map((colour, index) => (
          <span
            key={`special-${index}`}
            className="border-brand-100 bg-brand-50 text-brand-700 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            title={`Priced at ${formatRs(colour.ratePerKg, 2)}/kg — the dearest ink on the rates list`}
          >
            <span
              aria-hidden
              className="from-brand-500 size-2.5 rounded-full bg-gradient-to-br to-amber-400"
            />
            {SPECIAL_COLOUR_NAME}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeSpecialAt(index)}
              aria-label={`Remove special colour ${index + 1}`}
              className="text-brand-700 hover:text-danger-600 -mr-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}

        <button
          type="button"
          disabled={disabled || !special}
          onClick={addSpecial}
          title={
            special
              ? `Adds one station of an unnamed colour, priced at ${formatRs(special.ratePerKg, 2)}/kg`
              : 'No ink on the rates list can be priced yet'
          }
          className="border-ink-200 text-ink-600 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed bg-white px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-3" />
          Special colour
        </button>
      </div>

      <ColourNote count={chosen} special={special} hasSpecial={specials.length > 0} />
    </div>
  );
}

/**
 * What the chips above come to, in the two terms that cost money.
 *
 * The count is the cylinder count and the station count, and saying so here is
 * the whole reason the office can be trusted to edit the list: otherwise adding
 * a colour is a change with an invisible consequence three fields away.
 */
function ColourNote({
  count,
  special,
  hasSpecial,
}: {
  count: number;
  special: JobColour | null;
  hasSpecial: boolean;
}) {
  if (count === 0) {
    return (
      <p className="text-warning-700 text-xs">
        No colours, so this line is priced at the works&rsquo; blended ink rate rather than on what
        it prints — and asks for no cylinders. Add the ones the job runs.
      </p>
    );
  }

  return (
    <p className="text-ink-500 text-xs">
      <span className="text-ink-700 font-medium">
        {count} {count === 1 ? 'colour' : 'colours'}
      </span>{' '}
      — so {count} {count === 1 ? 'cylinder' : 'cylinders'} and {count}{' '}
      {count === 1 ? 'station' : 'stations'}.
      {hasSpecial && special ? (
        <>
          {' '}
          A special is priced at <strong>{formatRs(special.ratePerKg, 2)}/kg</strong>, the dearest
          ink on the rates list, because which colour it is gets settled at artwork.
        </>
      ) : null}
    </p>
  );
}
