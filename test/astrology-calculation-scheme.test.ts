/**
 * Unit tests for named traditional scheme bundles (#549) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import {
  CALCULATION_SCHEME_IDS,
  CALCULATION_SCHEMES,
  matchCalculationScheme,
} from '../src/astrology/calculation-scheme.js';

describe('CALCULATION_SCHEMES (#549)', () => {
  it('has one entry per id, each resolving to itself, always traditional rulership', () => {
    for (const id of CALCULATION_SCHEME_IDS) {
      expect(CALCULATION_SCHEMES[id].id).toBe(id);
      expect(CALCULATION_SCHEMES[id].rulershipScheme).toBe('traditional');
    }
  });

  it('each bundle is materially distinct from the others on at least one axis', () => {
    const seen = new Set<string>();
    for (const id of CALCULATION_SCHEME_IDS) {
      const scheme = CALCULATION_SCHEMES[id];
      const signature = `${scheme.boundsScheme}:${scheme.orbProfileId}`;
      expect(seen.has(signature), `${id} duplicates another bundle's (bounds, orb profile) pair`).toBe(false);
      seen.add(signature);
    }
  });

  it('Renaissance (Lilly) uses Ptolemaic bounds, distinct from the other two', () => {
    expect(CALCULATION_SCHEMES['renaissance-lilly-v1'].boundsScheme).toBe('ptolemaic');
    expect(CALCULATION_SCHEMES['hellenistic-v1'].boundsScheme).toBe('egyptian');
    expect(CALCULATION_SCHEMES['medieval-arabic-v1'].boundsScheme).toBe('egyptian');
  });
});

describe('matchCalculationScheme (#549)', () => {
  it('matches each built-in bundle by its exact (boundsScheme, orbProfileId) pair', () => {
    for (const id of CALCULATION_SCHEME_IDS) {
      const scheme = CALCULATION_SCHEMES[id];
      expect(matchCalculationScheme(scheme.boundsScheme, scheme.orbProfileId)).toBe(id);
    }
  });

  it('is undefined (Custom) for a combination no built-in bundle uses', () => {
    expect(matchCalculationScheme('egyptian', 'wide-v1')).toBeUndefined();
    expect(matchCalculationScheme('ptolemaic', 'standard-v1')).toBeUndefined();
  });
});
