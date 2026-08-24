import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Controls are deliberately roomy (44px tall, 15px text). This system is used
 * by people who have spent years in a spreadsheet — cramped inputs are the
 * fastest way to make it feel worse than what it replaces.
 */
const CONTROL =
  'w-full rounded-[var(--radius-md)] border bg-white px-3.5 py-2.5 text-[15px] text-ink-900 ' +
  'placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 ' +
  'focus:border-brand-600 disabled:bg-ink-50 disabled:text-ink-400';

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-ink-700 text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger-600 ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-danger-600 text-xs">{error}</p>
      ) : hint ? (
        <p className="text-ink-400 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A labelled block of related fields, so a long form stays scannable. */
export function FieldSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">{title}</h4>
        {description ? <p className="text-ink-500 mt-0.5 text-xs">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid ? 'border-danger-500' : 'border-ink-200', className)}
      {...props}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalid ? 'border-danger-500' : 'border-ink-200',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'resize-y',
        invalid ? 'border-danger-500' : 'border-ink-200',
        className,
      )}
      {...props}
    />
  );
});
