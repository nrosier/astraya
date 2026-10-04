import { describe, expect, it } from 'vitest';
import { JONES_BODY_KEYS, jonesBodyPositions, jonesShapeOf } from '../src/astrology/jones-shapes.js';
import { bodyByKey } from '../src/astrology/bodies.js';

function positionsOf(longitudes: readonly number[]): Map<number, number> {
  return new Map(longitudes.map((longitude, body) => [body, longitude]));
}

describe('jonesShapeOf (#35)', () => {
  it('is a bundle when every body fits within a trine', () => {
    const result = jonesShapeOf(positionsOf([10, 30, 50, 70, 90]));
    expect(result.shape).toBe('bundle');
    expect(result.span).toBeLessThanOrEqual(120);
    expect(result.groups).toEqual([[0, 1, 2, 3, 4]]);
  });

  it('is a bowl when every body fits within a half of the chart', () => {
    const result = jonesShapeOf(positionsOf([0, 40, 80, 120, 160]));
    expect(result.shape).toBe('bowl');
    expect(result.span).toBeGreaterThan(120);
    expect(result.span).toBeLessThanOrEqual(180);
  });

  it('is a locomotive when exactly one trine is empty', () => {
    const result = jonesShapeOf(positionsOf([0, 55, 110, 165, 220]));
    expect(result.shape).toBe('locomotive');
    expect(result.span).toBeGreaterThan(180);
    expect(result.span).toBeLessThanOrEqual(240);
  });

  it('is a bucket when one body is isolated opposite a tight cluster', () => {
    const result = jonesShapeOf(positionsOf([0, 50, 100, 150, 255]));
    expect(result.shape).toBe('bucket');
    expect(result.handle).toBe(4);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.some((group) => group.length === 1)).toBe(true);
  });

  it('is a seesaw when bodies split into two balanced groups', () => {
    const result = jonesShapeOf(positionsOf([0, 40, 80, 170, 220, 270]));
    expect(result.shape).toBe('seesaw');
    expect(result.handle).toBeUndefined();
    expect(result.groups).toHaveLength(2);
    expect(result.groups.every((group) => group.length >= 2)).toBe(true);
  });

  it('is a splay when bodies split into three or more groups', () => {
    const result = jonesShapeOf(positionsOf([0, 10, 20, 130, 140, 250, 260, 270]));
    expect(result.shape).toBe('splay');
    expect(result.groups.length).toBeGreaterThanOrEqual(3);
  });

  it('is a splash when bodies are spread evenly with no significant gap', () => {
    const result = jonesShapeOf(positionsOf([0, 36, 72, 108, 144, 180, 216, 252, 288, 324]));
    expect(result.shape).toBe('splash');
    expect(result.groups).toEqual([Array.from({ length: 10 }, (_, i) => i)]);
  });

  it('rejects fewer than two bodies', () => {
    expect(() => jonesShapeOf(positionsOf([10]))).toThrow(RangeError);
  });
});

describe('the ten planets and the Bucket handle (#430)', () => {
  const id = (key: string): number => bodyByKey(key)?.id ?? -1;

  it('takes only the ten planets Jones used, never a node, Lilith, an asteroid or Chiron', () => {
    expect(JONES_BODY_KEYS).toHaveLength(10);
    const all = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    const extras = ['meanNode', 'trueNode', 'meanLilith', 'chiron', 'ceres', 'pallas', 'juno', 'vesta'];
    const positions = [...all, ...extras].map((key, index) => ({ body: id(key), longitude: index * 20 }));
    const kept = jonesBodyPositions(positions);
    expect([...kept.keys()].sort()).toEqual(all.map(id).sort());
  });

  it('is not changed by a node or an asteroid, which would otherwise move the shape with a display setting', () => {
    // Ten planets in one trine (a Bundle); a node on the far side would make it a Bucket if it counted.
    const planets = JONES_BODY_KEYS.map((key, index) => ({ body: id(key), longitude: 10 + index * 10 }));
    const withNode = [...planets, { body: id('meanNode'), longitude: 250 }];
    expect(jonesShapeOf(jonesBodyPositions(withNode)).shape).toBe('bundle');
    expect(jonesShapeOf(new Map(withNode.map((p) => [p.body, p.longitude]))).shape).not.toBe('bundle');
  });

  it('calls a lone body with empty circle on both sides the handle, wherever the cluster sits (this module’s convention)', () => {
    // A cluster spanning 200 degrees plus one body 80 degrees beyond each end: a Bucket here, though a
    // stricter reading of Jones would want the cluster within half the circle.
    const result = jonesShapeOf(positionsOf([0, 50, 100, 150, 200, 280]));
    expect(result.shape).toBe('bucket');
    expect(result.handle).toBe(5);
  });

  it('puts a chart a degree either side of a boundary in neighbouring shapes: the lines are hard', () => {
    expect(jonesShapeOf(positionsOf([0, 60, 119])).shape).toBe('bundle');
    expect(jonesShapeOf(positionsOf([0, 60, 121])).shape).toBe('bowl');
  });
});
