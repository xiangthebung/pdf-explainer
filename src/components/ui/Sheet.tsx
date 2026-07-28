import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../lib/utils';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog that behaves like a centred sheet on desktop and a bottom sheet
 * on phones. Focus is trapped while open, Escape closes, and the trigger gets
 * focus back on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    // Focus the dialog itself unless a field explicitly asks for it. Focusing the
    // first input would scroll the sheet past its own heading.
    const focusTarget = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
    // Wait a frame so the entrance animation does not fight the focus ring.
    const raf = requestAnimationFrame(() => {
      focusTarget?.focus({ preventScroll: true });
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-[420px]', md: 'sm:max-w-[560px]', lg: 'sm:max-w-[720px]' } as const;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px] dark:bg-black/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-float',
          'rounded-t-[22px] sm:rounded-[20px]',
          widths[width],
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.015em] text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-ink-2">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div ref={scrollRef} className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
