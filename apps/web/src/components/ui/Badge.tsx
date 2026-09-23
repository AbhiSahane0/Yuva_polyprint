import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'brand' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  brand: 'bg-brand-50 text-brand-700',
  /* A stop, not a caution: a job that has no film cannot run. Warning is the
     amber one, and a shortage is not something to keep an eye on. */
  danger: 'bg-danger-50 text-danger-700',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
