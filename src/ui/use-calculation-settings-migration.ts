/**
 * Runs the one-time move of the device's chart settings onto existing people (#806, decision D4).
 */
/**
 * @module ui/use-calculation-settings-migration
 * @purpose Hook that, once per account store on this device, stamps the device's saved default calculation settings onto every existing person who has none of their own.
 * @conventions Signed in: waits for the first completed sync (engine status `synced`) so a register already chosen on another device is pulled before anything is written, then never overwrites it; signed out: runs on first launch. Guarded by a localStorage device key per account (or `anonymous`) so it runs once; the key is set only after the write succeeds, and also when there is nothing to write. Writes are one atomic `store.seed` batch stamped at the minimum HLC so any real choice from any device wins, even one made offline; because seeds sit below the sync cursor, signed in they are pushed once with `pushRecords`, and a retry re-pushes this device's seeded records from `store.outgoing()`; the key is set only after seed and push both succeed.
 * @exports CALCULATION_SETTINGS_MIGRATED_KEY, useCalculationSettingsMigration
 */
import { useEffect } from 'react';
import { isHlc, decodeHlc } from '../store/hlc.js';
import type { OpRecord } from '../store/ops.js';
import type { Store } from '../store/store.js';
import { pushRecords } from '../sync/engine.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { stageCalculationSettingsMigration } from '../domain/calculation-settings-migration.js';
import { readDefaultCalculationProfile } from './default-calculation-profile.js';
import { useSessionUserOrUndefined, useStoreStatus, useSyncEngine } from './session-context.js';

export const CALCULATION_SETTINGS_MIGRATED_KEY = 'astraya:calculationSettingsMigrated';

function guardKey(userId: string | undefined): string {
  return `${CALCULATION_SETTINGS_MIGRATED_KEY}:${userId ?? 'anonymous'}`;
}

function alreadyDone(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markDone(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Not remembered: the migration never overwrites a register, so running again is harmless.
  }
}

/** This device's own seeded `calculationSettings` records (millis 0), which the sync cursor never covers. */
function ownSeeds(store: Store): readonly OpRecord[] {
  return store.outgoing().filter((record) => {
    if (record.deviceId !== store.deviceId || record.entity !== 'person' || record.field !== 'calculationSettings') {
      return false;
    }
    const hlc = String(record.hlc);
    return isHlc(hlc) && decodeHlc(hlc).millis === 0;
  });
}

export function useCalculationSettingsMigration(): void {
  const status = useStoreStatus();
  const user = useSessionUserOrUndefined();
  const engine = useSyncEngine();
  const userId = user?.id;
  const signedIn = userId !== undefined;
  const store = status.kind === 'ready' ? status.store : undefined;

  useEffect(() => {
    if (!store?.writable) return undefined;
    const key = guardKey(userId);
    if (alreadyDone(key)) return undefined;

    let running = false;
    const attempt = (): void => {
      if (running || alreadyDone(key)) return;
      if (signedIn && engine?.status.kind !== 'synced') return;
      running = true;
      const settings = readDefaultCalculationProfile()?.settings ?? DEFAULT_EXTENDED_SETTINGS;
      const mutations = stageCalculationSettingsMigration(store.state.people.values(), settings);
      const done = (async (): Promise<void> => {
        const fresh = mutations.length === 0 ? [] : await store.seed(mutations);
        if (!signedIn) return;
        const pending = ownSeeds(store);
        const known = new Set(pending.map((record) => String(record.hlc)));
        const toPush = [...pending, ...fresh.filter((record) => !known.has(String(record.hlc)))];
        if (toPush.length > 0) await pushRecords(toPush);
      })();
      void done.then(
        () => {
          markDone(key);
        },
        () => {
          running = false;
        },
      );
    };

    attempt();
    return engine?.subscribe(attempt);
  }, [store, engine, userId, signedIn]);
}
