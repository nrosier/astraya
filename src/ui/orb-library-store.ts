/**
 * The user's named orb profiles and each context's choice of orbs (#590). Account scope (#1149, guidelines §3.2): both
 * live in the op log on the `account` entity (#1220, ADR 0004) and follow a signed-in reader across devices. This
 * module keeps the small read, write and hook API the screens already used; the values, the local-first apply, the
 * one-time move from the old device keys and the sign-in reconciliation are `account-preferences.ts`'s.
 */
/**
 * @module ui/orb-library-store
 * @purpose The orb library and per-context orb source (#590) as account-scope preferences: read and hook accessors over the account-preferences store, and writers that save through it.
 * @conventions Reads come from the account-preferences snapshot (memory), never from localStorage. A writer applies the value at once and saves it to the open store in the background; a failed save is reported through the account-preferences failure notice, not thrown here. An unreadable stored value reads as empty and is flagged by that notice, never repaired.
 * @exports ORB_LIBRARY_KEY, ORB_CONTEXT_SOURCE_KEY, readOrbLibrary, writeOrbLibrary, readOrbContextSource, writeOrbContextSource, writeOrbLibraryAndSource, useOrbLibrary, useOrbContextSource
 */
import type { OrbContextSource, OrbLibrary } from '../astrology/orb-library.js';
import { getAccountPreferences, setAccountPreferences, useAccountPreferences } from './account-preferences.js';

/** The registry keys of the two settings (and their pre-#1220 device keys). */
export const ORB_LIBRARY_KEY = 'astraya:orbLibrary';
export const ORB_CONTEXT_SOURCE_KEY = 'astraya:orbContextSource';

export function readOrbLibrary(): OrbLibrary {
  return getAccountPreferences().orbLibrary;
}

export function readOrbContextSource(): OrbContextSource {
  return getAccountPreferences().orbContextSource;
}

export function writeOrbLibrary(library: OrbLibrary): void {
  // A failure is shown by the account-preferences notice (it sets `failure`), so the rejection has nowhere else to go.
  void setAccountPreferences({ orbLibrary: library }).catch(() => undefined);
}

export function writeOrbContextSource(source: OrbContextSource): void {
  void setAccountPreferences({ orbContextSource: source }).catch(() => undefined);
}

/** Save both in one durable commit (removing a profile also resets every context that chose it). */
export function writeOrbLibraryAndSource(library: OrbLibrary, source: OrbContextSource): void {
  void setAccountPreferences({ orbLibrary: library, orbContextSource: source }).catch(() => undefined);
}

export function useOrbLibrary(): OrbLibrary {
  return useAccountPreferences().orbLibrary;
}

export function useOrbContextSource(): OrbContextSource {
  return useAccountPreferences().orbContextSource;
}
