import { describe, expect, it } from 'vitest';
import { describePlan, planPractice } from '../shared/practicePlan';
import { modelRequestsPerMinute } from '../shared/models';

const LITE = 'gemini-flash-lite-latest';
const FLASH = 'gemini-flash-latest';

describe('modelRequestsPerMinute', () => {
  it('knows the catalogue and guesses conservatively otherwise', () => {
    expect(modelRequestsPerMinute(LITE)).toBe(15);
    expect(modelRequestsPerMinute(FLASH)).toBe(5);
    expect(modelRequestsPerMinute('some-future-flash-lite')).toBe(15);
    expect(modelRequestsPerMinute('some-future-pro')).toBe(5);
    expect(modelRequestsPerMinute(undefined)).toBe(5);
  });

  it('resolves retired ids through the alias table', () => {
    expect(modelRequestsPerMinute('gemini-2.5-flash-lite')).toBe(15);
  });
});

describe('planPractice', () => {
  it('walks a deck in windows when the model has requests to spare', () => {
    const plan = planPractice(43, LITE);
    expect(plan.windows.length).toBe(5);
    expect(plan.singlePass).toBe(false);
    expect(plan.windows[0]).toEqual({ from: 1, to: 10, target: 12 });
    expect(plan.windows.at(-1)?.to).toBe(43);
  });

  it('covers the whole deck in one pass on a five-a-minute model', () => {
    const plan = planPractice(43, FLASH);
    expect(plan.windows).toHaveLength(1);
    expect(plan.singlePass).toBe(true);
    expect(plan.windows[0].from).toBe(1);
    expect(plan.windows[0].to).toBe(43);
    // Worth asking for a lot, since it is the only request we get.
    expect(plan.windows[0].target).toBeGreaterThanOrEqual(24);
    expect(plan.windows[0].target).toBeLessThanOrEqual(40);
  });

  it('paces requests to the model rather than to the network', () => {
    expect(planPractice(43, FLASH).spacingMs).toBe(12_000);
    expect(planPractice(43, LITE).spacingMs).toBe(4_000);
  });

  it('covers every slide exactly once, in order, for either kind of model', () => {
    for (const model of [LITE, FLASH]) {
      for (const total of [1, 4, 10, 11, 43, 137, 400, 2000]) {
        const { windows } = planPractice(total, model);
        expect(windows[0].from).toBe(1);
        expect(windows.at(-1)?.to).toBe(total);
        for (let index = 1; index < windows.length; index += 1) {
          expect(windows[index].from).toBe(windows[index - 1].to + 1);
        }
        for (const window of windows) {
          expect(window.target).toBeGreaterThanOrEqual(4);
          expect(window.target).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it('never fires an unbounded number of requests at a long deck', () => {
    expect(planPractice(2000, LITE).windows.length).toBeLessThanOrEqual(12);
    expect(planPractice(2000, FLASH).windows.length).toBeLessThanOrEqual(3);
  });

  it('handles a one-slide deck and a nonsense count', () => {
    expect(planPractice(1, LITE).windows).toEqual([{ from: 1, to: 1, target: 4 }]);
    expect(planPractice(0, FLASH).windows).toHaveLength(1);
    expect(planPractice(Number.NaN, FLASH).windows).toHaveLength(1);
  });

  it('describes the plan in words a reader can act on', () => {
    expect(describePlan(planPractice(43, FLASH))).toMatch(/one pass/i);
    expect(describePlan(planPractice(43, LITE))).toMatch(/5 passes/i);
  });
});
