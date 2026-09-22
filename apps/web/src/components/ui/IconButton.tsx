import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'danger';

/**
 * A button that is only an icon — the ones that live in table rows.
 *
 * **`tone="danger"` is why this exists.** Delete buttons were written inline in
 * a dozen places and had drifted: some `text-ink-400`, some `text-ink-500`, one
 * with no hover background and its own padding. Worse, every one of them was
 * **grey at rest and only turned red on hover** — so the most destructive
 * control on the screen looked exactly like the one beside it until the cursor
 * was already on it.
 *
 * Red at rest, darker red on hover. A destructive action should be recognisable
 * before you reach it, and the hover should read as "yes, that one" rather than
 * as the control lighting up like any other.
 *
 * An `aria-label` is required rather than optional: an icon button with no
 * accessible name is a button that reads as "button" to a screen reader, and
 * these are the ones that delete things.
 */
const TONES: Record<Tone, string> = {
  default: 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
  danger: 'text-danger-600 hover:bg-danger-50 hover:text-danger-700',
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'default', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        /* 36px, which is the smallest the shop-floor tablet should be asked to
           hit. The icon inside is 16px; the rest is the target. */
        'inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
        'focus-visible:outline-brand-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
});
