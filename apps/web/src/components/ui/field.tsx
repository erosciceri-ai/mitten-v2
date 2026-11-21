import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  helpText?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Accessible labeled form field container with inline error and help text slots. */
export function FormField({
  id,
  label,
  required = false,
  error,
  helpText,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
        {required ? <span className="ml-1 text-error" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : helpText ? (
        <p id={`${id}-help`} className="text-sm text-text-muted">
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
