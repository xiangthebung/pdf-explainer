import { STUDY_STYLES, type StudyStyle } from '~shared/types';
import { cx } from '../../lib/utils';
import { STYLE_TINTS, TINT_CLASS } from './Surface';

/**
 * The four ways the notes can be written, as four tiles.
 *
 * Lived inline in the upload screen, which made it a choice you could make
 * exactly once, before you had seen a single note. It is a component now so
 * Settings can offer it mid-deck, where the reader has read a few slides and
 * knows what they want more of.
 */
export function StylePicker({
  value,
  onChange,
  label = 'How should it teach?',
  compact = false,
  className,
}: {
  value: StudyStyle;
  onChange: (next: StudyStyle) => void;
  /** Group name for assistive tech; also the heading when `showLabel`. */
  label?: string;
  /** Two columns at every width, for a sheet rather than a page. */
  compact?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('grid grid-cols-2 gap-2', compact ? '' : 'sm:grid-cols-4', className)}
    >
      {STUDY_STYLES.map((style) => {
        const selected = value === style.id;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(style.id)}
            className={cx(
              'rounded-[13px] border p-3 text-left transition-colors',
              TINT_CLASS[STYLE_TINTS[style.id] ?? 'accent'],
              selected ? 'tint-ring bg-[var(--tint-soft)]' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <span className={cx('text-[13px] font-medium', selected ? 'tint-text' : 'text-ink')}>{style.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{style.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The display name of a style, for labels that name one. */
export function styleLabel(style: StudyStyle): string {
  return STUDY_STYLES.find((option) => option.id === style)?.label ?? 'Balanced';
}
