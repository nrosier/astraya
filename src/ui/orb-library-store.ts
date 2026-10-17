/**
 * The device's named orb profiles and each context's choice of orbs (#590): a device preference, like the saved
 * calculation default. Never synced, never sent anywhere. Read from localStorage and validated as a whole on the
 * way in, so a damaged stored value reads as an empty library rather than a partial one.
 */
/**
 * @module ui/orb-library-store
 * @purpose Device-stored orb library and per-context orb source (#590), read through a validating parser and shared with React through useSyncExternalStore.
 * @conventions localStorage, JSON, validated by astrology/orb-library on every read; a refused write keeps the value in memory for this page. Changes reach other mounted components in the tab through an event and other tabs through `storage`.
 * @exports ORB_LIBRARY_KEY, readOrbLibrary, writeOrbLibrary, readOrbContextSource, writeOrbContextSource, useOrbLibrary, useOrbContextSource
 */
import { useSyncExternalStore } from 'react';
import { validateOrbLibrary, type OrbContextSource, type OrbLibrary } from '../astrology/orb-library.js';

export const ORB_LIBRARY_KEY = 'astraya:orbLibrary';
export const ORB_CONTEXT_SOURCE_KEY = 'astraya:orbContextSource';
const CHANGED_EVENT = 'astraya:orb-library-changed';

const EMPTY_LIBRARY: OrbLibrary = { profiles: [] };
const EMPTY_SOURCE: OrbContextSource = {};

let memoryLibrary: OrbLibrary | undefined;
let memorySource: OrbContextSource | undefined;

function readRaw(key: string): unknown {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? undefined : (JSON.parse(stored) as unknown);
  } catch {
    return undefined;
  }
}

export function readOrbLibrary(): OrbLibrary {
  const raw = readRaw(ORB_LIBRARY_KEY);
  if (raw === undefined) return memoryLibrary ?? EMPTY_LIBRARY;
  return validateOrbLibrary(raw);
}

export function readOrbContextSource(): OrbContextSource {
  const raw = readRaw(ORB_CONTEXT_SOURCE_KEY);
  if (raw === undefined || typeof raw !== 'object' || raw === null) return memorySource ?? EMPTY_SOURCE;
  const { transit, synastry, natal } = raw as Record<string, unknown>;
  const source: { transit?: string; synastry?: string; natal?: string } = {};
  if (typeof transit === 'string') source.transit = transit;
  if (typeof synastry === 'string') source.synastry = synastry;
  if (typeof natal === 'string') source.natal = natal;
  return source;
}

function write(key: string, value: unknown, remember: (fallback: unknown) => void): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    remember(value);
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function writeOrbLibrary(library: OrbLibrary): void {
  write(ORB_LIBRARY_KEY, library, (value) => {
    memoryLibrary = value as OrbLibrary;
  });
}

export function writeOrbContextSource(source: OrbContextSource): void {
  write(ORB_CONTEXT_SOURCE_KEY, source, (value) => {
    memorySource = value as OrbContextSource;
  });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// useSyncExternalStore needs a stable reference until the stored value changes, so each snapshot is cached by its raw text.
let libraryRaw: string | null | undefined;
let libraryValue: OrbLibrary = EMPTY_LIBRARY;
function librarySnapshot(): OrbLibrary {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ORB_LIBRARY_KEY);
  } catch {
    return memoryLibrary ?? EMPTY_LIBRARY;
  }
  if (raw !== libraryRaw) {
    libraryRaw = raw;
    libraryValue = readOrbLibrary();
  }
  return libraryValue;
}

let sourceRaw: string | null | undefined;
let sourceValue: OrbContextSource = EMPTY_SOURCE;
function sourceSnapshot(): OrbContextSource {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ORB_CONTEXT_SOURCE_KEY);
  } catch {
    return memorySource ?? EMPTY_SOURCE;
  }
  if (raw !== sourceRaw) {
    sourceRaw = raw;
    sourceValue = readOrbContextSource();
  }
  return sourceValue;
}

export function useOrbLibrary(): OrbLibrary {
  return useSyncExternalStore(subscribe, librarySnapshot, () => EMPTY_LIBRARY);
}

export function useOrbContextSource(): OrbContextSource {
  return useSyncExternalStore(subscribe, sourceSnapshot, () => EMPTY_SOURCE);
}
