// @vitest-environment jsdom
/**
 * `useStableMoment` / `useStableBy` (#638): the object handed to a chart effect's dependency list keeps its
 * identity while its content is unchanged, and changes the moment the content does.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { BirthMomentInput } from '../src/time/types.js';
import { useStableBy, useStableMoment } from '../src/ui/use-stable-moment.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 12, minute: 30, second: 0 },
  coordinates: { latitude: 52.37, longitude: 4.9 },
};

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
});

function seen<T>(use: (value: T) => T, first: T, ...next: T[]): T[] {
  // One entry per commit: a render that changes the stored value is repeated by React before it commits, and
  // only the last pass of each is what the effects below it would see.
  const results: T[] = [];
  let latest: T | undefined;
  function Probe({ value }: { value: T }): null {
    latest = use(value);
    return null;
  }
  root = createRoot(document.createElement('div'));
  for (const value of [first, ...next]) {
    act(() => {
      root?.render(<Probe value={value} />);
    });
    results.push(latest as T);
  }
  return results;
}

describe('useStableMoment', () => {
  it('returns the first object again for a structurally equal moment', () => {
    const copy: BirthMomentInput = { ...MOMENT, civil: { ...MOMENT.civil } };
    const results = seen(useStableMoment, MOMENT, copy, { ...copy });
    expect(results[0]).toBe(MOMENT);
    expect(results.every((result) => result === MOMENT)).toBe(true);
  });

  it('returns the new object as soon as the moment differs, even by a minute', () => {
    const later: BirthMomentInput = { ...MOMENT, civil: { ...MOMENT.civil, minute: 31 } };
    const results = seen(useStableMoment, MOMENT, later);
    expect(results[results.length - 1]).toBe(later);
  });

  it('follows a moment that appears and disappears', () => {
    const results = seen(useStableMoment, undefined, MOMENT, undefined);
    expect(results[1]).toBe(MOMENT);
    expect(results[2]).toBeUndefined();
  });
});

describe('useStableBy', () => {
  it('keeps an array while its JSON is the same, and replaces it when it is not', () => {
    const a = [1, 2];
    const results = seen((value: number[]) => useStableBy(value, (items) => JSON.stringify(items)), a, [1, 2], [1, 3]);
    expect(results[1]).toBe(a);
    expect(results[2]).toEqual([1, 3]);
  });
});
