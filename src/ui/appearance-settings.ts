/**
 * Two device appearance preferences (#510): motion and density. Both are stored on this device only, applied as an
 * attribute on the root element the way the theme is (so a stylesheet can answer them before anything draws), and
 * shared by every screen through one external store.
 */
/**
 * @module ui/appearance-settings
 * @purpose Reads, saves, applies and subscribes to the Motion (follow the system / reduce) and Density (standard / compact) device preferences.
 * @conventions Storage is best-effort like theme-dom.ts (a blocked store means "not remembered", never an error); `reduced` motion and `compact` density are the only values written as root attributes — the defaults leave the attribute off so the OS setting and the standard layout apply untouched; a compact density never shrinks touch targets (the stylesheet restores standard sizes on a coarse pointer).
 * @exports MOTION_KEY, DENSITY_KEY, MOTION_CHOICES, DENSITY_CHOICES, MotionChoice, DensityChoice, isMotionChoice, isDensityChoice, readMotion, writeMotion, readDensity, writeDensity, useMotion, useDensity, prefersReducedMotion
 */
import { useCallback, useSyncExternalStore } from 'react';

export const MOTION_KEY = 'astraya.motion';
export const DENSITY_KEY = 'astraya.density';

export const MOTION_CHOICES = ['system', 'reduced'] as const;
export type MotionChoice = (typeof MOTION_CHOICES)[number];
export const DENSITY_CHOICES = ['standard', 'compact'] as const;
export type DensityChoice = (typeof DENSITY_CHOICES)[number];

export function isMotionChoice(value: unknown): value is MotionChoice {
  return typeof value === 'string' && (MOTION_CHOICES as readonly string[]).includes(value);
}

export function isDensityChoice(value: unknown): value is DensityChoice {
  return typeof value === 'string' && (DENSITY_CHOICES as readonly string[]).includes(value);
}

const CHANGED_EVENT = 'astraya:appearance-changed';
let memory: { motion?: MotionChoice; density?: DensityChoice } = {};

function read<T extends string>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return valid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function readMotion(): MotionChoice {
  return memory.motion ?? read(MOTION_KEY, isMotionChoice, 'system');
}

export function readDensity(): DensityChoice {
  return memory.density ?? read(DENSITY_KEY, isDensityChoice, 'standard');
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (readMotion() === 'reduced') root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  if (readDensity() === 'compact') root.dataset.density = 'compact';
  else delete root.dataset.density;
}

function save(key: string, value: string, remember: () => void): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered, but this page uses it until it is reloaded.
    remember();
  }
  apply();
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function writeMotion(next: MotionChoice): void {
  save(MOTION_KEY, next, () => {
    memory = { ...memory, motion: next };
  });
}

export function writeDensity(next: DensityChoice): void {
  save(DENSITY_KEY, next, () => {
    memory = { ...memory, density: next };
  });
}

/** True when this reader wants less motion: their own choice here, or the operating system's. */
export function prefersReducedMotion(): boolean {
  if (readMotion() === 'reduced') return true;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Applied the moment this module is first imported, before any screen has drawn.
if (typeof window !== 'undefined') {
  apply();
  window.addEventListener('storage', (event) => {
    if (event.key === MOTION_KEY || event.key === DENSITY_KEY) {
      apply();
      window.dispatchEvent(new Event(CHANGED_EVENT));
    }
  });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

export function useMotion(): readonly [MotionChoice, (next: MotionChoice) => void] {
  const current = useSyncExternalStore(subscribe, readMotion, () => 'system' as const);
  const set = useCallback((next: MotionChoice) => {
    writeMotion(next);
  }, []);
  return [current, set] as const;
}

export function useDensity(): readonly [DensityChoice, (next: DensityChoice) => void] {
  const current = useSyncExternalStore(subscribe, readDensity, () => 'standard' as const);
  const set = useCallback((next: DensityChoice) => {
    writeDensity(next);
  }, []);
  return [current, set] as const;
}
