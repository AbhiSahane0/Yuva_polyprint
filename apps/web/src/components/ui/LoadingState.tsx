import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

/**
 * Fills a page or panel while its data is on the way.
 *
 * Deliberately the same shape as `EmptyState` — same padding, same centring,
 * same text size — because the two swap places in exactly the same slot. If
 * they differed, every list would jump as it finished loading.
 *
 * Say what is loading rather than just "Loading". On a slow connection the
 * difference between "Loading quotations…" and a bare spinner is the
 * difference between waiting and wondering whether the click registered.
 */
export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <Spinner size="lg" className="text-brand-600" />
      <p className="text-ink-500 text-sm">{label}</p>
    </div>
  );
}
