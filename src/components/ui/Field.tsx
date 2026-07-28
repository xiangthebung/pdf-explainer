import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/utils';

const control =
  'w-full rounded-[11px] border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none ' +
  'focus:ring-[3px] focus:ring-accent-soft disabled:opacity-50';

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }): React.JSX.Element {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
      {children}
    </label>
  );
}

interface FieldShellProps {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  id: string;
  children: ReactNode;
  trailing?: ReactNode;
}

function FieldShell({ label, hint, error, id, children, trailing }: FieldShellProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}</Label>
          {trailing}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12px] leading-snug text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className, id: providedId, ...rest },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} trailing={trailing}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cx(control, 'h-10', error && 'border-bad focus:border-bad focus:ring-bad-soft', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id: providedId, ...rest },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <FieldShell label={label} hint={hint} error={error} id={id}>
      <textarea
        ref={ref}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cx(control, 'min-h-[86px] resize-y py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, className, id: providedId, children, ...rest },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <FieldShell label={label} hint={hint} id={id}>
      <select
        ref={ref}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cx(control, 'h-10 cursor-pointer appearance-none bg-[length:16px] pr-9', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238e8e97' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5l4-4'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  id: providedId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}): React.JSX.Element {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[27px] w-[45px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cx(
            'absolute top-[2.5px] h-[22px] w-[22px] rounded-full bg-white shadow-soft transition-[left] duration-200',
            checked ? 'left-[20px]' : 'left-[2.5px]',
          )}
        />
      </button>
    </div>
  );
}
