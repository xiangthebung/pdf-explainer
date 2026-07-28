import type { ReactNode } from 'react';
import { AlertTriangle, Info, RotateCcw } from 'lucide-react';
import { cx } from '../../lib/utils';
import { Button } from './Button';
import { TINT_CLASS, type Tint } from './Surface';

export function Spinner({ className, label }: { className?: string; label?: string }): React.JSX.Element {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cx(
        'inline-block rounded-full border-2 border-line border-t-accent animate-spin h-4 w-4 align-[-2px]',
        className,
      )}
    />
  );
}

export function ProgressBar({
  value,
  label,
  className,
  tone = 'rainbow',
}: {
  value: number;
  label?: string;
  className?: string;
  /** `rainbow` is the default: progress should look like getting somewhere. */
  tone?: 'rainbow' | Tint;
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'rainbow' ? 'bar-rainbow' : cx(TINT_CLASS[tone], 'tint-fill'),
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 22,
  strokeWidth = 2.5,
  label,
  tint = 'violet',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  tint?: Tint;
}): React.JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      className={TINT_CLASS[tint]}
      aria-label={label ?? `${Math.round(clamped)}% complete`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--c-line)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--tint, var(--c-accent))"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 500ms var(--ease-out-soft)' }}
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cx('skeleton rounded-[10px]', className)} aria-hidden="true" />;
}

/** The waiting state for notes: shaped like the content that is coming. */
export function NoteSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-[78%]" />
      </div>
      <Skeleton className="h-24 w-full rounded-[16px]" />
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-[88%]" />
        <Skeleton className="h-3 w-[70%]" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tint,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Ties the empty state to whatever it is inviting you to do. */
  tint?: Tint;
}): React.JSX.Element {
  return (
    <div className={cx('mx-auto flex max-w-[340px] flex-col items-center px-6 py-10 text-center', className)}>
      {icon ? (
        <div
          className={cx(
            'mb-4 flex h-11 w-11 items-center justify-center rounded-[14px]',
            tint ? cx(TINT_CLASS[tint], 'tint-chip') : 'bg-surface-2 text-ink-2',
          )}
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {description ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</p> : null}
      {action ? <div className="mt-5 w-full">{action}</div> : null}
    </div>
  );
}

export type NoticeTone = 'info' | 'warn' | 'error';

const noticeTones: Record<NoticeTone, { wrap: string; icon: string }> = {
  info: { wrap: 'bg-accent-soft text-ink', icon: 'text-accent-text' },
  warn: { wrap: 'bg-warn-soft text-ink', icon: 'text-warn' },
  error: { wrap: 'bg-bad-soft text-ink', icon: 'text-bad' },
};

export function Notice({
  tone = 'info',
  title,
  children,
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}): React.JSX.Element {
  const palette = noticeTones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-[14px] p-3.5 text-[13px] leading-relaxed', palette.wrap, className)}
    >
      <span className={cx('mt-px shrink-0', palette.icon)}>
        {tone === 'info' ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx('min-w-0', title && 'mt-0.5', 'text-ink-2')}>{children}</div> : null}
        {(onRetry || onDismiss) && (
          <div className="mt-2.5 flex gap-2">
            {onRetry ? (
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onRetry}>
                {retryLabel}
              </Button>
            ) : null}
            {onDismiss ? (
              <Button size="sm" variant="quiet" onClick={onDismiss}>
                Dismiss
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
