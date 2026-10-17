/**
 * @module ui/use-stable-moment
 * @purpose Values that keep their object identity while their content is unchanged, so a chart-compute
 * effect can list them as dependencies (#638) and `react-hooks/exhaustive-deps` can check the list.
 * @conventions The person store hands out new objects on every sync pull, even when this person's own data
 * did not change; depending on those objects would recompute every chart on an unrelated pull. A moment is
 * compared through `momentKey`, the link encoding that already defines "the same moment".
 * @exports useStableBy, useStableMoment
 */
import { useState } from 'react';
import type { BirthMomentInput } from '../time/types.js';
import { momentKey } from '../time/encode.js';

/** `value`, or the object returned last time when `keyOf` gives the same key for both. */
export function useStableBy<T>(value: T, keyOf: (value: T) => string | undefined): T {
  const [stable, setStable] = useState(value);
  // Adjusting state during render, as React documents for "reset state when a prop changes": the render
  // that sees different content is discarded and repeated with the new value.
  if (keyOf(stable) !== keyOf(value)) setStable(value);
  return stable;
}

/** A birth moment that keeps its identity until its encoding changes. */
export function useStableMoment(input: BirthMomentInput | undefined): BirthMomentInput | undefined {
  return useStableBy(input, momentKey);
}
