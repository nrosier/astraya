/**
 * The reader's default calculation profile (#510): the concrete `ExtendedSettings` snapshot copied onto a person when
 * they are created (#806), and followed live by a person who has none of their own (one made by an older build),
 * remembered from "Save as my default" in Extended settings. Read live by the calculation-basis line and by
 * `person-calculation-settings.ts`.
 *
 * Since #1066 it is an account preference: it lives in the op log of the open store and follows a signed-in reader
 * across devices. `account-preferences.ts` owns reading and saving it; this module is its profile-shaped view. The
 * profile register holds the settings only; the rulers are the separate default-rulership preference, and "Save as my
 * default" writes both in one batch. The pre-#1066 `astraya:defaultCalculationProfile` key is read only once, as the
 * one-time migration source.
 *
 * Stores the full concrete snapshot rather than a calculation-profile id, because a reader may save a
 * "Custom" draft (one that matches none of the three built-ins) as their default, and there would be
 * nothing to resolve an id back to in that case.
 */
/**
 * @module ui/default-calculation-profile
 * @purpose Default calculation profile (#510, #1066): the ExtendedSettings snapshot and rulers every new person starts from, set via Extended settings' "Save as my default".
 * @conventions A thin view over `account-preferences.ts`: reads come from its in-memory snapshot of the bound store, never from localStorage; the returned object is stable until the profile or rulers change (useSyncExternalStore); callers fall back to DEFAULT_EXTENDED_SETTINGS themselves when unset.
 * @exports DEFAULT_CALCULATION_PROFILE_KEY, DefaultCalculationProfile, readDefaultCalculationProfile, writeDefaultCalculationProfile, useDefaultCalculationProfile, resetDefaultCalculationProfileMemory
 */
import { useSyncExternalStore } from 'react';
import type { RulershipChoice } from '../astrology/rulership.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import { ACCOUNT_PROFILE_FIELD } from '../store/account.js';
import {
  LEGACY_PROFILE_KEY,
  forgetAccountPreferenceField,
  getAccountPreferences,
  setAccountPreferences,
  subscribeAccountPreferences,
} from './account-preferences.js';

/** The pre-#1066 device key, kept as the registry's identifier and the one-time migration source. */
export const DEFAULT_CALCULATION_PROFILE_KEY = LEGACY_PROFILE_KEY;

export interface DefaultCalculationProfile {
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
}

// useSyncExternalStore needs the same object until something changes, so the pair is cached on its inputs.
let cachedSettings: ExtendedSettings | undefined;
let cachedRulership: RulershipChoice | undefined;
let cachedValue: DefaultCalculationProfile | undefined;

/** The saved default, or `undefined` when none is saved. Never malformed: the register is read strictly. */
export function readDefaultCalculationProfile(): DefaultCalculationProfile | undefined {
  const { defaultCalculationProfile: settings, defaultRulership: rulership } = getAccountPreferences();
  if (settings === undefined) return undefined;
  if (settings !== cachedSettings || rulership !== cachedRulership) {
    cachedSettings = settings;
    cachedRulership = rulership;
    cachedValue = { settings, rulership };
  }
  return cachedValue;
}

/** "Save as my default": the profile and the rulers, written in one batch. */
export function writeDefaultCalculationProfile(settings: ExtendedSettings, rulership: RulershipChoice): void {
  // A failed save rolls back and is reported by `account-preferences.ts`.
  setAccountPreferences({ defaultCalculationProfile: settings, defaultRulership: rulership }).catch(() => undefined);
}

/** The current default (or `undefined`), and a setter that saves it and updates every screen using it. */
export function useDefaultCalculationProfile(): readonly [
  DefaultCalculationProfile | undefined,
  (settings: ExtendedSettings, rulership: RulershipChoice) => void,
] {
  const value = useSyncExternalStore(subscribeAccountPreferences, readDefaultCalculationProfile, () => undefined);
  return [value, writeDefaultCalculationProfile];
}

/** For tests: forgets a profile saved with no store open. */
export function resetDefaultCalculationProfileMemory(): void {
  forgetAccountPreferenceField(ACCOUNT_PROFILE_FIELD);
}
