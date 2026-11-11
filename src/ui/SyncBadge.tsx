/**
 * The always-visible answer to "where does my data live, and is it safe?" (#101, #230).
 *
 * A collapsed badge by default — the label and tone alone answer "am I synced" without
 * taking any space — that expands into `describeStatus()`'s full explanation on click
 * (#250). This replaces the old `StatusBar`, which put that same explanation in a footer
 * `<details>` at the bottom of the page: useful the first time, invisible every time after,
 * since nothing above the fold ever pointed at it. Anchoring the disclosure to the badge
 * itself — the thing the user is already looking at when they wonder about sync — means
 * the "Local only" warning is discoverable from every screen, not just the ones long enough
 * to scroll past.
 */
/**
 * @module SyncBadge
 * @purpose Always-visible status dot answering "where does my data live, and is it safe?" — persistence, online, and sync-engine status; it opens a popover with the explanation, a link and Sync now (#1183).
 * @conventions Mounted by ProfileTile, so on every route including routes with no open store. One button holds the avatar (a signed-in account's initial) and the dot on its corner, beside the tile button rather than over it, so no two targets overlap; its name is the status label; uses SyncBadge.messages.ts and status.messages.ts for en/nl text via useMessages().
 * @exports SyncBadge
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { useSyncEngine } from './session-context.js';
import { describeStatus, type SyncState } from './status.js';
import { statusMessages } from './status.messages.js';
import { syncBadgeMessages } from './SyncBadge.messages.js';
import { useOptionalStore } from './store-context.js';
import type { Persistence } from '../store/persist.js';

const OFF_STATUS: SyncState = { kind: 'off' };

// `SyncBadge` is mounted on every route (`App.tsx`), including the handful — /about,
// /changelog, /shared, /set-password, /setup — that never open a store. There is no real
// persistence answer for those, and claiming `'persisted'` would be the exact reassuring
// lie this file exists to avoid; assuming the more cautious `'evictable'` instead only ever
// makes the badge say "back this up" when there may be nothing to back up, never the reverse.
const UNKNOWN_PERSISTENCE: Persistence = { state: 'evictable' };

const POPOVER_ID = 'syncbadge-popover';

function useSyncState(): SyncState {
  const engine = useSyncEngine();
  const subscribe = (onChange: () => void): (() => void) =>
    engine === undefined ? () => undefined : engine.subscribe(onChange);
  return useSyncExternalStore(subscribe, () => engine?.status ?? OFF_STATUS);
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = (): void => {
      setOnline(true);
    };
    const goOffline = (): void => {
      setOnline(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [intervalMs]);
  return now;
}

export function SyncBadge({ initial }: { readonly initial?: string }): React.JSX.Element {
  // `initial` is the signed-in account's initial, drawn as the avatar the dot sits on; a guest has none.
  const engine = useSyncEngine();
  const store = useOptionalStore();
  const online = useOnline();
  const sync = useSyncState();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const t = useMessages(syncBadgeMessages);
  const statusT = useMessages(statusMessages);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    // Otherwise the popover floats open over whatever screen the user navigates to next —
    // both a stray dialog left open for no reason, and (since it's positioned absolutely)
    // something that can sit on top of and intercept clicks on the new page's content.
    if (!open) return;
    const onHashChange = (): void => {
      close();
    };
    window.addEventListener('hashchange', onHashChange);
    // Guidelines §9 (#1081): a popover closes on Escape wherever focus is, and on a click outside it. Escape returns
    // focus to the badge; a click elsewhere leaves focus where the user put it.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target) !== true) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const status = describeStatus(
    {
      online,
      persistence: store?.persistence ?? UNKNOWN_PERSISTENCE,
      pending: engine?.pending() ?? store?.outgoing().length ?? 0,
      quarantined: engine?.quarantined() ?? 0,
      heldBack: engine?.heldBack() ?? 0,
      sync,
      now,
    },
    statusT,
  );

  return (
    <div
      ref={wrapperRef}
      className="syncbadge"
      data-tone={status.tone === 'warn' ? 'warn' : 'ok'}
      onBlur={(event) => {
        // A disclosure, not a dialog: the dot keeps focus on opening, and the popover's link and button follow it in
        // Tab order. Focus leaving the badge altogether closes the popover (§9, #1081).
        if (open && !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setOpen(false);
        }
      }}
    >
      <Button
        ref={triggerRef}
        variant="plain"
        className="syncbadge-trigger"
        aria-label={status.label}
        aria-expanded={open}
        aria-controls={POPOVER_ID}
        title={status.label}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        {initial !== undefined && (
          <span className="syncbadge-avatar" aria-hidden="true">
            {initial}
          </span>
        )}
        <span className="syncbadge-dot" data-state={sync.kind === 'synced' ? 'synced' : 'local'} aria-hidden="true" />
      </Button>
      {open && (
        <div id={POPOVER_ID} className="syncbadge-popover" role="status" aria-label={status.label}>
          <p className="syncbadge-title">{status.label}</p>
          <p>
            {status.detail}
            {status.action !== undefined && (
              <>
                {' '}
                <a href={status.action.href}>{status.action.text}</a>.
              </>
            )}
          </p>
          {status.heldBackLine !== undefined && <p className="syncbadge-held-back">{status.heldBackLine}</p>}
          {engine !== undefined && (
            <Button
              size="compact"
              disabled={sync.kind === 'syncing'}
              onClick={() => {
                engine.syncNow();
              }}
            >
              {t.syncNow}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
