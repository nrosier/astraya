/**
 * @module ui/use-chart-search-run
 * @purpose React hook that holds the run state of the "Search charts" card (#1405) and runs a search over the live people with the app's ephemeris provider.
 * @conventions Explicit runs only: nothing computes until `run` is called. The last finished result is kept while a new run is going and dropped when a run fails (a stale list would read as current). A run that is superseded or outlived by the component is ignored. The provider comes from `EphemerisProviderContext` (no sweph-wasm import here); people without their own settings use the default calculation profile and rulership choice. One subject cache lives as long as the card, so a second run that changes only the conditions makes no provider call.
 * @exports ChartSearchRunHook, useChartSearchRun
 */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import type { ChartSearch } from '../domain/chart-search.js';
import { errorDetail } from './api-error.js';
import {
  createSubjectCache,
  runChartSearch,
  type ChartSearchRunState,
  type PersonRunResult,
} from './chart-search-run.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useStoreState } from './store-context.js';

export interface ChartSearchRunHook {
  readonly state: ChartSearchRunState;
  /** The last finished result: kept while the next run is going, `undefined` before the first run and after a failure. */
  readonly results: readonly PersonRunResult[] | undefined;
  /** Runs `search` as of `asOf` (`yyyy-mm-dd`). */
  readonly run: (search: ChartSearch, asOf: string) => void;
}

export function useChartSearchRun(): ChartSearchRunHook {
  const { provider, error: providerError } = useEphemerisProvider();
  const { people } = useStoreState();
  const [defaultProfile] = useDefaultCalculationProfile();
  const [rulership] = useRulershipChoice();
  const [cache] = useState(createSubjectCache);
  const [state, setState] = useState<ChartSearchRunState>({ status: 'idle' });
  const [results, setResults] = useState<readonly PersonRunResult[]>();
  const sequence = useRef(0);

  useEffect(
    () => () => {
      // Unmounted: whatever is still running must not set state.
      sequence.current = -1;
    },
    [],
  );

  const run = (search: ChartSearch, asOf: string): void => {
    sequence.current += 1;
    const mine = sequence.current;
    setState({ status: 'running' });
    const settings = defaultProfile?.settings ?? DEFAULT_EXTENDED_SETTINGS;
    void (async () => {
      try {
        if (provider === undefined) throw new Error(providerError ?? '');
        const done = await runChartSearch({ search, people, asOf, defaults: { settings, rulership } }, provider, cache);
        if (sequence.current !== mine) return;
        setResults(done);
        setState({ status: 'done', results: done });
      } catch (cause: unknown) {
        if (sequence.current !== mine) return;
        setResults(undefined);
        setState({ status: 'error', message: errorDetail(cause) });
      }
    })();
  };

  return { state, results, run };
}
