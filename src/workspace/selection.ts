/**
 * Select-to-ask: the part of it that is arithmetic.
 *
 * Highlight a phrase on the slide and a small chip offers to ask the tutor
 * about it. Deciding whether a selection counts, and where the chip goes, are
 * both pure functions of what the browser reports, and are kept here so they
 * can be tested without a browser reporting anything.
 */

/** Shorter than this is a mis-click, not a phrase. */
export const MIN_SELECTION_CHARS = 2;
/** Longer than this is a slide, not a phrase; the tutor already has the slide. */
export const MAX_SELECTION_CHARS = 600;

/** What the browser's `Selection` provides, narrowed to what is read here. */
export interface SelectionLike {
  rangeCount: number;
  isCollapsed: boolean;
  anchorNode: Node | null;
  focusNode: Node | null;
  toString(): string;
}

/** Glyphs a slide uses to start a bullet. Part of the layout, not of the phrase. */
const LEADING_BULLETS = /^[\s•◦▪▫‣⁃–—\-*·]+/;

/**
 * pdf.js emits one span per text run with no whitespace between lines; fold the
 * run into prose. A drag that starts at the left edge of a bullet takes the
 * bullet glyph with it, and "• Why optimisation matters" is not what anyone
 * meant to ask about.
 */
export function normaliseSelection(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(LEADING_BULLETS, '').trim();
}

/**
 * The selected text, if the whole selection lives inside `container` and is
 * the size of a phrase. Both ends have to be inside: a drag that starts on the
 * slide and ends in the notes is not a question about the slide.
 */
export function readSelection(selection: SelectionLike | null, container: Node | null): string | null {
  if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (!selection.anchorNode || !selection.focusNode) return null;
  if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return null;
  const text = normaliseSelection(selection.toString());
  if (text.length < MIN_SELECTION_CHARS || text.length > MAX_SELECTION_CHARS) return null;
  return text;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChipPlacement {
  /** Centre of the chip, in the coordinate space of `bounds`. */
  x: number;
  /** Top edge of the chip. */
  y: number;
  /** Whether it sits above the selection (the default) or below it, near the top edge. */
  above: boolean;
}

/** Gap between the chip and the selection it belongs to. */
const CHIP_GAP = 8;
/** Keep the chip this far inside the stage, so it never hangs off an edge. */
const CHIP_MARGIN = 6;

/**
 * Where the chip goes: centred over the selection, just above it, flipped to
 * below when the selection is at the top of the stage, and always inside it.
 * `rect` and `bounds` are in the same coordinate space (both from
 * `getBoundingClientRect`); the answer is relative to `bounds`.
 */
export function placeChip(rect: Box, bounds: Box, chip: { width: number; height: number }): ChipPlacement {
  const halfWidth = chip.width / 2;
  const minX = CHIP_MARGIN + halfWidth;
  const maxX = Math.max(minX, bounds.width - CHIP_MARGIN - halfWidth);
  const x = Math.min(maxX, Math.max(minX, rect.left - bounds.left + rect.width / 2));

  const aboveTop = rect.top - bounds.top - CHIP_GAP - chip.height;
  const above = aboveTop >= CHIP_MARGIN;
  const y = above ? aboveTop : rect.top - bounds.top + rect.height + CHIP_GAP;
  return { x, y, above };
}

/** The question the chip sends. Reads as a sentence in the transcript and in an export. */
export function askAboutText(selection: string): string {
  return `Explain this: “${selection}”`;
}
