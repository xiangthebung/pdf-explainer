import { useEffect, useId, useRef, useState } from 'react';
import { Check, Columns2, Expand, Film, Layers, LayoutPanelTop, Presentation } from 'lucide-react';
import { cx } from '../lib/utils';

/** Where the notes sit. One value, three named places. */
export type Layout = 'split' | 'overlay' | 'slide';

export const LAYOUTS: { value: Layout; label: string; hint: string; icon: typeof Columns2 }[] = [
  { value: 'split', label: 'Split', hint: 'Notes beside the slide', icon: Columns2 },
  { value: 'overlay', label: 'Overlay', hint: 'Notes float over a full-size slide', icon: Layers },
  { value: 'slide', label: 'Slide only', hint: 'Nothing but the slide', icon: Presentation },
];

/**
 * One control for every "make the slide bigger" decision.
 *
 * There used to be three buttons here — float the notes, fill the window, full
 * screen — and two of them looked like the same thing. They are not the same
 * thing, and the difference only makes sense written down, so this menu writes
 * it down: pick where the notes live, then decide separately whether the app
 * takes over the display.
 */
export function LayoutMenu({
  layout,
  onLayoutChange,
  showNotesLayouts,
  filmstripOpen,
  onToggleFilmstrip,
  isFullscreen,
  onToggleFullscreen,
}: {
  layout: Layout;
  onLayoutChange: (next: Layout) => void;
  /** False on a phone, where the notes get their own tab instead. */
  showNotesLayouts: boolean;
  filmstripOpen: boolean;
  onToggleFilmstrip: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /* Close on an outside click or Escape; move focus into the menu on open. */
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
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      items[(next + items.length) % items.length]?.focus();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    const raf = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus(),
    );
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const current = LAYOUTS.find((option) => option.value === layout) ?? LAYOUTS[0];
  const CurrentIcon = showNotesLayouts ? current.icon : LayoutPanelTop;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // The name carries the current state as well as the purpose, and still
        // contains the visible word so voice control can reach it.
        aria-label={showNotesLayouts ? `Layout: ${current.label}` : 'View options'}
        onClick={() => setOpen((value) => !value)}
        title={showNotesLayouts ? `Layout: ${current.label} · L to cycle` : 'Thumbnails and full screen'}
        className={cx(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors',
          open ? 'bg-violet-soft text-violet' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{showNotesLayouts ? current.label : 'View'}</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Layout"
          // Opaque on purpose: a menu you can read the slide through is a menu
          // you cannot read.
          className="animate-pop absolute bottom-[calc(100%+8px)] right-0 z-30 w-[272px] overflow-hidden rounded-[14px] border border-line bg-surface p-1.5 shadow-float"
        >
          {showNotesLayouts ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Where the notes go
              </p>
              {LAYOUTS.map((option) => {
                const Icon = option.icon;
                const selected = option.value === layout;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onLayoutChange(option.value);
                      setOpen(false);
                    }}
                    className={cx(
                      'flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors',
                      selected ? 'bg-violet-soft' : 'hover:bg-surface-2',
                    )}
                  >
                    <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-violet' : 'text-ink-3')} />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-[13px] font-medium', selected ? 'text-violet' : 'text-ink')}>
                        {option.label}
                      </span>
                      <span className="block text-[11.5px] leading-snug text-ink-3">{option.hint}</span>
                    </span>
                    {selected ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet" /> : null}
                  </button>
                );
              })}
              <div className="my-1 h-px bg-line" />
            </>
          ) : null}

          <MenuToggle
            icon={Film}
            label="Thumbnails"
            shortcut="F"
            checked={filmstripOpen}
            onClick={() => {
              onToggleFilmstrip();
              setOpen(false);
            }}
          />
          <MenuToggle
            icon={Expand}
            label="Full screen"
            hint="Hide the browser and use the whole display"
            shortcut="⇧F"
            checked={isFullscreen}
            onClick={() => {
              onToggleFullscreen();
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuToggle({
  icon: Icon,
  label,
  hint,
  shortcut,
  checked,
  onClick,
}: {
  icon: typeof Film;
  label: string;
  hint?: string;
  shortcut: string;
  checked: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
    >
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', checked ? 'text-violet' : 'text-ink-3')} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[11.5px] leading-snug text-ink-3">{hint}</span> : null}
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
        {checked ? <Check className="h-3.5 w-3.5 text-violet" /> : null}
        <kbd className="rounded-[5px] bg-surface-2 px-1 py-px font-sans text-[10.5px] text-ink-3">{shortcut}</kbd>
      </span>
    </button>
  );
}
