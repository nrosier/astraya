/**
 * Runs the one-time moves of the device's chart settings, and then its planetary-ruler choice, onto existing people
 * (#806, decision D4).
 */
/**
 * @module ui/use-calculation-settings-migration
 * @purpose Hook that, once per account store on this device, stamps the device's saved default calculation settings, and separately its planetary-ruler choice, onto every existing person who has none of their own.
 * @conventions Signed in: waits for the first completed sync (engine status `synced`) so a register already chosen on another device is pulled before anything is written, then never overwrites it; signed out: runs on first launch. Guarded by a localStorage device key per account (or `anonymous`) so it runs once; the key is set only after the write succeeds, and also when there is nothing to write. Writes are one atomic `store.seed` batch stamped at the minimum HLC so any real choice from any device wins, even one made offline; because seeds sit below the sync cursor, signed in they are pushed once with `pushRecords`, and a retry re-pushes this device's seeded records from `store.outgoing()`; the key is set only after seed and push both succeed. The ruler move has its own guard key (so devices that already ran the settings move still run it) and stamps the live device ruler choice, which is what each chart was drawn with; both moves share one attempt loop, and a retry re-pushes seeded `rulership` records as well.
 * @exports CALCULATION_SETTINGS_MIGRATED_KEY, RULERSHIP_MIGRATED_KEY, useCalculationSettingsMigration
 */
import { useEffect } from 'react';
import { isHlc, decodeHlc } from '../store/hlc.js';
import type { OpRecord } from '../store/ops.js';
import type { Store } from '../store/store.js';
import { pushRecords } from '../sync/engine.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import {
  stageCalculationSettingsMigration,
  stageRulershipMigration,
} from '../domain/calculation-settings-migration.js';
import type { Mutation } from '../store/oplog.js';
import { readDefaultCalculationProfile } from './default-calculation-profile.js';
import { readRulershipChoice } from './rulership-setting.js';
import { useSessionUserOrUndefined, useStoreStatus, useSyncEngine } from './session-context.js';

export const CALCULATION_SETTINGS_MIGRATED_KEY = 'astraya:calculationSettingsMigrated';
export const RULERSHIP_MIGRATED_KEY = 'astraya:rulershipMigrated';

function guardKey(base: string, userId: string | undefined): string {
  return `${base}:${userId ?? 'anonymous'}`;
}

/** One once-only move: its own guard key and the mutations it stages from the current store. */
interface Migration {
  readonly keyBase: string;
  readonly stage: (store: Store) => Mutation[];
}

const MIGRATIONS: readonly Migration[] = [
  {
    keyBase: CALCULATION_SETTINGS_MIGRATED_KEY,
    stage: (store) =>
      stageCalculationSettingsMigration(
        store.state.people.values(),
        readDefaultCalculationProfile()?.settings ?? DEFAULT_EXTENDED_SETTINGS,
      ),
  },
  {
    keyBase: RULERSHIP_MIGRATED_KEY,
    stage: (store) => stageRulershipMigration(store.state.people.values(), readRulershipChoice()),
  },
];

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

/** This device's own seeded `calculationSettings` and `rulership` records (millis 0), which the sync cursor never covers. */
function ownSeeds(store: Store): readonly OpRecord[] {
  return store.outgoing().filter((record) => {
    if (
      record.deviceId !== store.deviceId ||
      record.entity !== 'person' ||
      (record.field !== 'calculationSettings' && record.field !== 'rulership')
    ) {
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
    const pendingMigrations = MIGRATIONS.map((migration) => ({
      migration,
      key: guardKey(migration.keyBase, userId),
    })).filter(({ key }) => !alreadyDone(key));
    if (pendingMigrations.length === 0) return undefined;

    let running = false;
    const attempt = (): void => {
      if (running) return;
      const due = pendingMigrations.filter(({ key }) => !alreadyDone(key));
      if (due.length === 0) return;
      if (signedIn && engine?.status.kind !== 'synced') return;
      running = true;
      // Every move still due goes into one seed batch and one push, so a retry has a single thing to repeat.
      const mutations = due.flatMap(({ migration }) => migration.stage(store));
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
          for (const { key } of due) markDone(key);
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
