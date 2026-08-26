import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
};

/**
 * The spinning indicator, on its own.
 *
 * `Button` draws the same `Loader2` for its loading state, so a busy button and
 * a busy panel look like the same system rather than two different ideas.
 *
 * Pass `label` when the spinner is the only sign of activity — it is announced
 * to screen readers, which see nothing at all in a CSS animation. Leave it off
 * when visible text alongside already says what is happening, so the message is
 * not read out twice; `LoadingState` does exactly that.
 *
 * The animation slows rather than stops under `prefers-reduced-motion`. A
 * spinner frozen mid-rotation reads as a broken image, not as consideration.
 */
export function Spinner({
  size = 'md',
  label,
  className,
}: {
  size?: Size;
  label?: string;
  className?: string;
}) {
  const icon = (
    <Loader2
      className={cn(
        SIZES[size],
        'animate-spin motion-reduce:[animation-duration:2s]',
        // Inherits by default so it takes the colour of whatever it sits in.
        className,
      )}
      aria-hidden
    />
  );

  if (!label) return icon;

  return (
    <span role="status" aria-live="polite" className="inline-flex">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
