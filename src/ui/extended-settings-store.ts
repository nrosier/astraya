/**
 * The chart's confirmed Extended settings (house system, zodiac, orbs, which points show), shared by every
 * screen that draws a chart from them: the natal chart and the solar and lunar returns. Setting Whole Sign on the
 * natal chart then applies to a return too, and the reverse.
 *
 * Held for the page's lifetime, not saved: they are chosen and Redrawn per visit, as they always were on the
 * natal chart. Draconic and harmonic charts do not use them (their positions are transformed from the natal).
 */
/**
 * @module ui/extended-settings-store
 * @purpose Holds the chart's confirmed Extended settings (house system, zodiac, orbs, visible points) shared across every chart-drawing screen (natal, solar/lunar return).
 * @conventions In-memory for the page's lifetime only (chosen and redrawn per visit, never persisted); uses useSyncExternalStore so every screen reading the settings re-renders on change.
 * @exports setExtendedSettings, resetExtendedSettings, useExtendedSettings
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';

let current: ExtendedSettings = DEFAULT_EXTENDED_SETTINGS;
const listeners = new Set<() => void>();

export function setExtendedSettings(next: ExtendedSettings): void {
  current = next;
  for (const listener of listeners) listener();
}

/** For tests: back to the defaults. */
export function resetExtendedSettings(): void {
  setExtendedSettings(DEFAULT_EXTENDED_SETTINGS);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The current settings, and a setter that updates every screen using them. */
export function useExtendedSettings(): readonly [ExtendedSettings, (next: ExtendedSettings) => void] {
  const settings = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_EXTENDED_SETTINGS,
  );
  return [settings, setExtendedSettings];
}
