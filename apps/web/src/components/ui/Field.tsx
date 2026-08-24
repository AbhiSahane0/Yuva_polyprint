import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-[var(--radius-md)] border bg-white px-3 py-2 text-sm text-ink-900 ' +
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
        {required ? <span className="text-danger-600 ml-0.5">*</span> : null}
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
