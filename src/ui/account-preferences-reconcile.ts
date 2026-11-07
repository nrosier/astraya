/**
 * Sign-in reconciliation of the account preferences (#1066, ADR 0004 sections 3.6 and 5).
 *
 * Two kinds of candidate are offered to a store's `account` register, once:
 *
 * - **At sign-in**, the signed-out store's own preferences. They are captured before that store closes and kept in the
 *   account store's meta (`persistSignInCandidates`), so a reload before the account's first sync still offers them.
 * - **On the first launch of this build**, the pre-#1066 device values captured by `account-preferences.ts`. Their age
 *   is unknown. Signed out they go into the signed-out store; signed in, into the account that answers the prompt.
 *
 * `captureSignInCandidates` and `persistSignInCandidates` live in `account-preferences.ts`, which `session-context.tsx`
 * imports. The plan (`planReconcile`) writes what overwrites nothing, skips what the account already chose later, and asks the
 * reader about the rest in one prompt. An account store waits for its first completed sync, so the account's values
 * from other devices are known before anything is compared; the signed-out store runs at once.
 *
 * @module ui/account-preferences-reconcile
 * @purpose Captures sign-in candidates, runs the one-time reconciliation of this device's preferences into the open store's account register, and exposes the prompt for the settings that differ.
 * @conventions An account store reconciles only after its sync engine reports `synced`; writes use `store.mutate` (a real timestamp), never `seed`; the marker records the newest candidate already reconciled so a declined prompt is not repeated; the legacy guard is set only once a store has taken or declined the legacy values; a read-only tab never reconciles.
 * @exports AccountReconcilePrompt, useAccountPreferencesReconcile
 */
import { useEffect, useState } from 'react';
import {
  planReconcile,
  resolutionWrites,
  type ReconcileCandidates,
  type ReconcileProposal,
  type ReconcileResolution,
} from '../domain/account-preferences.js';
import { newerHlc } from '../store/account.js';
import { DB_NAME } from '../store/db.js';
import type { Mutation } from '../store/oplog.js';
import type { Store } from '../store/store.js';
import { completeLegacyMigration, isAccountMigrationDone, legacyCandidates } from './account-preferences.js';
import { useStoreStatus, useSyncEngine } from './session-context.js';

/** The settings that differ, and how the reader's answer is applied. Dismissing equals "Use my account's". */
export interface AccountReconcilePrompt {
  readonly proposals: readonly ReconcileProposal[];
  /** Whether the store is a signed-in account's (wording) or the signed-out one's. */
  readonly account: boolean;
  readonly resolve: (resolutions: readonly ReconcileResolution[]) => Promise<void>;
}

/** Runs the reconciliation for the open store and returns the prompt while one is waiting for an answer. */
export function useAccountPreferencesReconcile(): AccountReconcilePrompt | undefined {
  const status = useStoreStatus();
  const engine = useSyncEngine();
  const store = status.kind === 'ready' ? status.store : undefined;
  const [prompt, setPrompt] = useState<{ readonly store: Store; readonly value: AccountReconcilePrompt }>();

  useEffect(() => {
    if (store?.writable !== true) return undefined;
    const isAccountStore = store.dbName !== DB_NAME;
    let cancelled = false;
    // Read through a function: a plain read narrows to `false` across the awaits below, hiding the cleanup's write.
    const isCancelled = (): boolean => cancelled;
    let running = false;
    let done = false;

    const attempt = (): void => {
      if (running || done || cancelled) return;
      // An account's values from its other devices must be known first; offline (no engine) it waits.
      if (isAccountStore && engine?.status.kind !== 'synced') return;
      running = true;
      void (async (): Promise<void> => {
        const state = await store.getAccountReconcile();
        const usesLegacy = !isAccountMigrationDone();
        const fromSignIn: ReconcileCandidates = state.pending ?? {};
        // A sign-in candidate has a timestamp and wins over a legacy value of unknown age for the same field.
        const candidates: ReconcileCandidates = { ...(usesLegacy ? legacyCandidates() : {}), ...fromSignIn };
        let marker = state.marker;
        for (const candidate of Object.values(fromSignIn)) marker = newerHlc(marker, candidate.hlc);

        const finish = async (writes: readonly Mutation[]): Promise<void> => {
          if (writes.length > 0) await store.mutate(writes);
          await store.setAccountReconcile(marker === undefined ? {} : { marker });
          if (usesLegacy) completeLegacyMigration();
          done = true;
        };

        if (Object.keys(candidates).length === 0) {
          if (usesLegacy) completeLegacyMigration();
          done = true;
          return;
        }
        const plan = planReconcile(candidates, store.state.account);
        // With nothing to ask, the writes go in now. With a question to ask, none of them do until it is answered:
        // nothing from the capture reaches an account that did not answer the prompt (ADR 0004 section 5).
        if (plan.proposals.length === 0) {
          await finish(plan.writes);
          return;
        }
        if (isCancelled()) return;
        setPrompt({
          store,
          value: {
            proposals: plan.proposals,
            account: isAccountStore,
            resolve: async (resolutions) => {
              await finish([...plan.writes, ...resolutionWrites(plan.proposals, resolutions)]);
              setPrompt(undefined);
            },
          },
        });
      })()
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };

    attempt();
    const unsubscribe = engine?.subscribe(attempt);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [store, engine]);

  // A prompt belongs to the store it was planned for; a store switch drops it, and the new store plans its own.
  return prompt !== undefined && prompt.store === store ? prompt.value : undefined;
}
