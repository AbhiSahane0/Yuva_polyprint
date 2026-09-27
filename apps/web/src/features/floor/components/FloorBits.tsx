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
    <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <div className="text-xs font-medium tracking-widest text-white/40 uppercase">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums sm:text-3xl',
          tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : 'text-white',
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-base font-medium text-white/40">{unit}</span> : null}
      </div>
    </div>
  );
}

const TONES = {
  start: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white',
  finish: 'bg-brand-500 hover:bg-brand-400 active:bg-brand-600 text-white',
  pause: 'bg-white/10 hover:bg-white/15 active:bg-white/20 text-white ring-1 ring-white/15',
  issue: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-ink-900',
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
        'focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none',
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
        'focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none',
        selected
          ? 'bg-brand-500 text-white'
          : 'bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10',
      )}
    >
      <div className="text-lg font-semibold">{label}</div>
      {hint ? <div className="mt-0.5 text-sm text-white/50">{hint}</div> : null}
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
      <span className="text-xs font-medium tracking-widest text-white/40 uppercase">{label}</span>
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
            'w-full rounded-2xl bg-white/10 px-5 py-4 text-3xl font-bold tabular-nums text-white',
            'ring-1 ring-white/15 focus:ring-4 focus:ring-white/40 focus:outline-none',
          )}
          placeholder="0"
        />
        <span className="text-xl font-semibold text-white/40">kg</span>
      </div>
    </label>
  );
}
