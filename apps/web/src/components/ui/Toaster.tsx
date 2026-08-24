import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useToastStore } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[var(--radius-md)]',
            'border bg-white px-3.5 py-3 shadow-[var(--shadow-elevated)]',
            t.tone === 'success' ? 'border-success-500/30' : 'border-danger-500/30',
          )}
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="text-success-600 mt-px size-4 shrink-0" />
          ) : (
            <XCircle className="text-danger-600 mt-px size-4 shrink-0" />
          )}
          <p className="text-ink-800 flex-1 text-sm">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-ink-400 hover:text-ink-700 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
