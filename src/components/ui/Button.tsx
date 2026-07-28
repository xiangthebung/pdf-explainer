import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,color,border-color,transform,opacity] duration-150 ' +
  'active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100 disabled:cursor-default';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-soft',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'bg-surface-2 text-ink hover:bg-surface-3',
  quiet: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-bad-soft text-bad hover:bg-bad hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-[9px]',
  md: 'h-10 px-4 text-[14px] rounded-[11px]',
  lg: 'h-12 px-5 text-[15px] rounded-[13px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, icon, trailing, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
      {trailing}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: Size;
  variant?: Variant;
  active?: boolean;
}

/** Icon-only control. `label` is required so it is never unlabelled for AT. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'quiet', active, className, children, type = 'button', ...rest },
  ref,
) {
  const dimension = size === 'sm' ? 'h-8 w-8 rounded-[9px]' : size === 'lg' ? 'h-12 w-12 rounded-[13px]' : 'h-10 w-10 rounded-[11px]';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        base,
        variants[variant],
        dimension,
        'p-0 shrink-0',
        active && 'bg-accent-soft text-accent-text',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
