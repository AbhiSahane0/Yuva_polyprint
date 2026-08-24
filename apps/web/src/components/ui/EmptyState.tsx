import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon ? <div className="text-ink-300">{icon}</div> : null}
      <div>
        <p className="text-ink-800 text-sm font-semibold">{title}</p>
        {description ? <p className="text-ink-500 mt-1 text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
