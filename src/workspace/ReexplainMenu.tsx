import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { STUDY_STYLES, type StudyStyle } from '~shared/types';
import { cx } from '../lib/utils';
import { STYLE_TINTS, TINT_CLASS } from '../components/ui/Surface';

/**
 * "Re-explain this slide as…", in the note's own header.
 *
 * The style used to be chosen once, on the upload screen, before a single note
 * existed, and there was no way to change your mind about one slide without
 * regenerating from it onwards. This asks for exactly one slide again, in
 * whichever voice you pick, and leaves the rest of the deck as it was.
 *
 * Same menu contract as the layout control: a button with `aria-haspopup`, a
 * `menu` of `menuitemradio`s with the current style checked, arrows to move,
 * Escape and outside clicks to close, focus handed back to the button.
 */
export function ReexplainMenu({
  currentStyle,
  disabled,
  busy,
  onPick,
}: {
  /** The session's style, marked in the list so the reader knows what they have. */
  currentStyle: StudyStyle;
  disabled?: boolean;
  /** A rewrite is already in flight for this slide. */
  busy?: boolean;
  onPick: (style: StudyStyle) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      items[(next + items.length) % items.length]?.focus();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    const raf = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus(),
    );
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(raf);
      if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Re-explain this slide"
        title="Ask for this slide again, in a different style"
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium transition-colors disabled:opacity-40',
          open ? 'bg-violet-soft text-violet' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <RefreshCw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />
        Re-explain
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Re-explain this slide as"
          className="animate-pop absolute right-0 top-[calc(100%+6px)] z-30 w-[248px] overflow-hidden rounded-[14px] border border-line bg-surface p-1.5 shadow-float"
        >
          <p className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Re-explain this slide as
          </p>
          {STUDY_STYLES.map((option) => {
            const selected = option.id === currentStyle;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                aria-label={`Re-explain this slide as ${option.label}`}
                onClick={() => {
                  setOpen(false);
                  onPick(option.id);
                }}
                className={cx(
                  'flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors',
                  TINT_CLASS[STYLE_TINTS[option.id] ?? 'accent'],
                  selected ? 'bg-[var(--tint-soft)]' : 'hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[13px] font-medium', selected ? 'tint-text' : 'text-ink')}>
                    {option.label}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-ink-3">{option.description}</span>
                </span>
                {selected ? <Check className="tint-text mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
