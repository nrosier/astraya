/**
 * Which planets rule which signs on this device (#426): Modern (the default), Traditional, or Both
 * (co-rulers). A device preference like the report voice and the transit filter — never synced, never
 * sent anywhere — read by every screen that shows a ruler, a dignity or a dispositor, and changed from
 * any of them. A change reaches the other mounted components in the same tab through an event, and
 * other tabs through the browser's `storage` event.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_RULERSHIP_CHOICE, isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';

export const RULERSHIP_KEY = 'astraya:rulershipChoice';
const CHANGED_EVENT = 'astraya:rulership-changed';

/** The saved choice, or the default when none is saved, it is not one of the three, or storage is unavailable. */
export function readRulershipChoice(): RulershipChoice {
  try {
    const stored = localStorage.getItem(RULERSHIP_KEY);
    return isRulershipChoice(stored) ? stored : DEFAULT_RULERSHIP_CHOICE;
  } catch {
    return DEFAULT_RULERSHIP_CHOICE;
  }
}

export function writeRulershipChoice(choice: RulershipChoice): void {
  try {
    localStorage.setItem(RULERSHIP_KEY, choice);
  } catch {
    // Not remembered, but this tab still uses it until it is reloaded.
    memory = choice;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Used only when storage refuses a write, so a choice still takes effect for this page's lifetime. */
let memory: RulershipChoice | undefined;

function snapshot(): RulershipChoice {
  try {
    if (localStorage.getItem(RULERSHIP_KEY) === null && memory !== undefined) return memory;
  } catch {
    if (memory !== undefined) return memory;
  }
  return readRulershipChoice();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The current choice, and a setter that saves it and updates every screen using it. */
export function useRulershipChoice(): readonly [RulershipChoice, (choice: RulershipChoice) => void] {
  const choice = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_RULERSHIP_CHOICE);
  const set = useCallback((next: RulershipChoice) => {
    writeRulershipChoice(next);
  }, []);
  return [choice, set];
}

/** For tests: forgets the in-memory fallback. */
export function resetRulershipMemory(): void {
  memory = undefined;
}
