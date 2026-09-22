import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:hover:bg-brand-600',
  secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
  ghost: 'bg-transparent text-ink-500 hover:bg-ink-100 hover:text-ink-800',
  /*
   * A LABELLED destructive action — "Delete this order", not a trash icon.
   *
   * Red text rather than a red block: a solid danger button beside two ordinary
   * ones shouts, and these sit at the foot of a page where the eye should land
   * on them last. Red at rest all the same, so it is recognisable before the
   * cursor reaches it, and darker on hover.
   */
  dangerGhost: 'bg-transparent text-danger-600 hover:bg-danger-50 hover:text-danger-700',
  /* Darker on hover, not lighter. It used to go 600 → 500, so the one button
     in the app that destroys something got BRIGHTER as you reached it —
     reading as a control lighting up rather than as a warning deepening. */
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:hover:bg-danger-600',
};

const SIZES: Record<Size, string> = {
  // 40px tall minimum so the shop-floor tablet has a comfortable touch target.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium',
        'cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
