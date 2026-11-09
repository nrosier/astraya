/**
 * The client half of sync: a push/pull loop against the opaque relay in
 * `server/ops/routes.ts`. Runs only while signed in — `session-context.tsx`
 * creates one on sign-in and closes it on sign-out.
 *
 * Every step here is safe to interrupt at any point (#103): nothing is marked
 * done — the cursor moved, a record merged — until the network call that did
 * it has already succeeded, and a page reload just runs the same loop again
 * from wherever the durable cursor last got to.
 */

/**
 * @module sync/engine
 * @purpose Implements the client-side sync engine: a debounced/polled push-pull loop that exchanges this device's op-log against the opaque relay in `server/ops/routes.ts`, running only while signed in.
 * @conventions Every step is safe to interrupt at any point (#103) — the sync cursor only advances after the network call that made progress has already succeeded; every request names the account the engine was opened for in the `X-Astraya-Account` header (`ACCOUNT_HEADER`), so the server refuses it when the session cookie has since moved to another account (#1378); `close()` aborts the in-flight request and every awaited step re-checks that the engine is still open before it writes or starts another request, so a late response after close writes nothing (#1378); errors are classified into a `SyncErrorKind` (`offline`/`unauthorized`/`server`/`malformed`/`rejected`/`quota`) so the UI status can distinguish a blip from a bug; a full server quota (409, #919) stops automatic retries until the user acts, and push batches are capped by encoded bytes (halving on a 413) so a large note cannot wedge sync against the server's body limit (#919); failed runs retry with exponential backoff plus jitter (#106); only this device's own outgoing records are ever pushed, filtering out peer records just pulled and folded in (#324); a row that fails to decode during pull is skipped rather than failing the whole page, so one corrupt record can't wedge every record behind it (#320).
 * @exports SyncEngine, SyncEngineOptions, SyncErrorKind, SyncError, ACCOUNT_HEADER, PUSH_BATCH_MAX_BYTES, pushRecords, createSyncEngine
 */
import { isHlc, isNodeId, type Hlc, type NodeId } from '../store/hlc.js';
import { countHeldBackNotes, isOversizedLegacyNoteRecord } from '../store/notes.js';
import type { OpRecord } from '../store/ops.js';
import type { Store, SyncCursor } from '../store/store.js';
import type { SyncState } from '../ui/status.js';
import { trace } from '../trace.js';

/** Matches the server's own `MAX_BATCH_SIZE`/`MAX_PAGE_SIZE` (`server/ops/routes.ts`). */
const MAX_PAGE_SIZE = 500;

/**
 * Cap on the encoded JSON bytes of the ops in one `POST /api/ops` (#919). The server's body
 * limit is 1 MiB (`server/index.ts`); this sits a factor of four below it. A single op larger
 * than the cap is still sent, alone: refusing it would wedge every op queued behind it. A
 * near-maximum (50,000-character) note revision is about 67 KB base64'd for Latin text and
 * about 200 KB for CJK text, so a batch of them is split across requests.
 */
export const PUSH_BATCH_MAX_BYTES = 256 * 1024;

/**
 * Names the account a sync request is meant for (#1378). The relay (`server/ops/routes.ts`) refuses a request whose
 * value is not the account the session cookie resolves to, so a request that outlives an account switch on this
 * browser cannot write one account's records into another account's log.
 */
export const ACCOUNT_HEADER = 'X-Astraya-Account';

/** Coalesces a burst of local edits into one push instead of one per keystroke. */
const PUSH_DEBOUNCE_MS = 1_000;

/** Picks up a peer's changes, and retries a past failure, even with nothing local to push. */
const POLL_INTERVAL_MS = 30_000;

/** First retry after a failure (#106): fast enough that a blip barely shows, never a tight loop. */
const BASE_RETRY_MS = 1_000;
/** Ceiling on backoff growth — a prolonged outage retries every 5 minutes, not slower and slower forever. */
const MAX_RETRY_MS = 5 * 60_000;

export interface SyncEngine {
  /** Live — read it again after `subscribe` fires. */
  readonly status: SyncState;
  /** Local records the server has not yet acknowledged. */
  pending(): number;
  /** Local records the server has permanently refused as clock-skewed (#312) and will not retry. */
  quarantined(): number;
  /** Notes on this device that are held back from the push because they are over the length limit (#919). */
  heldBack(): number;
  /** Manual "sync now" — safe to call while a run is already in flight (queues a rerun instead of overlapping it). */
  syncNow(): void;
  subscribe(listener: () => void): () => void;
  close(): void;
}

export interface SyncEngineOptions {
  readonly store: Store;
  /**
   * The id of the account `store` belongs to (#1378). Sent with every request, so the server refuses the request
   * once the session cookie belongs to anyone else.
   */
  readonly accountId: string;
  /**
   * The server no longer honours this device's session (#106) — retrying the same request
   * would just fail the same way again. Called at most once per distinct failure episode
   * (not on every retry), so a caller can prompt re-authentication without being flooded.
   */
  readonly onUnauthorized?: () => void;
}

export type SyncErrorKind =
  /** `fetch` itself threw — no request reached the server at all. */
  | 'offline'
  /** The session is no longer valid; retrying it will not help. */
  | 'unauthorized'
  /** 5xx: the server's problem, plausibly transient. */
  | 'server'
  /** 2xx but the body wasn't the shape expected — a protocol mismatch, not a network condition. */
  | 'malformed'
  /** Any other non-2xx (e.g. a batch too large, malformed ops) — a bug in this client, not a blip. */
  | 'rejected'
  /**
   * The server's per-account op quota is full (409, #919). Retrying the same request fails the
   * same way until the account changes, so no automatic retry is scheduled. Local ops are
   * untouched and wait on the device.
   */
  | 'quota'
  /**
   * The session cookie now belongs to a different account from the one this engine syncs (403, #1378). The server
   * wrote nothing; retrying cannot help until this account signs in again.
   */
  | 'account-mismatch';

/** Thrown by `request()` below; carries which of #106's distinct failure kinds this was. */
export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  /** The HTTP status when the error came from a response; `undefined` otherwise. */
  readonly status: number | undefined;

  constructor(kind: SyncErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
    this.status = status;
  }
}

interface OpWire {
  readonly hlc: Hlc;
  readonly deviceId: NodeId;
  readonly opVersion: number;
  readonly payload: string;
}

interface PullRow {
  readonly seq: number;
  readonly hlc: string;
  readonly deviceId: string;
  readonly opVersion: number;
  readonly payload: string;
}

/** UTF-8-safe base64: `btoa` alone mangles anything outside Latin-1, which most names are not. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The record's spine passes through verbatim; everything else becomes the relay's opaque
 * payload. Every record `store.outgoing()` returns was produced by this device's own
 * `append` or a peer's `receiveRecords` — both already guarantee a valid spine — so a
 * missing one here is this function's own bug, not a peer's malformed data.
 */
function toWire(record: OpRecord): OpWire {
  const { opVersion, hlc, deviceId, ...body } = record;
  if (typeof opVersion !== 'number' || !isHlc(hlc) || !isNodeId(deviceId)) {
    throw new Error('a record from the local log is missing a valid spine');
  }
  return { opVersion, hlc, deviceId, payload: toBase64(JSON.stringify(body)) };
}

/** The reverse: a relay row, reassembled into the flat shape `Store.receive` expects. */
function fromWire(row: PullRow): unknown {
  const body = JSON.parse(fromBase64(row.payload)) as Record<string, unknown>;
  return { ...body, opVersion: row.opVersion, hlc: row.hlc, deviceId: row.deviceId };
}

/** Reads a non-2xx response's body for the specific reason, so the status bar says more than a number. */
async function classifyErrorResponse(response: Response): Promise<SyncError> {
  if (response.status === 401) {
    return new SyncError('unauthorized', 'Your session has expired. Sign in again to keep syncing.', 401);
  }
  if (response.status === 409) {
    // The relay answers 409 only for the per-account op quota (`server/ops/routes.ts`, #919).
    return new SyncError('quota', 'This account has reached its storage limit on the server.', 409);
  }
  if (response.status === 413) {
    // Kept as its own message: push splits a batch on this status (`push`, #919). Only a single
    // op the server still refuses ends up here, and then it surfaces as a plain failure.
    return new SyncError('rejected', 'The server refused a request as too large.', 413);
  }
  if (response.status >= 500) {
    return new SyncError(
      'server',
      `The server is having trouble (status ${String(response.status)}).`,
      response.status,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new SyncError(
      'malformed',
      `Request failed with status ${String(response.status)} and no readable error.`,
      response.status,
    );
  }
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (response.status === 403 && fields.code === 'account-mismatch') {
    return new SyncError('account-mismatch', 'This device is now signed in to a different account.', 403);
  }
  const error = fields.error;
  return new SyncError(
    'rejected',
    typeof error === 'string' ? error : `Request rejected with status ${String(response.status)}.`,
    response.status,
  );
}

/** Which account a request is for, and the signal that cancels it when its engine closes (#1378). */
interface RequestScope {
  readonly accountId: string;
  readonly signal?: AbortSignal;
}

/** Every network call funnels through here so `fetch` throwing and a non-2xx response are classified alike (#106). */
async function request(path: string, scope: RequestScope, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(ACCOUNT_HEADER, scope.accountId);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      ...(scope.signal === undefined ? {} : { signal: scope.signal }),
    });
  } catch {
    throw new SyncError('offline', 'No network connection.');
  }
  if (!response.ok) throw await classifyErrorResponse(response);
  return response;
}

interface PushResult {
  readonly seqs: readonly number[];
  /** HLCs the server refused as clock-skewed (#312) — still 2xx, since the rest of the batch went through. */
  readonly skipped: readonly Hlc[];
}

/** Encoded size of one op on the wire. Measured, not estimated: CJK text is three bytes per character. */
function encodedBytes(op: OpWire): number {
  return new TextEncoder().encode(JSON.stringify(op)).byteLength;
}

interface Batch {
  readonly ops: readonly OpWire[];
  readonly bytes: number;
}

/**
 * The longest run of `wires` from `start` that fits `budgetBytes` and `MAX_PAGE_SIZE`. Always
 * takes at least one op, so a single op over the budget is sent alone rather than blocking the
 * queue (#919).
 */
function takeBatch(wires: readonly OpWire[], start: number, budgetBytes: number): Batch {
  const ops: OpWire[] = [];
  let bytes = 0;
  for (let i = start; i < wires.length && ops.length < MAX_PAGE_SIZE; i += 1) {
    const wire = wires[i];
    if (wire === undefined) break;
    const size = encodedBytes(wire);
    if (ops.length > 0 && bytes + size > budgetBytes) break;
    ops.push(wire);
    bytes += size;
  }
  return { ops, bytes };
}

async function postOps(ops: readonly OpWire[], scope: RequestScope): Promise<PushResult> {
  const response = await request('/api/ops', scope, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops }),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SyncError('malformed', 'The server response could not be read.');
  }
  const seqs = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).seqs : undefined;
  const skipped = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).skipped : undefined;
  if (!Array.isArray(seqs) || !Array.isArray(skipped) || !skipped.every(isHlc)) {
    throw new SyncError('malformed', 'The server response was missing its results.');
  }
  return { seqs, skipped };
}

async function getOps(since: number, scope: RequestScope): Promise<readonly PullRow[]> {
  const response = await request(`/api/ops?since=${String(since)}`, scope);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SyncError('malformed', 'The server response could not be read.');
  }
  const ops = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).ops : undefined;
  if (!Array.isArray(ops)) throw new SyncError('malformed', 'The server response was missing its operations.');
  return ops as readonly PullRow[];
}

/**
 * A one-off push outside any engine's cursor — used only by adoption (#109) to send a
 * device's entire anonymous log to the server under the new session's cookie, before the
 * per-account store and its own engine exist yet. `accountId` is the account the records are
 * meant for: the server refuses the push if the cookie belongs to anyone else (#1378).
 */
export async function pushRecords(records: readonly OpRecord[], accountId: string): Promise<void> {
  // Over-limit legacy notes stay local, as in the engine's own push (#919). Adoption pushes a whole anonymous log,
  // so without this filter one such note would be refused and wedge every op queued behind it.
  const wires = records.filter((op) => !isOversizedLegacyNoteRecord(op)).map(toWire);
  for (let start = 0; start < wires.length;) {
    const { ops } = takeBatch(wires, start, PUSH_BATCH_MAX_BYTES);
    await postOps(ops, { accountId });
    start += ops.length;
  }
}

export async function createSyncEngine(options: SyncEngineOptions): Promise<SyncEngine> {
  const { store, accountId, onUnauthorized } = options;
  // Cancels whatever request is in flight when the engine closes (#1378).
  const abort = new AbortController();
  const scope: RequestScope = { accountId, signal: abort.signal };
  trace('sync', 'createSyncEngine: called', { deviceId: store.deviceId, people: store.state.people.size });
  // Read once at creation, same shape as `openStore` reading state off disk. Reassigned as
  // pushing/pulling makes progress; never read back from the store mid-run, so a run's own
  // progress is always self-consistent even if something else changed `store` underneath it
  // (nothing does today, but `receive` and `mutate` share no state with this cursor).
  let cursor: SyncCursor = await store.getSyncCursor();
  let status: SyncState = { kind: 'syncing' };
  // Kept across failing runs so the status shows how long it has been failing, not how long
  // since the last attempt — `describeStatus` (ui/status.ts) escalates on that duration.
  let failingSince: number | undefined;
  // Drives the backoff below (#106); reset to 0 on any successful run.
  let consecutiveFailures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  // Push batch cap for this engine. Starts at PUSH_BATCH_MAX_BYTES and only shrinks, when the
  // server answers 413 to a batch of more than one op (see `push`).
  let pushBudgetBytes = PUSH_BATCH_MAX_BYTES;
  // When the quota was first reported full; kept across runs that keep hitting it.
  let quotaSince: number | undefined;
  // `onUnauthorized` fires once per failure episode, not once per retry — otherwise a caller
  // reacting to it (e.g. re-checking identity) would be invoked on every backoff tick.
  let unauthorizedNotified = false;
  const listeners = new Set<() => void>();
  let closed = false;
  let running = false;
  /**
   * Called after every awaited step and before every request (#1378): a response that arrives after `close()` must
   * not write to the store, move the cursor or start another request, and an aborted request is not always the last
   * await in flight. Throws rather than returns so no caller can carry on by mistake; `runSync` ignores any error
   * once closed.
   */
  function assertOpen(): void {
    if (closed) throw new Error('the sync engine was closed');
  }
  // `trigger()` can set this while `runSync()` below is mid-`await` on `pull`/`push` — that
  // is the actual mechanism by which a concurrent trigger causes the current run to loop
  // again rather than starting a second, overlapping one. TypeScript's control-flow analysis
  // can't see that concurrent write, so it narrows a closed-over boolean (even one behind an
  // object holder) to whatever this function last assigned it; reading it back through a
  // function with its own declared return type sidesteps that narrowing.
  let rerunRequested = false;
  function requestRerun(): void {
    rerunRequested = true;
  }
  function consumeRerunRequest(): boolean {
    return rerunRequested;
  }
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function setStatus(next: SyncState): void {
    status = next;
    for (const listener of listeners) listener();
  }

  function clearScheduledRetry(): void {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  }

  /**
   * Exponential backoff with jitter (#106): doubles from `BASE_RETRY_MS` per consecutive
   * failure, capped at `MAX_RETRY_MS`, and randomised to 50-100% of that so many tabs failing
   * against the same flaky link don't all retry in lockstep. This runs *alongside* the
   * regular `online` listener and 30s poll below, as a fallback for the cases neither
   * covers — `navigator.onLine` firing late, or a failure that isn't about connectivity at
   * all (a rejected batch, a server error).
   */
  function scheduleRetry(): void {
    clearScheduledRetry();
    const backoff = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** (consecutiveFailures - 1));
    const jittered = backoff * (0.5 + Math.random() * 0.5);
    retryTimer = setTimeout(automaticTrigger, jittered);
  }

  /**
   * Triggers nobody asked for: the poll, the `online` event, and the backoff timer. Suspended
   * while the quota is full (#919), since each would only resend a request the server has
   * already refused. A local edit or "sync now" still goes through `trigger`.
   */
  function automaticTrigger(): void {
    if (status.kind === 'quota') return;
    trigger();
  }

  /**
   * Only this device's own outgoing records (#324): `store.outgoing()` filters by HLC order
   * alone, so it also returns peer records this device just pulled and folded into its own
   * log via `receive()`. Re-POSTing those back is a harmless no-op server-side (the same
   * `(user, hlc)` pair already exists), but it's still wasted bandwidth that grows with
   * account age and peer count, so it's filtered out before ever reaching the network.
   */
  function ownOutgoing(): readonly OpRecord[] {
    return store
      .outgoing(cursor.pushed)
      .filter((op) => op.deviceId === store.deviceId)
      .filter((op) => !isOversizedLegacyNoteRecord(op));
  }

  /**
   * Birth Record notes this device holds back from the push because their legacy text is over the limit (#919). The
   * people come from this device's own held records, and the count from the folded note, so a note the user has since
   * trimmed no longer counts. Only the note held here is counted; a peer's record is never this device's to hold.
   */
  function heldBackNotes(): number {
    const own = new Set<string>();
    for (const op of store.outgoing()) {
      if (op.deviceId === store.deviceId && isOversizedLegacyNoteRecord(op)) own.add(String(op.entityId));
    }
    return countHeldBackNotes(store.state.birthNotes, own);
  }

  async function pull(): Promise<void> {
    for (;;) {
      assertOpen();
      const rows = await getOps(cursor.pulled ?? 0, scope);
      assertOpen();
      if (rows.length === 0) return;
      // Decoded one row at a time (#320): a single corrupted stored row throwing out of a
      // bulk `.map(fromWire)` would throw out of `pull()` entirely, which never advances
      // `cursor.pulled` — the same bad row would be re-fetched and re-thrown on every retry,
      // permanently wedging pull for every *other* row behind it, in this page or any later
      // one. A row that fails to decode is unrecoverable either way; skipping it just keeps
      // it from blocking its neighbours.
      const decoded: unknown[] = [];
      for (const row of rows) {
        try {
          decoded.push(fromWire(row));
        } catch (error) {
          console.warn('sync: dropping a pulled row that failed to decode', row.seq, error);
        }
      }
      trace('sync', 'pull: page fetched, calling store.receive', { deviceId: store.deviceId, decoded: decoded.length });
      await store.receive(decoded);
      trace('sync', 'pull: store.receive resolved', { deviceId: store.deviceId });
      assertOpen();
      // Persisted only once `receive` has resolved — itself durable-before-return — so a
      // crash here just re-pulls the same page next time, which `receive`'s HLC dedupe makes
      // a harmless no-op rather than a duplicate.
      const lastRow = rows[rows.length - 1];
      if (lastRow === undefined) return;
      cursor = { ...cursor, pulled: lastRow.seq };
      await store.setSyncCursor(cursor);
      assertOpen();
      if (rows.length < MAX_PAGE_SIZE) return;
    }
  }

  async function push(): Promise<void> {
    for (;;) {
      assertOpen();
      // Quarantined HLCs are already behind `cursor.pushed` once their batch is handled
      // below, since a batch advances the cursor past its own last record regardless of
      // what got skipped inside it — this filter is a second, belt-and-suspenders guard
      // against ever resending one, not the only thing preventing it (#312).
      const quarantined = new Set(cursor.quarantined ?? []);
      const outgoing = ownOutgoing()
        .map(toWire)
        .filter((op) => !quarantined.has(op.hlc));
      if (outgoing.length === 0) return;
      const chunk = takeBatch(outgoing, 0, pushBudgetBytes);
      let skipped: readonly Hlc[];
      try {
        ({ skipped } = await postOps(chunk.ops, scope));
      } catch (error) {
        // The server's body limit refused this batch (#919). Nothing was accepted, so the cursor
        // has not moved: halve the batch and resend. Only a single op the server cannot take is
        // a real failure, and it still surfaces as one.
        if (error instanceof SyncError && error.status === 413 && chunk.ops.length > 1) {
          pushBudgetBytes = Math.floor(chunk.bytes / 2);
          continue;
        }
        throw error;
      }
      assertOpen();
      // The chunk's own last record, not `store.head()`: a local edit could land mid-push and
      // move the head past what this chunk actually sent.
      const lastWire = chunk.ops[chunk.ops.length - 1];
      if (lastWire === undefined) return;
      for (const hlc of skipped) quarantined.add(hlc);
      cursor = {
        ...cursor,
        pushed: lastWire.hlc,
        ...(quarantined.size > 0 ? { quarantined: [...quarantined] } : {}),
      };
      await store.setSyncCursor(cursor);
      assertOpen();
    }
  }

  async function runSync(): Promise<void> {
    running = true;
    trace('sync', 'runSync: starting', { deviceId: store.deviceId });
    try {
      do {
        rerunRequested = false;
        await pull();
        // The gap the review found (#1378): a pull that resolved after close would otherwise go straight on to push.
        assertOpen();
        await push();
      } while (consumeRerunRequest() && !closed);
      if (!closed) {
        failingSince = undefined;
        consecutiveFailures = 0;
        quotaSince = undefined;
        unauthorizedNotified = false;
        clearScheduledRetry();
        const stillPending = ownOutgoing().length > 0;
        trace('sync', 'runSync: finished', { deviceId: store.deviceId, stillPending });
        setStatus(stillPending ? { kind: 'syncing' } : { kind: 'synced', at: Date.now() });
      }
    } catch (error) {
      if (!closed && error instanceof SyncError && error.kind === 'quota') {
        // Not a failure to retry: the server refuses writes until the account changes, so no
        // backoff is scheduled and the status says what is needed (#919). Local ops stay in
        // the log and are sent on the next user-initiated sync.
        failingSince = undefined;
        consecutiveFailures = 0;
        clearScheduledRetry();
        quotaSince ??= Date.now();
        setStatus({ kind: 'quota', since: quotaSince });
      } else if (!closed) {
        quotaSince = undefined;
        failingSince ??= Date.now();
        consecutiveFailures += 1;
        setStatus({
          kind: 'failing',
          since: failingSince,
          message: error instanceof Error ? error.message : String(error),
        });
        // Retrying an unauthorized request is pointless until something re-establishes the
        // session — surfaced once per episode so a caller (session-context) can react, e.g. by
        // re-checking identity, without being called again on every backoff tick below.
        // A cookie that now belongs to another account (#1378) is the same episode from the caller's side: this
        // account's session is gone from this browser.
        if (
          error instanceof SyncError &&
          (error.kind === 'unauthorized' || error.kind === 'account-mismatch') &&
          !unauthorizedNotified
        ) {
          unauthorizedNotified = true;
          onUnauthorized?.();
        }
        scheduleRetry();
      }
    } finally {
      running = false;
    }
  }

  function trigger(): void {
    if (closed) return;
    if (running) {
      // A run is already in flight: rather than starting a second, overlapping one, ask
      // the current run to go again once it finishes.
      trace('sync', 'trigger: run already in flight, requesting rerun', { deviceId: store.deviceId });
      requestRerun();
      return;
    }
    trace('sync', 'trigger: firing runSync', { deviceId: store.deviceId });
    void runSync();
  }

  function debouncedTrigger(): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(trigger, PUSH_DEBOUNCE_MS);
  }

  const unsubscribeStore = store.subscribe(debouncedTrigger);
  const interval = setInterval(automaticTrigger, POLL_INTERVAL_MS);
  window.addEventListener('online', automaticTrigger);

  trigger();

  return {
    get status() {
      return status;
    },
    pending: () => ownOutgoing().length,
    quarantined: () => cursor.quarantined?.length ?? 0,
    heldBack: () => heldBackNotes(),
    syncNow: trigger,
    subscribe(listener) {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      abort.abort();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      clearScheduledRetry();
      clearInterval(interval);
      window.removeEventListener('online', automaticTrigger);
      unsubscribeStore();
      listeners.clear();
    },
  };
}
