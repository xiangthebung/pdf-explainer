import { describe, expect, it } from 'vitest';
import {
  buildModelChain,
  chooseDefaultModel,
  looksTextCapable,
  rankModels,
  resolveModelId,
  resolveModelSelection,
} from '../shared/models';
import type { ModelOption } from '../shared/types';

/**
 * Picking a model out of a catalogue nobody wrote down.
 *
 * The catalogue used to be five hardcoded ids, so none of this needed testing —
 * the list was the test. It comes from Google now, per key, and everything here
 * has to hold for ids that did not exist when it was written. These are the
 * cases that were already wrong when the change landed.
 */

const options = (...ids: string[]): ModelOption[] =>
  ids.map((id) => ({ id, label: id, note: '', requestsPerMinute: 5 }));

/**
 * Every id a real key returned from `models.list`, in August 2026.
 *
 * Not invented. The hand-written list below it was written from memory and was
 * about half right — it did not imagine that Google would offer a *music*
 * model, a robotics planner and a UI-automation model through the same endpoint
 * as Gemini Flash. Thirteen of these thirty-three answer `generateContent` and
 * cannot do anything this app asks for.
 *
 * The catalogue moves, so this will age. It is here as a record of the shapes
 * that actually turn up, which is the part no amount of care invents.
 */
const REAL_CATALOGUE = [
  'antigravity-preview-05-2026',
  'deep-research-max-preview-04-2026',
  'deep-research-preview-04-2026',
  'deep-research-pro-preview-12-2025',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-computer-use-preview-10-2025',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-omni-flash-preview',
  'gemini-pro-latest',
  'gemini-robotics-er-1.5-preview',
  'gemini-robotics-er-1.6-preview',
  'gemini-robotics-er-2-preview',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'lyria-3-clip-preview',
  'lyria-3-pro-preview',
  'nano-banana-pro-preview',
];

/** Roughly what a key with the full catalogue enabled comes back with. */
const REALISTIC = options(
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-live-001',
  'gemini-embedding-001',
  'imagen-4.0-fast-generate-001',
  'veo-3.0-generate-001',
  'gemma-3-27b-it',
);

describe('looksTextCapable', () => {
  it('keeps models that answer with text', () => {
    for (const id of ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash']) {
      expect(looksTextCapable(id), id).toBe(true);
    }
  });

  it('drops Gemma, which is text but takes neither a schema nor a system prompt', () => {
    // All three jobs use one or the other, so offering it is offering a trap.
    expect(looksTextCapable('gemma-4-31b-it')).toBe(false);
  });

  it('drops the families that answer with something else', () => {
    // All of these support generateContent. None of them can write study notes.
    const wrong = [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.5-flash-preview-native-audio-dialog',
      'gemini-2.0-flash-live-001',
      'gemini-embedding-001',
      'imagen-4.0-fast-generate-001',
      'veo-3.0-generate-001',
    ];
    for (const id of wrong) expect(looksTextCapable(id), id).toBe(false);
  });

  it('does not mistake vision for image output', () => {
    // Every explain and practice request sends a PDF, so multimodal *input* is
    // the whole point. Only multimodal output disqualifies a model.
    expect(looksTextCapable('gemini-1.5-pro-vision')).toBe(true);
  });
});

describe('chooseDefaultModel', () => {
  it('gives slide notes full-size Flash rather than Pro', () => {
    /* Ranked on capability alone this picks Pro, and Pro answers the first
       batch with a 429: about two requests a minute on a free key, against a
       flow that is batches by design. See the note in rank(). */
    expect(chooseDefaultModel(REALISTIC, 'explain')).toBe('gemini-2.5-flash');
  });

  it('gives chat and practice the quick end of it', () => {
    // Practice fires several requests in a row and lives on the rate limit.
    expect(chooseDefaultModel(REALISTIC, 'chat')).toBe('gemini-2.5-flash-lite');
    expect(chooseDefaultModel(REALISTIC, 'practice')).toBe('gemini-2.5-flash-lite');
  });

  it('never defaults to a model that cannot answer in text', () => {
    for (const purpose of ['explain', 'chat', 'practice'] as const) {
      expect(looksTextCapable(chooseDefaultModel(REALISTIC, purpose))).toBe(true);
    }
  });

  it('does not let a text-to-speech preview outrank the model it previews', () => {
    /*
     * The regression this exists for. Scoring was `/pro/.test(id)`, a substring
     * match, so `gemini-2.5-pro-preview-tts` scored exactly as well as
     * `gemini-2.5-pro` and won on the alphabetical tiebreak — becoming the
     * default for slide notes on any key that had both.
     */
    const both = options('gemini-2.5-pro-preview-tts', 'gemini-2.5-pro');
    expect(chooseDefaultModel(both, 'explain')).toBe('gemini-2.5-pro');
  });

  it('prefers a newer version, and a stable id over a preview of it', () => {
    expect(chooseDefaultModel(options('gemini-2.5-pro', 'gemini-3.5-pro'), 'explain')).toBe('gemini-3.5-pro');
    expect(chooseDefaultModel(options('gemini-3.5-pro-preview', 'gemini-3.5-pro'), 'explain')).toBe('gemini-3.5-pro');
    // A *-latest alias tracks the newest release of its family.
    expect(chooseDefaultModel(options('gemini-2.5-flash', 'gemini-flash-latest'), 'explain')).toBe(
      'gemini-flash-latest',
    );
  });

  it('ranks a full model above its compact sibling for the heavy job', () => {
    expect(chooseDefaultModel(options('gemini-2.5-flash-lite', 'gemini-2.5-flash'), 'explain')).toBe(
      'gemini-2.5-flash',
    );
  });

  it('returns nothing for an empty catalogue rather than inventing an id', () => {
    // Which the caller reads as "let the server decide" — the state while
    // discovery is still in flight.
    expect(chooseDefaultModel([], 'explain')).toBe('');
    expect(chooseDefaultModel(options('gemini-embedding-001'), 'explain')).toBe('');
  });
});

describe('resolveModelSelection', () => {
  it('keeps a stored preference this key can still call', () => {
    expect(resolveModelSelection('gemini-2.5-flash', REALISTIC, 'explain')).toBe('gemini-2.5-flash');
  });

  it('replaces one it cannot', () => {
    // A retired id in localStorage is simply not in the catalogue. That is the
    // whole migration story, and why there is no alias table any more.
    expect(resolveModelSelection('gemini-1.0-pro-retired', REALISTIC, 'explain')).toBe('gemini-2.5-flash');
    expect(resolveModelSelection('', REALISTIC, 'chat')).toBe('gemini-2.5-flash-lite');
    expect(resolveModelSelection(null, REALISTIC, 'chat')).toBe('gemini-2.5-flash-lite');
  });
});

describe('resolveModelId', () => {
  it('passes a real id through untouched', () => {
    /*
     * There used to be an alias table here, and every id in the discovered
     * catalogue went through it — so a key that genuinely offered
     * `gemini-2.5-flash` had it rewritten to `gemini-flash-latest`, which was
     * then not in the catalogue and was dropped from the chain. The alias table
     * removed working models from the list of working models.
     */
    expect(resolveModelId('gemini-2.5-flash', 'fallback')).toBe('gemini-2.5-flash');
    expect(resolveModelId('gemini-2.5-flash-lite', 'fallback')).toBe('gemini-2.5-flash-lite');
    expect(buildModelChain('gemini-2.5-flash', '', ['gemini-2.5-flash'])).toEqual(['gemini-2.5-flash']);
  });

  it('refuses a value that cannot be a model id', () => {
    expect(resolveModelId('../../etc/passwd', 'fallback')).toBe('fallback');
    expect(resolveModelId('a model with spaces', 'fallback')).toBe('fallback');
    expect(resolveModelId('x'.repeat(200), 'fallback')).toBe('fallback');
    expect(resolveModelId('  ', 'fallback')).toBe('fallback');
    // Tuned and resource names are legitimate.
    expect(resolveModelId('tunedModels/my-tune-abc123', '')).toBe('tunedModels/my-tune-abc123');
  });
});

describe('buildModelChain', () => {
  const available = ['gemini-2.5-flash-lite', 'gemini-3.5-pro', 'gemini-2.5-flash'];

  it('tries what was asked for first', () => {
    expect(buildModelChain('gemini-2.5-flash', '', available, 'explain')[0]).toBe('gemini-2.5-flash');
  });

  it('orders the fallbacks by how good a substitute they are, not by name', () => {
    /*
     * The tail used to be the catalogue in the order it arrived, which was
     * sorted by display name — so what you fell back to after a failure was
     * whatever happened to sort first alphabetically. `gemini-3.5-pro` sorts
     * before both of the others and is last in both of these.
     */
    expect(buildModelChain('', '', available, 'explain')).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-pro',
    ]);
    // The same catalogue, ordered for a job that wants speed instead: the
    // compact model leads rather than following the full-size one.
    expect(buildModelChain('', '', available, 'chat')).toEqual([
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-3.5-pro',
    ]);
  });

  it('puts what was asked for first, whatever the ranking says', () => {
    expect(buildModelChain('gemini-3.5-pro', '', available, 'explain')[0]).toBe('gemini-3.5-pro');
  });

  it('drops a requested model this key does not offer', () => {
    expect(buildModelChain('ghost-model', '', ['gemini-2.5-flash'])).toEqual(['gemini-2.5-flash']);
  });

  it('never grows past a few attempts', () => {
    const many = Array.from({ length: 20 }, (_, index) => `gemini-2.${index}-flash`);
    expect(buildModelChain('', '', many).length).toBeLessThanOrEqual(3);
  });

  it('keeps nothing that cannot answer in text', () => {
    const chain = buildModelChain('', '', ['gemini-embedding-001', 'imagen-4.0-fast-generate-001', 'gemini-2.5-pro']);
    expect(chain).toEqual(['gemini-2.5-pro']);
  });

  it('still tries what was asked for when the catalogue is unknown', () => {
    // An empty list means discovery has not happened or did not work, which is
    // not the same as "this key can call nothing". Filtering against it would
    // turn a failed lookup into a failed request.
    expect(buildModelChain('gemini-2.5-flash', '', [])).toEqual(['gemini-2.5-flash']);
    expect(buildModelChain('', 'gemini-2.5-pro', [])).toEqual(['gemini-2.5-pro']);
    expect(buildModelChain('', '', [])).toEqual([]);
  });
});

describe('against the catalogue a real key returns', () => {
  const kept = REAL_CATALOGUE.filter(looksTextCapable);

  it('drops every family that cannot be handed a deck and a schema', () => {
    const dropped = REAL_CATALOGUE.filter((id) => !looksTextCapable(id));
    expect(dropped.sort()).toEqual(
      [
        'antigravity-preview-05-2026',
        'deep-research-max-preview-04-2026',
        'deep-research-preview-04-2026',
        'deep-research-pro-preview-12-2025',
        'gemini-2.5-computer-use-preview-10-2025',
        'gemini-omni-flash-preview',
        'gemini-robotics-er-1.5-preview',
        'gemini-robotics-er-1.6-preview',
        'gemini-robotics-er-2-preview',
        'gemma-4-26b-a4b-it',
        'gemma-4-31b-it',
        'lyria-3-clip-preview',
        'lyria-3-pro-preview',
        'nano-banana-pro-preview',
      ].sort(),
    );
  });

  it('keeps enough to be a picker', () => {
    // Fourteen of thirty-three go. If a future change takes most of the rest,
    // the fallback in the server hides it — so assert the shape here instead.
    expect(kept.length).toBe(19);
    expect(kept).toContain('gemini-2.5-flash');
    expect(kept).toContain('gemini-pro-latest');
  });

  it('does not read an image model as a fast text one', () => {
    /*
     * `nano-banana-pro-preview` is Google's image generator, and `nano` is in
     * the compact set — so before it was filtered it appeared in the picker
     * labelled as a 15-requests-a-minute model, which is two wrong answers in
     * one row.
     */
    expect(looksTextCapable('nano-banana-pro-preview')).toBe(false);
  });

  it('picks a sensible default for each job', () => {
    const catalogue = options(...kept);
    expect(chooseDefaultModel(catalogue, 'explain')).toBe('gemini-flash-latest');
    expect(chooseDefaultModel(catalogue, 'chat')).toBe('gemini-flash-lite-latest');
    expect(chooseDefaultModel(catalogue, 'practice')).toBe('gemini-flash-lite-latest');
  });

  it('falls back to near neighbours rather than across the catalogue', () => {
    expect(buildModelChain('', 'gemini-flash-latest', kept, 'explain')).toEqual([
      'gemini-flash-latest',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ]);
    expect(buildModelChain('', 'gemini-flash-lite-latest', kept, 'chat')).toEqual([
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);
  });
});

describe('rankModels', () => {
  it('is stable enough to drive a picker', () => {
    const ranked = rankModels(['gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'], 'explain');
    expect(ranked).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
    expect(rankModels([], 'explain')).toEqual([]);
  });
});
