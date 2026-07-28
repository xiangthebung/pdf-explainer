import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';

/**
 * Colour is part of the information design here, not decoration: every kind of
 * thing you can read or practise keeps its hue everywhere it appears. `Tint`
 * is the shared vocabulary, and `.tint-*` in index.css holds the values.
 */
export type Tint = 'accent' | 'violet' | 'indigo' | 'cyan' | 'teal' | 'amber' | 'pink' | 'good' | 'bad';

/** One hue per study style, so the choice is memorable rather than four boxes. */
export const STYLE_TINTS: Record<string, Tint> = {
  auto: 'accent',
  deep: 'indigo',
  memorable: 'pink',
  cram: 'amber',
};

export const TINT_CLASS: Record<Tint, string> = {
  accent: 'tint-accent',
  violet: 'tint-violet',
  indigo: 'tint-indigo',
  cyan: 'tint-cyan',
  teal: 'tint-teal',
  amber: 'tint-amber',
  pink: 'tint-pink',
  good: 'tint-good',
  bad: 'tint-bad',
};

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}): React.JSX.Element {
  return <Tag className={cx('rounded-[16px] border border-line bg-surface', className)}>{children}</Tag>;
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | Tint;
  className?: string;
}): React.JSX.Element {
  const base =
    'chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.01em]';
  if (tone === 'neutral') return <span className={cx(base, 'bg-surface-2 text-ink-2', className)}>{children}</span>;
  if (tone === 'warn') return <span className={cx(base, 'bg-warn-soft text-warn', className)}>{children}</span>;
  return <span className={cx(base, TINT_CLASS[tone], 'tint-chip', className)}>{children}</span>;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: number;
  tint?: Tint;
}

/**
 * iOS-style segmented control. Arrow keys move between segments, matching the
 * platform behaviour people already expect from a tab list.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}): React.JSX.Element {
  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('inline-flex rounded-[11px] bg-surface-2 p-[3px]', className)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        // The window-level slide shortcuts must not also fire: one press, one
        // thing moves.
        event.preventDefault();
        event.stopPropagation();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const tint = option.tint ? TINT_CLASS[option.tint] : '';
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] font-medium transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]',
              tint,
              selected ? 'bg-surface shadow-soft' : 'text-ink-2 hover:text-ink',
              selected && (option.tint ? 'tint-text' : 'text-ink'),
            )}
          >
            {option.icon ? (
              /* The hue shows even when the segment is not selected, so the bar
                 reads as three coloured places rather than three grey words. */
              <span className={cx('inline-flex shrink-0', option.tint && (selected ? 'tint-text' : 'tint-text opacity-55'))}>
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
            {option.badge ? (
              <span
                className={cx(
                  'ml-0.5 rounded-full px-1.5 text-[10px] font-semibold',
                  selected ? 'tint-chip' : 'bg-surface-3 text-ink-3',
                )}
              >
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Section heading used inside panels and sheets. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <p className={cx('text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3', className)}>{children}</p>
  );
}
