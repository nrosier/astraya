/**
 * A person's own chart calculation settings (#806): house system, zodiac, orbs, visible points, and the planetary
 * rulers. They used to be one device-wide, per-visit value shared by every person; they are now a
 * `calculationSettings` register and a `rulership` register on the person (`domain/person.ts`), so one client's
 * choices never leak into another's chart.
 *
 * A person who has never saved settings starts from the device's saved default profile (#510), then the
 * application defaults; one who has never saved a ruler choice starts from the device default rulership
 * (`rulership-setting.ts`). A person whose saved registers this build cannot read is reported as `unreadable` and
 * must be shown a notice rather than a chart: the settings returned then are only placeholders.
 */
/**
 * @module ui/person-calculation-settings
 * @purpose Hook giving a screen one person's calculation settings and rulers (own register, else the device default profile / device default rulership, else app defaults) and a setter that writes the person's registers.
 * @conventions Reads from the store state so every screen showing that person re-renders on change, including after a sync; an unreadable or newer-version register is surfaced as `unreadable` and never replaced by defaults for drawing (callers render `UnreadableSettingsNotice`); the setter is one atomic `mutate` batch containing only the registers that changed or are absent (an untouched register keeps its timestamp), and its failure is returned to the caller, never swallowed; returns a content-stable settings object so chart effects do not recompute on unrelated store changes. The orb library, glyph variant and degree-symbol display stay device-wide.
 * @exports PersonCalculationSettings, usePersonCalculationSettings
 */
import { useCallback } from 'react';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { serializeCalculationSettings, serializeRulership } from '../domain/person.js';
import type { Mutation } from '../store/oplog.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useStore, useStoreState } from './store-context.js';
import { useStableBy } from './use-stable-moment.js';

export interface PersonCalculationSettings {
  readonly settings: ExtendedSettings;
  /** The person's planetary-ruler choice: their own, else the device default rulership. */
  readonly rulership: RulershipChoice;
  /** True when the person has a saved register this build cannot read: do not draw a chart from `settings`. */
  readonly unreadable: boolean;
  /** Where `settings` came from. */
  readonly source: 'person' | 'device-default' | 'application-default';
  /** Where `rulership` came from; `application-default` only while a register is unreadable. */
  readonly rulershipSource: 'person' | 'device-default' | 'application-default';
  /**
   * Saves the settings (and, when given, the rulers) on the person in one batch; every screen showing them
   * follows. Registers that already hold the same value are not rewritten. Rejects when the write fails, so the
   * caller can say so.
   */
  readonly setSettings: (next: ExtendedSettings, rulership?: RulershipChoice) => Promise<void>;
}

export function usePersonCalculationSettings(personId: string): PersonCalculationSettings {
  const store = useStore();
  const state = useStoreState();
  const [deviceDefault] = useDefaultCalculationProfile();
  const [deviceRulership] = useRulershipChoice();
  const person = state.people.get(personId);
  const own = person?.calculationSettings;
  const ownRulership = person?.rulership;
  const unreadable = person?.calculationSettingsUnreadable === true;
  const fallback = deviceDefault?.settings ?? DEFAULT_EXTENDED_SETTINGS;
  const resolved = unreadable ? DEFAULT_EXTENDED_SETTINGS : (own ?? fallback);
  const settings = useStableBy(resolved, (value) => JSON.stringify(value));
  const rulership = unreadable ? DEFAULT_RULERSHIP_CHOICE : (ownRulership ?? deviceRulership);
  const setSettings = useCallback(
    async (next: ExtendedSettings, nextRulership?: RulershipChoice): Promise<void> => {
      const mutations: Mutation[] = [];
      if (own === undefined || JSON.stringify(own) !== JSON.stringify(next)) {
        mutations.push({
          entity: 'person',
          entityId: personId,
          field: 'calculationSettings',
          value: serializeCalculationSettings(next),
        });
      }
      if (nextRulership !== undefined && ownRulership !== nextRulership) {
        mutations.push({
          entity: 'person',
          entityId: personId,
          field: 'rulership',
          value: serializeRulership(nextRulership),
        });
      }
      if (mutations.length > 0) await store.mutate(mutations);
    },
    [store, personId, own, ownRulership],
  );
  return {
    settings,
    rulership,
    unreadable,
    source:
      unreadable || own === undefined
        ? deviceDefault === undefined
          ? 'application-default'
          : 'device-default'
        : 'person',
    rulershipSource: unreadable ? 'application-default' : ownRulership === undefined ? 'device-default' : 'person',
    setSettings,
  };
}
