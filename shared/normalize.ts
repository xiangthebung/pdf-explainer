/**
 * Tolerant normalisation of model output.
 *
 * Language models drift from any schema you give them: numbers arrive as
 * strings, arrays arrive as JSON-in-a-string, matching pairs get stuffed into
 * the title, quiz options come back with "A)" prefixes. Rather than throwing the
 * whole batch away we repair what we can, drop what we cannot trust, and report
 * every repair as a warning so the UI can be honest about it.
 *
 * Rules of the house:
 *  - never invent subject-matter content (a dropped item beats a fabricated one)
 *  - never let a single malformed item take down the batch
 *  - always return a fully-typed, render-safe result
 */

import type {
  CalloutKind,
  ClozeItem,
  ContentBlock,
  DeckTrack,
  ExplainBatch,
  MatchingPair,
  MatchingSet,
  PracticeItem,
  PracticeSet,
  QuizQuestion,
  SlideNote,
  WorkedExample,
} from './types';

const MAX_BLOCKS_PER_SLIDE = 24;
const MAX_BLOCK_CHARS = 24_000;
const MAX_TEXT_CHARS = 4_000;
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;
const MAX_PAIRS = 6;
const MIN_PAIRS = 2;
const MAX_STEPS = 12;
const MAX_SLIDES_PER_BATCH = 120;
const MAX_PRACTICE_ITEMS = 200;

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strip control characters, normalise newlines, cap runaway length. */
export function cleanText(value: unknown, max = MAX_TEXT_CHARS): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
  if (!text) return '';
  text = text.replace(/\r\n?/g, '\n');
  // Keep \n and \t, drop the rest of the C0/C1 range.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.trim();
  if (text.length > max) text = `${text.slice(0, max).trimEnd()}…`;
  return text;
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const match = value.match(/-?\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Accepts an array, a single object (wrapped), or a JSON string containing
 * either. Anything else becomes an empty list.
 */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return toArray(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    return [];
  }
  if (isRecord(value)) return [value];
  return [];
}

function firstString(source: Record<string, unknown>, keys: string[], max = MAX_TEXT_CHARS): string {
  for (const key of keys) {
    const candidate = cleanText(source[key], max);
    if (candidate) return candidate;
  }
  return '';
}

/** Remove "A)", "b.", "(3)", "- " style prefixes the model adds despite instructions. */
export function stripOptionLabel(option: string): string {
  return option
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/^\s*\(?\s*(?:[A-Ha-h]|\d{1,2})\s*[).:\]]\s+/, '')
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* blocks                                                                      */
/* -------------------------------------------------------------------------- */

const CALLOUT_LOOKUP: Array<[RegExp, CalloutKind]> = [
  [/memory|mnemonic|hook|remember/i, 'memory'],
  [/intuition|feel|analogy|picture/i, 'intuition'],
  [/real[\s-]?world|example|application|in practice/i, 'example'],
  [/architecture|walk\s?through|pipeline|step[\s-]?by[\s-]?step/i, 'walkthrough'],
  [/watch|pitfall|caution|warning|mistake|gotcha/i, 'watchout'],
  [/key|core|concept|definition|takeaway/i, 'concept'],
];

export function normalizeCallout(value: unknown): CalloutKind {
  const text = cleanText(value, 120);
  if (!text) return 'concept';
  for (const [pattern, kind] of CALLOUT_LOOKUP) {
    if (pattern.test(text)) return kind;
  }
  return 'concept';
}

function normalizeBlocks(value: unknown, warnings: string[], slide: number): ContentBlock[] {
  // A plain string is a common shortcut the model takes.
  if (typeof value === 'string') {
    const content = cleanText(value, MAX_BLOCK_CHARS);
    return content ? [{ type: 'markdown', content }] : [];
  }

  const raw = toArray(value);
  const blocks: ContentBlock[] = [];

  for (const entry of raw) {
    if (blocks.length >= MAX_BLOCKS_PER_SLIDE) {
      warnings.push(`Slide ${slide}: trimmed to ${MAX_BLOCKS_PER_SLIDE} sections.`);
      break;
    }
    if (typeof entry === 'string') {
      const content = cleanText(entry, MAX_BLOCK_CHARS);
      if (content) blocks.push({ type: 'markdown', content });
      continue;
    }
    if (!isRecord(entry)) continue;

    const content = firstString(entry, ['content', 'text', 'body', 'markdown'], MAX_BLOCK_CHARS);
    if (!content) continue;

    const declaredType = cleanText(entry.type, 40).toLowerCase();
    const calloutHint = entry.calloutType ?? entry.callout ?? entry.variant ?? entry.label;
    const isCallout = declaredType === 'callout' || (declaredType !== 'markdown' && Boolean(calloutHint));

    if (isCallout) {
      blocks.push({ type: 'callout', callout: normalizeCallout(calloutHint ?? declaredType), content });
    } else {
      blocks.push({ type: 'markdown', content });
    }
  }

  return blocks;
}

/* -------------------------------------------------------------------------- */
/* quiz                                                                        */
/* -------------------------------------------------------------------------- */

function normalizeQuiz(value: unknown, slide: number, warnings: string[], idPrefix: string): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  toArray(value).forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const question = firstString(entry, ['question', 'prompt', 'stem', 'text']);
    const rawOptions = toArray(entry.options ?? entry.choices ?? entry.answers)
      .map((option) => {
        if (isRecord(option)) {
          return stripOptionLabel(firstString(option, ['text', 'option', 'label', 'value']));
        }
        return stripOptionLabel(cleanText(option));
      })
      .filter(Boolean);

    if (!question || rawOptions.length < MIN_OPTIONS) {
      if (question || rawOptions.length) warnings.push(`Slide ${slide}: skipped an incomplete quiz question.`);
      return;
    }

    // The prompt contract puts the correct answer at index 0; treat a missing
    // index as 0 rather than dropping an otherwise usable question.
    const declaredIndex = toInt(entry.correctIndex ?? entry.answerIndex ?? entry.correct);
    const correctRaw = declaredIndex === null ? 0 : declaredIndex;
    if (correctRaw < 0 || correctRaw >= rawOptions.length) {
      warnings.push(`Slide ${slide}: dropped a quiz question with an out-of-range answer.`);
      return;
    }

    const correctText = rawOptions[correctRaw];
    const options = dedupeStrings(rawOptions).slice(0, MAX_OPTIONS);
    let correctIndex = options.findIndex((option) => option === correctText);
    if (correctIndex === -1) {
      // The correct answer fell outside the cap — put it back in place.
      options[options.length - 1] = correctText;
      correctIndex = options.length - 1;
    }
    if (options.length < MIN_OPTIONS) {
      warnings.push(`Slide ${slide}: dropped a quiz question with duplicate options.`);
      return;
    }

    out.push({
      id: `${idPrefix}-q${index}`,
      slide,
      question,
      options,
      correctIndex,
      explanation: firstString(entry, ['explanation', 'rationale', 'why', 'feedback']),
    });
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* matching                                                                    */
/* -------------------------------------------------------------------------- */

const PAIR_CONCEPT_KEYS = ['concept', 'term', 'left', 'front', 'name', 'key', 'item', 'label'];
const PAIR_DEFINITION_KEYS = ['definition', 'description', 'right', 'back', 'meaning', 'value', 'details', 'answer', 'text'];

/**
 * Pull `{ concept, definition }` pairs out of the many shapes models produce:
 * proper arrays, objects keyed by concept, JSON embedded in a string, or
 * "Term: definition" lines.
 */
export function extractPairs(source: unknown): MatchingPair[] {
  const candidates: unknown[] = [];

  if (isRecord(source)) {
    const direct =
      source.pairs ??
      source.matchingPairs ??
      source.matching_pairs ??
      source.matchingGames ??
      source.matching_games ??
      source.concepts ??
      source.items ??
      source.matches;
    if (direct !== undefined) {
      if (isRecord(direct)) {
        for (const [concept, definition] of Object.entries(direct)) {
          candidates.push({ concept, definition });
        }
      } else {
        candidates.push(...toArray(direct));
      }
    }
    // Some responses serialise the whole puzzle into `title`.
    if (candidates.length === 0 && typeof source.title === 'string' && source.title.includes('"')) {
      const embedded = source.title.match(/\{[\s\S]*\}/);
      if (embedded) {
        try {
          candidates.push(...extractPairs(JSON.parse(embedded[0])));
        } catch {
          /* not JSON after all */
        }
      }
    }
  } else {
    candidates.push(...toArray(source));
  }

  const pairs: MatchingPair[] = [];
  for (const entry of candidates) {
    if (isRecord(entry)) {
      const concept = firstString(entry, PAIR_CONCEPT_KEYS, 300);
      const definition = firstString(entry, PAIR_DEFINITION_KEYS, 600);
      if (concept && definition) {
        pairs.push({ concept, definition });
        continue;
      }
      if (concept && !definition) {
        const split = splitPairLine(concept);
        if (split) pairs.push(split);
      }
      continue;
    }
    if (typeof entry === 'string') {
      const split = splitPairLine(cleanText(entry, 800));
      if (split) pairs.push(split);
    }
  }

  // Both sides must be unique or the game is unsolvable.
  const seenConcept = new Set<string>();
  const seenDefinition = new Set<string>();
  const unique: MatchingPair[] = [];
  for (const pair of pairs) {
    const c = pair.concept.toLowerCase();
    const d = pair.definition.toLowerCase();
    if (!c || !d || c === d || seenConcept.has(c) || seenDefinition.has(d)) continue;
    seenConcept.add(c);
    seenDefinition.add(d);
    unique.push(pair);
    if (unique.length >= MAX_PAIRS) break;
  }
  return unique;
}

function splitPairLine(line: string): MatchingPair | null {
  const match = line.match(/^(.{2,120}?)\s*(?::|—|–|->|=>|\|)\s*(.{2,})$/s);
  if (!match) return null;
  const concept = cleanText(match[1], 300);
  const definition = cleanText(match[2], 600);
  if (!concept || !definition) return null;
  return { concept, definition };
}

/** Titles sometimes carry JSON fragments; keep only the human sentence. */
export function cleanMatchingTitle(value: unknown): string {
  let title = cleanText(value, 200);
  if (!title) return 'Match each term to its definition';
  for (const marker of ['", "pairs"', '","pairs"', '", pairs', '"pairs":', '{"']) {
    const index = title.indexOf(marker);
    if (index > 0) title = title.slice(0, index);
  }
  // Trim any JSON punctuation left at either end after the cut above.
  title = title.replace(/^[[{"'\s]+|[[\]{}"'\s,:]+$/g, '').trim();
  return title || 'Match each term to its definition';
}

function normalizeMatching(value: unknown, slide: number, warnings: string[], idPrefix: string): MatchingSet[] {
  const out: MatchingSet[] = [];
  const raw = toArray(value);

  // The per-slide schema returns a flat list of pairs rather than sets; if none
  // of the entries look like a set, treat the whole list as one game.
  const looksLikeSets = raw.some((entry) => isRecord(entry) && (entry.pairs || entry.matchingPairs || entry.items));
  const groups = looksLikeSets ? raw : raw.length ? [{ pairs: raw }] : [];

  groups.forEach((group, index) => {
    const pairs = extractPairs(group);
    if (pairs.length < MIN_PAIRS) {
      if (pairs.length) warnings.push(`Slide ${slide}: skipped a matching set with too few valid pairs.`);
      return;
    }
    out.push({
      id: `${idPrefix}-m${index}`,
      slide,
      title: cleanMatchingTitle(isRecord(group) ? group.title : undefined),
      pairs,
    });
  });

  return out;
}

/* -------------------------------------------------------------------------- */
/* fill in the blank                                                           */
/* -------------------------------------------------------------------------- */

const BLANK_PATTERN = /_{2,}|\[([^\]]{1,80})\]|\{\{([^}]{1,80})\}\}/;

/**
 * Produce a usable cloze item, or null. Handles the model putting the answer
 * inline (`... the [ionosphere] delays ...`) or leaving `blankWord` empty.
 */
export function normalizeCloze(value: unknown, slide: number, id: string): ClozeItem | null {
  if (!isRecord(value)) return null;

  let before = firstString(value, ['sentenceBefore', 'before', 'prefix', 'textBefore'], 600);
  let after = firstString(value, ['sentenceAfter', 'after', 'suffix', 'textAfter'], 600);
  let answer = firstString(value, ['blankWord', 'answer', 'word', 'missing', 'blank'], 160);

  // A single `sentence` field with a marker inside is also common.
  const sentence = firstString(value, ['sentence', 'text', 'prompt'], 900);
  if (!before && !after && sentence) {
    const marker = sentence.match(BLANK_PATTERN);
    if (marker) {
      before = cleanText(sentence.slice(0, marker.index ?? 0), 600);
      after = cleanText(sentence.slice((marker.index ?? 0) + marker[0].length), 600);
      answer = answer || cleanText(marker[1] ?? marker[2] ?? '', 160);
    } else {
      before = sentence;
    }
  }

  answer = answer.replace(/^["'([{\s]+|["')\]}\s.,;:]+$/g, '').trim();
  if (/^(blank|answer|todo|n\/a)$/i.test(answer)) answer = '';

  // Answer still missing: recover it from a marker left in either half.
  if (!answer) {
    for (const side of ['before', 'after'] as const) {
      const text = side === 'before' ? before : after;
      const marker = text.match(BLANK_PATTERN);
      const captured = cleanText(marker?.[1] ?? marker?.[2] ?? '', 160);
      if (marker && captured) {
        answer = captured;
        const replaced = `${text.slice(0, marker.index ?? 0)} ${text.slice((marker.index ?? 0) + marker[0].length)}`;
        if (side === 'before') before = cleanText(replaced, 600);
        else after = cleanText(replaced, 600);
        break;
      }
    }
  }

  if (!answer) return null;

  // Remove leftover placeholder markers so the sentence reads cleanly.
  before = before.replace(/_{2,}/g, '').replace(/\s{2,}/g, ' ').trimEnd();
  after = after.replace(/_{2,}/g, '').replace(/\s{2,}/g, ' ').trimStart();
  if (!before && !after) return null;

  return { id, slide, before, answer, after };
}

function normalizeClozeList(value: unknown, slide: number, warnings: string[], idPrefix: string): ClozeItem[] {
  const out: ClozeItem[] = [];
  toArray(value).forEach((entry, index) => {
    const item = normalizeCloze(entry, slide, `${idPrefix}-c${index}`);
    if (item) out.push(item);
    else warnings.push(`Slide ${slide}: skipped a fill-in-the-blank with no answer.`);
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* worked example                                                              */
/* -------------------------------------------------------------------------- */

function normalizeWorked(value: unknown, slide: number, warnings: string[]): WorkedExample | null {
  if (!isRecord(value)) return null;
  const problem = firstString(value, ['problem', 'question', 'prompt', 'statement'], 2000);
  const steps = toArray(value.steps ?? value.solution ?? value.workings)
    .map((step) => (isRecord(step) ? firstString(step, ['text', 'content', 'step'], 2000) : cleanText(step, 2000)))
    .filter(Boolean)
    .slice(0, MAX_STEPS);
  const answer = firstString(value, ['finalAnswer', 'answer', 'result'], 600);

  if (!problem || steps.length === 0) {
    if (problem || steps.length) warnings.push(`Slide ${slide}: skipped an incomplete worked example.`);
    return null;
  }
  return { problem, steps, answer };
}

/* -------------------------------------------------------------------------- */
/* batch                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * When a note has no summary, promote a leading Markdown heading into one and
 * remove it from the body. The panel gets a title, the export gets a section
 * name, and the reader does not see the same line twice.
 */
function liftHeadline(blocks: ContentBlock[]): string {
  const first = blocks[0];
  if (!first || first.type !== 'markdown') return '';
  const match = first.content.match(/^\s*#{1,6}[ \t]+(.+?)[ \t]*(?:\n|$)/);
  if (!match) return '';
  const headline = cleanText(match[1].replace(/\*\*/g, ''), 240);
  if (!headline) return '';
  const rest = first.content.slice(match[0].length).trim();
  if (rest) blocks[0] = { type: 'markdown', content: rest };
  else blocks.shift();
  return headline;
}

function normalizeTrack(value: unknown): DeckTrack {
  const text = cleanText(value, 60).toLowerCase();
  if (!text) return 'mixed';
  if (/non[\s-]?logic|concept|human|qualitative|history|biolog|psych|business/.test(text)) return 'conceptual';
  if (/logic|math|quant|stem|physic|engineer|algorithm|cs\b/.test(text)) return 'quantitative';
  return 'mixed';
}

export interface NormalizeContext {
  requestedFrom: number;
  totalSlides: number | null;
}

export function normalizeExplainBatch(raw: unknown, context: NormalizeContext): ExplainBatch {
  const warnings: string[] = [];
  const source = isRecord(raw) ? raw : {};
  const requestedFrom = Math.max(1, context.requestedFrom || 1);
  const declaredTotal = toInt(source.totalSlides);
  const totalSlides = context.totalSlides ?? (declaredTotal && declaredTotal > 0 ? declaredTotal : null);
  const upperBound = totalSlides ?? Number.MAX_SAFE_INTEGER;

  const rawNotes = toArray(source.explanations ?? source.notes ?? source.slides);
  const bySlide = new Map<number, SlideNote>();

  for (const entry of rawNotes) {
    if (!isRecord(entry)) continue;
    const slideNumber = toInt(entry.slideNumber ?? entry.slide ?? entry.page ?? entry.index);
    if (slideNumber === null || slideNumber < 1 || slideNumber > upperBound) {
      warnings.push('Dropped an explanation with an out-of-range slide number.');
      continue;
    }
    if (bySlide.size >= MAX_SLIDES_PER_BATCH && !bySlide.has(slideNumber)) continue;

    const idPrefix = `s${slideNumber}`;
    const blocks = normalizeBlocks(entry.blocks ?? entry.content ?? entry.explanation, warnings, slideNumber);
    const declaredSummary = firstString(entry, ['summary', 'headline', 'title'], 240);
    const note: SlideNote = {
      slide: slideNumber,
      // `liftHeadline` mutates `blocks`, so it must only run when there is no
      // summary to use.
      summary: declaredSummary || liftHeadline(blocks),
      blocks,
      quiz: normalizeQuiz(entry.quizQuestions ?? entry.quiz, slideNumber, warnings, idPrefix),
      matching: normalizeMatching(entry.matchingGames ?? entry.matching, slideNumber, warnings, idPrefix),
      cloze: normalizeClozeList(entry.fillInBlanks ?? entry.cloze ?? entry.blanks, slideNumber, warnings, idPrefix),
      worked: normalizeWorked(entry.exampleProblem ?? entry.worked ?? entry.practiceProblem, slideNumber, warnings),
    };

    const isEmpty =
      note.blocks.length === 0 &&
      note.quiz.length === 0 &&
      note.matching.length === 0 &&
      note.cloze.length === 0 &&
      !note.worked &&
      !note.summary;
    if (isEmpty) {
      warnings.push(`Slide ${slideNumber}: the model returned nothing usable.`);
      continue;
    }

    const existing = bySlide.get(slideNumber);
    if (existing) {
      // Merge duplicates instead of letting the last one win silently.
      bySlide.set(slideNumber, {
        slide: slideNumber,
        summary: existing.summary || note.summary,
        blocks: [...existing.blocks, ...note.blocks].slice(0, MAX_BLOCKS_PER_SLIDE),
        quiz: [...existing.quiz, ...note.quiz],
        matching: [...existing.matching, ...note.matching],
        cloze: [...existing.cloze, ...note.cloze],
        worked: existing.worked ?? note.worked,
      });
      warnings.push(`Slide ${slideNumber}: merged duplicate explanations.`);
    } else {
      bySlide.set(slideNumber, note);
    }
  }

  const notes = [...bySlide.values()].sort((a, b) => a.slide - b.slide);
  const covered = notes.map((note) => note.slide);
  const from = covered.length ? Math.min(...covered) : requestedFrom;
  const declaredEnd = toInt(source.endSlide);
  const maxCovered = covered.length ? Math.max(...covered) : requestedFrom - 1;
  // Trust our own coverage over the model's self-report, but honour a larger
  // declared end when the model deliberately skipped blank slides.
  const to = Math.min(
    upperBound === Number.MAX_SAFE_INTEGER ? Math.max(maxCovered, declaredEnd ?? maxCovered) : upperBound,
    Math.max(maxCovered, declaredEnd && declaredEnd >= maxCovered ? declaredEnd : maxCovered),
  );

  return {
    requestedFrom,
    from,
    to,
    totalSlides,
    track: normalizeTrack(source.detectedClassType ?? source.track),
    trackNote: firstString(source, ['detectedClassTypeExplanation', 'trackNote', 'note'], 400),
    notes,
    warnings: dedupeStrings(warnings).slice(0, 12),
  };
}

/* -------------------------------------------------------------------------- */
/* deck-wide practice                                                          */
/* -------------------------------------------------------------------------- */

interface PracticeEntry {
  entry: Record<string, unknown>;
  kind?: PracticeItem['kind'];
}

/**
 * Collect the review items from whichever shape came back.
 *
 * The schema we ask for splits items by type (`quizzes`, `matchings`, `blanks`)
 * because a flat "any item" schema makes small models fill fields that do not
 * belong to the item they are writing. Older or looser replies still arrive as
 * one `puzzles` array, so both are accepted, and a declared type always beats
 * the array it arrived in.
 */
function collectPracticeEntries(source: Record<string, unknown>): PracticeEntry[] {
  const flat: PracticeEntry[] = toArray(source.puzzles ?? source.items ?? source.questions)
    .filter(isRecord)
    .map((entry) => ({ entry }));

  const typed: PracticeEntry[] = [
    ...toArray(source.quizzes ?? source.quiz).filter(isRecord).map((entry) => ({ entry, kind: 'quiz' as const })),
    ...toArray(source.matchings ?? source.matching ?? source.matchingGames)
      .filter(isRecord)
      .map((entry) => ({ entry, kind: 'match' as const })),
    ...toArray(source.blanks ?? source.fillInBlanks ?? source.cloze)
      .filter(isRecord)
      .map((entry) => ({ entry, kind: 'cloze' as const })),
  ];

  // Walk the deck in order so the set follows the lecture rather than grouping
  // every quiz together. Stable, so ties keep the model's own ordering.
  return [...flat, ...typed]
    .map((item, index) => ({
      item,
      index,
      slide: toInt(item.entry.sourceSlideNumber ?? item.entry.slide ?? item.entry.slideNumber) ?? 0,
    }))
    .sort((a, b) => (a.slide === b.slide ? a.index - b.index : a.slide - b.slide))
    .map(({ item }) => item);
}

export function normalizePracticeSet(raw: unknown, totalSlides: number | null): PracticeSet {
  const warnings: string[] = [];
  const source = isRecord(raw) ? raw : {};
  const upperBound = totalSlides && totalSlides > 0 ? totalSlides : Number.MAX_SAFE_INTEGER;
  const items: PracticeItem[] = [];

  collectPracticeEntries(source).forEach(({ entry, kind: declaredKind }, index) => {
    if (items.length >= MAX_PRACTICE_ITEMS) return;

    const slideRaw = toInt(entry.sourceSlideNumber ?? entry.slide ?? entry.slideNumber);
    const slide = slideRaw !== null && slideRaw >= 1 && slideRaw <= upperBound ? slideRaw : 0;
    const declared = cleanText(entry.type ?? entry.kind, 40).toLowerCase();
    const id = `p${index}`;

    const hasOptions = toArray(entry.options ?? entry.choices).length >= MIN_OPTIONS;
    const hasPairs = extractPairs(entry).length >= MIN_PAIRS;
    const kind =
      declared === 'quiz' || declared === 'mcq'
        ? 'quiz'
        : declared === 'matching' || declared === 'match'
          ? 'match'
          : declared === 'blank' || declared === 'cloze' || declared === 'fill'
            ? 'cloze'
            : (declaredKind ??
              (hasOptions ? 'quiz' : hasPairs ? 'match' : 'cloze'));

    if (kind === 'quiz') {
      const [question] = normalizeQuiz([entry], slide, warnings, id);
      if (question) items.push({ kind: 'quiz', ...question, id });
      return;
    }
    if (kind === 'match') {
      const pairs = extractPairs(entry);
      if (pairs.length < MIN_PAIRS) {
        warnings.push('Skipped a matching puzzle with too few valid pairs.');
        return;
      }
      items.push({ kind: 'match', id, slide, title: cleanMatchingTitle(entry.title), pairs });
      return;
    }
    const cloze = normalizeCloze(entry, slide, id);
    if (cloze) items.push({ kind: 'cloze', ...cloze });
    else warnings.push('Skipped a fill-in-the-blank with no answer.');
  });

  return { items, warnings: dedupeStrings(warnings).slice(0, 12) };
}

/** Fisher–Yates with an injectable RNG so tests stay deterministic. */
export function shuffle<T>(input: readonly T[], random: () => number = Math.random): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Models are biased towards putting the right answer first (and our prompt asks
 * them to), so options are shuffled server-side before they reach the client.
 */
export function shuffleQuizOptions<T extends { options: string[]; correctIndex: number }>(
  question: T,
  random: () => number = Math.random,
): T {
  const correct = question.options[question.correctIndex];
  const options = shuffle(question.options, random);
  const correctIndex = options.indexOf(correct);
  return { ...question, options, correctIndex: correctIndex === -1 ? 0 : correctIndex };
}
