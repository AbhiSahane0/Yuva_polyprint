import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The parts of the machine screen, sized for a tablet on a press.
 *
 * Everything here is bigger than the office equivalent on purpose: this is
 * read from arm's length in poor light and pressed with the side of a thumb,
 * sometimes through a glove. Apple's 44 px and Google's 48 px touch minimums
 * are floors for a phone in a quiet room — the buttons below are 72 px, and
 * the one that does something irreversible is the largest thing on the screen.
 *
 * The palette is the app's own. It was dark for a while, on the reasoning
 * that a factory tablet wants a ground that is almost black — but one screen
 * in its own colours is a screen that looks like a different product, and
 * size is what makes this one readable at a machine, not darkness.
 */

/** One figure, big enough to read while walking past. */
export function FloorStat({
  label,
  value,
  unit,
  tone = 'plain',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'plain' | 'warn' | 'good';
}) {
  return (
    <div className="border-ink-200 rounded-2xl border bg-white px-4 py-3">
      <div className="text-ink-500 text-xs font-medium tracking-widest uppercase">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums sm:text-3xl',
          tone === 'warn'
            ? 'text-warning-700'
            : tone === 'good'
              ? 'text-success-700'
              : 'text-ink-900',
        )}
      >
        {value}
        {unit ? <span className="text-ink-400 ml-1 text-base font-medium">{unit}</span> : null}
      </div>
    </div>
  );
}

const TONES = {
  start: 'bg-success-600 hover:bg-success-700 text-white',
  finish: 'bg-brand-600 hover:bg-brand-700 text-white',
  pause: 'bg-white text-ink-700 border border-ink-300 hover:bg-ink-50',
  issue: 'bg-warning-500 hover:bg-warning-600 text-white',
} as const;

/** A button somebody presses with a glove on. */
export function FloorButton({
  tone,
  onClick,
  disabled,
  children,
  full,
}: {
  tone: keyof typeof TONES;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[72px] items-center justify-center gap-2 rounded-2xl px-6 text-lg font-bold tracking-wide uppercase',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:ring-brand-300 focus-visible:ring-4 focus-visible:outline-none',
        TONES[tone],
        full ? 'w-full text-xl' : '',
      )}
    >
      {children}
    </button>
  );
}

/** A big thing to tap from a short list — a machine, or your own name. */
export function FloorChoice({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[64px] rounded-2xl px-5 py-3 text-left transition-colors',
        'focus-visible:ring-brand-300 focus-visible:ring-4 focus-visible:outline-none',
        selected
          ? 'bg-brand-600 text-white'
          : 'border-ink-200 text-ink-900 hover:bg-ink-50 border bg-white',
      )}
    >
      <div className="text-lg font-semibold">{label}</div>
      {hint ? (
        <div className={cn('mt-0.5 text-sm', selected ? 'text-white/80' : 'text-ink-500')}>
          {hint}
        </div>
      ) : null}
    </button>
  );
}

/**
 * A weight, typed on a tablet.
 *
 * `inputMode="decimal"` is what raises the number pad rather than a full
 * keyboard, which is the difference between one tap and four.
 */
export function FloorWeight({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-ink-500 text-xs font-medium tracking-widest uppercase">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            const next = event.target.value;
            /* Digits and one point. A stray letter on a numeric field is a
               weight the server rejects after the reel is already off. */
            if (next === '' || /^\d*\.?\d*$/.test(next)) onChange(next);
          }}
          className={cn(
            'text-ink-900 w-full rounded-2xl bg-white px-5 py-4 text-3xl font-bold tabular-nums',
            'border-ink-300 focus:ring-brand-300 border focus:ring-4 focus:outline-none',
          )}
          placeholder="0"
        />
        <span className="text-ink-500 text-xl font-semibold">kg</span>
      </div>
    </label>
  );
}
