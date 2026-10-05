/**
 * The most recently viewed person's id (#453): remembered so a tool page (`cycles`/`eclipses`/
 * `horary`/`electional`/`rectification` — none of them person-scoped in the route, `route.ts`)
 * can still show that person's nav tabs instead of losing them, and so navigating from a tool
 * back to a person-scoped page returns to the same person rather than requiring they be picked
 * again. A device preference like symbol class/rulership choice (`rulership-setting.ts`, whose
 * shape this mirrors) — never synced, never sent anywhere.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'astraya:lastPersonId';
const CHANGED_EVENT = 'astraya:last-person-changed';

export function readLastPersonId(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLastPersonId(personId: string): void {
  try {
    if (localStorage.getItem(KEY) === personId) return;
    localStorage.setItem(KEY, personId);
  } catch {
    // Not remembered across a reload or by another tab, but this is a convenience, not a
    // device preference the reader set deliberately — nothing else depends on it taking effect.
    return;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The last person id seen in the URL, or `undefined` on a fresh device or when storage is unavailable. */
export function useLastPersonId(): string | undefined {
  return useSyncExternalStore(subscribe, readLastPersonId, () => undefined);
}
