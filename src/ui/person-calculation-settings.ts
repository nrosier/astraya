/**
 * A person's own chart calculation settings (#806): house system, zodiac, orbs, visible points. They used to be
 * one device-wide, per-visit value shared by every person; they are now a `calculationSettings` register on the
 * person (`domain/person.ts`), so one client's choices never leak into another's chart.
 *
 * A person who has never saved settings starts from the device's saved default profile (#510), then the
 * application defaults. A person whose saved register this build cannot read is reported as `unreadable` and
 * must be shown a notice rather than a chart: the settings returned then are only placeholders.
 */
/**
 * @module ui/person-calculation-settings
 * @purpose Hook giving a screen one person's calculation settings (own register, else the device default profile, else app defaults) and a setter that writes the person's register.
 * @conventions Reads from the store state so every screen showing that person re-renders on change, including after a sync; an unreadable or newer-version register is surfaced as `unreadable` and never replaced by defaults for drawing (callers render `UnreadableSettingsNotice`); the setter is one atomic register write whose failure is returned to the caller, never swallowed; returns a content-stable settings object so chart effects do not recompute on unrelated store changes. Rulership, the orb library, glyph variant and degree-symbol display stay device-wide.
 * @exports PersonCalculationSettings, usePersonCalculationSettings
 */
import { useCallback } from 'react';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { serializeCalculationSettings } from '../domain/person.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { useStore, useStoreState } from './store-context.js';
import { useStableBy } from './use-stable-moment.js';

export interface PersonCalculationSettings {
  readonly settings: ExtendedSettings;
  /** True when the person has a saved register this build cannot read: do not draw a chart from `settings`. */
  readonly unreadable: boolean;
  /** Where `settings` came from. */
  readonly source: 'person' | 'device-default' | 'application-default';
  /** Saves the settings on the person; every screen showing them follows. Rejects when the write fails, so the caller can say so. */
  readonly setSettings: (next: ExtendedSettings) => Promise<void>;
}

export function usePersonCalculationSettings(personId: string): PersonCalculationSettings {
  const store = useStore();
  const state = useStoreState();
  const [deviceDefault] = useDefaultCalculationProfile();
  const person = state.people.get(personId);
  const own = person?.calculationSettings;
  const unreadable = person?.calculationSettingsUnreadable === true;
  const fallback = deviceDefault?.settings ?? DEFAULT_EXTENDED_SETTINGS;
  const resolved = unreadable ? DEFAULT_EXTENDED_SETTINGS : (own ?? fallback);
  const settings = useStableBy(resolved, (value) => JSON.stringify(value));
  const setSettings = useCallback(
    async (next: ExtendedSettings): Promise<void> => {
      await store.mutate([
        {
          entity: 'person',
          entityId: personId,
          field: 'calculationSettings',
          value: serializeCalculationSettings(next),
        },
      ]);
    },
    [store, personId],
  );
  return {
    settings,
    unreadable,
    source:
      unreadable || own === undefined
        ? deviceDefault === undefined
          ? 'application-default'
          : 'device-default'
        : 'person',
    setSettings,
  };
}
