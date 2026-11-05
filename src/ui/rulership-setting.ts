/**
 * The reader's default rulership (#426): Modern (the default), Traditional, or Both (co-rulers). Since #806 each person
 * has their own rulership register; this default is what a person without one starts from, what a new person is given
 * at creation, and what the screens that belong to no single person (Horary, Composite) show.
 *
 * Since #1066 it is an account preference: it lives in the op log of the open store and follows a signed-in reader
 * across devices. `account-preferences.ts` owns reading and saving it; this module is its rulership-shaped view. The
 * pre-#1066 `astraya:rulershipChoice` key is read only once, as the one-time migration source.
 */
/**
 * @module ui/rulership-setting
 * @purpose Default rulership (#426, #806, #1066): the Modern/Traditional/Both choice a person without their own starts from, a new person is given, and Horary/Composite show.
 * @conventions A thin view over `account-preferences.ts`: reads come from its in-memory snapshot of the bound store, never from localStorage; a change is saved local-first, then as one op-log write; every mounted reader updates through the shared subscription.
 * @exports RULERSHIP_KEY, readRulershipChoice, writeRulershipChoice, useRulershipChoice, resetRulershipMemory
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { ACCOUNT_RULERSHIP_FIELD } from '../store/account.js';
import {
  LEGACY_RULERSHIP_KEY,
  forgetAccountPreferenceField,
  getAccountPreferences,
  setAccountPreferences,
  subscribeAccountPreferences,
} from './account-preferences.js';

/** The pre-#1066 device key, kept as the registry's identifier and the one-time migration source. */
export const RULERSHIP_KEY = LEGACY_RULERSHIP_KEY;

/** The current default rulership. */
export function readRulershipChoice(): RulershipChoice {
  return getAccountPreferences().defaultRulership;
}

export function writeRulershipChoice(choice: RulershipChoice): void {
  // A failed save rolls back and is reported by `account-preferences.ts`.
  setAccountPreferences({ defaultRulership: choice }).catch(() => undefined);
}

/** The current choice, and a setter that saves it and updates every screen using it. */
export function useRulershipChoice(): readonly [RulershipChoice, (choice: RulershipChoice) => void] {
  const choice = useSyncExternalStore(subscribeAccountPreferences, readRulershipChoice, () => DEFAULT_RULERSHIP_CHOICE);
  return [choice, writeRulershipChoice];
}

/** For tests: forgets a choice made with no store open. */
export function resetRulershipMemory(): void {
  forgetAccountPreferenceField(ACCOUNT_RULERSHIP_FIELD);
}
