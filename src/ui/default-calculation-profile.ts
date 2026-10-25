/**
 * The device's default calculation profile (#510): the concrete `ExtendedSettings` snapshot and
 * planetary-ruler choice every person without calculation settings of their own starts from (#806), remembered from "Save as my
 * default" in Extended settings. A device preference like the rulers and the transit filter — never
 * synced, never sent anywhere — read live by the calculation-basis line
 * and by `person-calculation-settings.ts`. A change reaches other mounted components in the same tab
 * through an event, and other tabs through the browser's `storage` event.
 *
 * Stores the full concrete snapshot rather than a calculation-profile id, because a reader may save a
 * "Custom" draft (one that matches none of the three built-ins) as their default, and there would be
 * nothing to resolve an id back to in that case.
 */
/**
 * @module ui/default-calculation-profile
 * @purpose Device preference (#510) for the ExtendedSettings snapshot and rulers every new chart starts from, set via Extended settings' "Save as my default".
 * @conventions Device preference stored in localStorage as JSON, never synced; changes propagate to other mounted components via a custom event in-tab and the browser's `storage` event across tabs; falls back to an in-memory value when storage writes are refused. Callers fall back to DEFAULT_EXTENDED_SETTINGS/DEFAULT_RULERSHIP_CHOICE themselves when unset.
 * @exports DEFAULT_CALCULATION_PROFILE_KEY, DefaultCalculationProfile, readDefaultCalculationProfile, writeDefaultCalculationProfile, useDefaultCalculationProfile, resetDefaultCalculationProfileMemory
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import { parseCalculationSnapshot } from '../domain/calculation-snapshot.js';

export const DEFAULT_CALCULATION_PROFILE_KEY = 'astraya:defaultCalculationProfile';
const CHANGED_EVENT = 'astraya:default-calculation-profile-changed';

export interface DefaultCalculationProfile {
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
}

/**
 * Field-by-field, via `parseCalculationSnapshot` (#541) — not merely "is this a non-null
 * object with a string rulership somewhere in it". A legacy or hand-edited value can have the
 * right shape at the top level but a missing or wrong-typed field underneath; each such field
 * is repaired to its own documented app default individually rather than silently passed
 * through, or the whole value rejected.
 */
function parseDefaultCalculationProfile(value: unknown): DefaultCalculationProfile {
  const snapshot = parseCalculationSnapshot(value);
  return { settings: snapshot.settings, rulership: snapshot.rulership };
}

/** The saved default, or `undefined` when none is saved or storage is unavailable — never malformed, since every field is individually validated/repaired on the way out. */
export function readDefaultCalculationProfile(): DefaultCalculationProfile | undefined {
  try {
    const stored = localStorage.getItem(DEFAULT_CALCULATION_PROFILE_KEY);
    if (stored === null) return undefined;
    const parsed: unknown = JSON.parse(stored);
    return parseDefaultCalculationProfile(parsed);
  } catch {
    return undefined;
  }
}

export function writeDefaultCalculationProfile(settings: ExtendedSettings, rulership: RulershipChoice): void {
  const value: DefaultCalculationProfile = { settings, rulership };
  try {
    localStorage.setItem(DEFAULT_CALCULATION_PROFILE_KEY, JSON.stringify(value));
  } catch {
    // Not remembered, but this tab still uses it until it is reloaded.
    memory = value;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Used only when storage refuses a write, so a choice still takes effect for this page's lifetime. */
let memory: DefaultCalculationProfile | undefined;

// useSyncExternalStore requires getSnapshot to return the same reference until something actually
// changes; readDefaultCalculationProfile() parses fresh JSON on every call, which is unstable, so
// this caches the last raw storage value alongside its parsed result.
let cachedRaw: string | null = null;
let cachedValue: DefaultCalculationProfile | undefined;

function snapshot(): DefaultCalculationProfile | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DEFAULT_CALCULATION_PROFILE_KEY);
  } catch {
    return memory;
  }
  if (raw === null) return memory;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readDefaultCalculationProfile();
  }
  return cachedValue;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The current default (or `undefined`), and a setter that saves it and updates every screen using it. */
export function useDefaultCalculationProfile(): readonly [
  DefaultCalculationProfile | undefined,
  (settings: ExtendedSettings, rulership: RulershipChoice) => void,
] {
  const value = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const set = useCallback((settings: ExtendedSettings, rulership: RulershipChoice) => {
    writeDefaultCalculationProfile(settings, rulership);
  }, []);
  return [value, set];
}

/** For tests: forgets the in-memory fallback. */
export function resetDefaultCalculationProfileMemory(): void {
  memory = undefined;
  cachedRaw = null;
  cachedValue = undefined;
}
