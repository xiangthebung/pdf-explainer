import { describe, expect, it } from 'vitest';
import { applyEdge, contain, type Rect, type Size } from '../src/hooks/useFloatingPanel';

/**
 * The geometry behind the floating notes.
 *
 * Eight handles is eight chances to get a sign wrong, and the mistakes all look the same
 * from the outside — the panel creeps, or jumps, or turns inside out — so they are worth
 * pinning as arithmetic rather than found by dragging.
 *
 * The case that matters most is pulling an edge *past* the minimum size. Doing it the
 * obvious way (clamp the width, then derive the position from it) lets the panel walk
 * sideways for as long as you keep dragging, because every frame recomputes the position
 * from a pointer that has gone further than the panel can follow.
 */

const BOUNDS: Size = { width: 1000, height: 800 };
const MIN: Size = { width: 300, height: 200 };
const START: Rect = { x: 300, y: 200, width: 400, height: 300 };

/** The four edges of a rect, which is what actually has to stay put. */
const edges = (r: Rect) => ({ left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height });

describe('applyEdge', () => {
  it('moves the west edge and leaves the east one alone', () => {
    const next = applyEdge('w', START, -80, 0, BOUNDS, MIN);
    expect(next).toEqual({ x: 220, y: 200, width: 480, height: 300 });
    expect(edges(next).right).toBe(edges(START).right);
  });

  it('moves the east edge and leaves the west one alone', () => {
    const next = applyEdge('e', START, 120, 0, BOUNDS, MIN);
    expect(next).toEqual({ x: 300, y: 200, width: 520, height: 300 });
    expect(edges(next).left).toBe(edges(START).left);
  });

  it('moves the north edge and leaves the south one alone', () => {
    const next = applyEdge('n', START, 0, -60, BOUNDS, MIN);
    expect(next).toEqual({ x: 300, y: 140, width: 400, height: 360 });
    expect(edges(next).bottom).toBe(edges(START).bottom);
  });

  it('moves the south edge and leaves the north one alone', () => {
    const next = applyEdge('s', START, 0, 90, BOUNDS, MIN);
    expect(next).toEqual({ x: 300, y: 200, width: 400, height: 390 });
    expect(edges(next).top).toBe(edges(START).top);
  });

  it('works both axes at once from a corner', () => {
    expect(applyEdge('nw', START, -50, -40, BOUNDS, MIN)).toEqual({
      x: 250,
      y: 160,
      width: 450,
      height: 340,
    });
    expect(applyEdge('se', START, 50, 40, BOUNDS, MIN)).toEqual({
      x: 300,
      y: 200,
      width: 450,
      height: 340,
    });
    // The mixed corners are the ones a sign error hides in.
    expect(applyEdge('ne', START, 50, -40, BOUNDS, MIN)).toEqual({
      x: 300,
      y: 160,
      width: 450,
      height: 340,
    });
    expect(applyEdge('sw', START, -50, 40, BOUNDS, MIN)).toEqual({
      x: 250,
      y: 200,
      width: 450,
      height: 340,
    });
  });

  it('stops at the minimum without dragging the panel sideways', () => {
    /* Pulling the west edge 900px right on a 400px-wide panel. The panel has to stop at
       300 wide with its east edge exactly where it was — not follow the pointer. */
    const next = applyEdge('w', START, 900, 0, BOUNDS, MIN);
    expect(next.width).toBe(MIN.width);
    expect(edges(next).right).toBe(edges(START).right);
    expect(next.x).toBe(edges(START).right - MIN.width);
  });

  it('stops at the minimum height with the bottom edge pinned', () => {
    const next = applyEdge('n', START, 0, 900, BOUNDS, MIN);
    expect(next.height).toBe(MIN.height);
    expect(edges(next).bottom).toBe(edges(START).bottom);
  });

  it('will not grow past the container', () => {
    const next = applyEdge('se', START, 5000, 5000, BOUNDS, MIN);
    expect(edges(next).right).toBe(BOUNDS.width);
    expect(edges(next).bottom).toBe(BOUNDS.height);
  });

  it('will not push the top-left corner outside the container', () => {
    const next = applyEdge('nw', START, -5000, -5000, BOUNDS, MIN);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
    // And the opposite corner has not moved while the panel grew into the space.
    expect(edges(next).right).toBe(edges(START).right);
    expect(edges(next).bottom).toBe(edges(START).bottom);
  });

  it('changes only the axis the edge belongs to', () => {
    expect(applyEdge('w', START, -40, 999, BOUNDS, MIN).height).toBe(START.height);
    expect(applyEdge('w', START, -40, 999, BOUNDS, MIN).y).toBe(START.y);
    expect(applyEdge('n', START, 999, -40, BOUNDS, MIN).width).toBe(START.width);
    expect(applyEdge('n', START, 999, -40, BOUNDS, MIN).x).toBe(START.x);
  });
});

describe('contain', () => {
  it('leaves a rect that already fits exactly as it is', () => {
    expect(contain(START, BOUNDS, MIN)).toEqual(START);
  });

  it('slides a rect back inside rather than shrinking it', () => {
    const next = contain({ x: 900, y: 700, width: 400, height: 300 }, BOUNDS, MIN);
    expect(next).toEqual({ x: 600, y: 500, width: 400, height: 300 });
  });

  it('pulls negative positions back to the origin', () => {
    expect(contain({ x: -50, y: -80, width: 400, height: 300 }, BOUNDS, MIN)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it('shrinks only when the container is smaller than the panel', () => {
    const small: Size = { width: 360, height: 240 };
    expect(contain(START, small, MIN)).toEqual({ x: 0, y: 0, width: 360, height: 240 });
  });

  it('never returns less than the minimum, even in a container smaller than it', () => {
    const tiny: Size = { width: 120, height: 90 };
    const next = contain(START, tiny, MIN);
    expect(next.width).toBe(MIN.width);
    expect(next.height).toBe(MIN.height);
    /* Positions stay non-negative: a panel wider than its container overflows to the right,
       which is legible, rather than to the left, which puts the header off screen and takes
       the only way to move it back with it. */
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });
});
