import type { ChatMessage, PracticeItem, SlideNote } from '~shared/types';
import { CALLOUT_KINDS } from '~shared/types';
import type { CalloutKind } from '~shared/types';

/**
 * Markdown export.
 *
 * Notes belong to the student, not to this app, so everything on screen can
 * leave as one portable file: readable in any editor, and still valid Markdown
 * with the LaTeX and diagrams intact.
 */

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  concept: 'Key concept',
  intuition: 'Intuition',
  memory: 'Memory hook',
  example: 'Real-world example',
  walkthrough: 'Walkthrough',
  watchout: 'Watch out',
};

// Fail loudly in review if a callout kind is ever added without a label.
const missingLabel = CALLOUT_KINDS.find((kind) => !CALLOUT_LABELS[kind]);
if (missingLabel) throw new Error(`Missing callout label for "${missingLabel}"`);

export interface ExportOptions {
  deckName: string;
  totalSlides: number;
  trackNote?: string;
  notes: SlideNote[];
  practice?: PracticeItem[];
  chat?: ChatMessage[];
  includePractice: boolean;
  includeChat: boolean;
  now?: Date;
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

function slideSection(note: SlideNote, includePractice: boolean): string {
  const parts: string[] = [];
  parts.push(`## Slide ${note.slide}${note.summary ? ` — ${note.summary}` : ''}`);

  for (const block of note.blocks) {
    if (block.type === 'callout') {
      parts.push(quote(`**${CALLOUT_LABELS[block.callout]}**\n\n${block.content}`));
    } else {
      parts.push(block.content);
    }
  }

  if (note.worked) {
    parts.push('### Worked example');
    parts.push(note.worked.problem);
    parts.push(note.worked.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
    if (note.worked.answer) parts.push(`**Answer:** ${note.worked.answer}`);
  }

  if (!includePractice) return parts.join('\n\n');

  if (note.quiz.length) {
    parts.push('### Check yourself');
    for (const question of note.quiz) {
      const options = question.options
        .map((option, index) => `- ${letter(index)}. ${option}${index === question.correctIndex ? '  ✓' : ''}`)
        .join('\n');
      const explanation = question.explanation ? `\n\n  ${question.explanation}` : '';
      parts.push(`**${question.question}**\n\n${options}${explanation}`);
    }
  }

  if (note.matching.length) {
    parts.push('### Match the terms');
    for (const set of note.matching) {
      const rows = set.pairs.map((pair) => `| ${pair.concept} | ${pair.definition} |`).join('\n');
      parts.push(`_${set.title}_\n\n| Term | Definition |\n| --- | --- |\n${rows}`);
    }
  }

  if (note.cloze.length) {
    parts.push('### Fill in the blanks');
    parts.push(note.cloze.map((item) => `- ${item.before} **${item.answer}** ${item.after}`.trim()).join('\n'));
  }

  return parts.join('\n\n');
}

function practiceSection(items: PracticeItem[]): string {
  const parts: string[] = ['## Deck review'];
  for (const item of items) {
    const origin = item.slide ? ` _(slide ${item.slide})_` : '';
    if (item.kind === 'quiz') {
      const options = item.options
        .map((option, index) => `- ${letter(index)}. ${option}${index === item.correctIndex ? '  ✓' : ''}`)
        .join('\n');
      parts.push(`**${item.question}**${origin}\n\n${options}${item.explanation ? `\n\n  ${item.explanation}` : ''}`);
    } else if (item.kind === 'match') {
      const rows = item.pairs.map((pair) => `| ${pair.concept} | ${pair.definition} |`).join('\n');
      parts.push(`**${item.title}**${origin}\n\n| Term | Definition |\n| --- | --- |\n${rows}`);
    } else {
      parts.push(`**Fill in the blank**${origin}\n\n${item.before} **${item.answer}** ${item.after}`.trim());
    }
  }
  return parts.join('\n\n');
}

function chatSection(messages: ChatMessage[]): string {
  const parts: string[] = ['## Questions you asked'];
  let currentSlide = -1;
  for (const message of messages) {
    if (message.slide !== currentSlide) {
      currentSlide = message.slide;
      parts.push(`### Slide ${message.slide}`);
    }
    parts.push(`**${message.role === 'user' ? 'You' : 'Tutor'}:** ${message.text}`);
  }
  return parts.join('\n\n');
}

export function buildMarkdownExport(options: ExportOptions): string {
  const now = options.now ?? new Date();
  const notes = [...options.notes].sort((a, b) => a.slide - b.slide);
  const covered = notes.length;

  const header = [
    `# ${options.deckName}`,
    `_${covered} of ${options.totalSlides} slides explained · exported ${now.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}_`,
    options.trackNote ? `\n${options.trackNote}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const body = notes.map((note) => slideSection(note, options.includePractice));
  const extras: string[] = [];
  if (options.includePractice && options.practice?.length) extras.push(practiceSection(options.practice));
  if (options.includeChat && options.chat?.length) extras.push(chatSection(options.chat));

  return [header, ...body, ...extras].join('\n\n---\n\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
}
