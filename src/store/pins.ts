/**
 * Pinned event-search results, folded from the operation log (#1061, ADR 0005 addendum for slice 2).
 *
 * A pin marks one person-independent sky event (a station, ingress, lunation or exact aspect) as worth keeping. It is
 * account data: a new entity kind, `pin`, in the existing log, with no change to the envelope, the spine,
 * `OP_VERSION` or the relay.
 *
 * **The pin id is derived from the result's identity.** The `entityId` is `k-` plus 80 bits of a SHA-256 digest of the
 * canonical identity (kind, bodies, aspect, instant to the second), not of the 32-bit hash the iCalendar UID uses. Two
 * devices that pin the same event offline therefore write to one entity and converge to one pin, and pinning twice is
 * idempotent. A sky event involves no person, so nothing here needs the person-purge fan-out; a pin on person-derived
 * output is a later slice and will use the notes convention (`entityId` = person id, ADR 0005 section 2.4).
 *
 * **The target is one register.** It holds the identity and the English label as displayed when pinned. The label is
 * not part of the identity. `deleted` is the tombstone: unpinning is a delete with Undo, and pinning again restores.
 *
 * **Reads are total, writes are guarded.** `foldPin` never throws, since records also arrive from peers. A target this
 * build cannot read exactly folds to an `unreadable` entry that is listed and kept, never defaulted or hidden.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls `foldPin`; `store.ts` calls the guard.
 *
 * @module store/pins
 * @purpose Folds pinned event-search results (one atomic target register) into readable or unreadable entries, derives pin ids, and builds and refuses the mutations written to the op-log.
 * @conventions The target is one last-write-wins register carrying its own schema `version`; the id is derived from the identity so pinning is idempotent across devices; an unreadable pin is listed and kept, never defaulted or hidden; fold functions never throw; refusals carry a code rather than prose; the list sorts by instant then by a plain code-unit id comparison so the order is the same on every device.
 * @exports PIN_ENTITY, PIN_TARGET_FIELD, readPinTarget, pinRestore, PinTarget, PinUnreadable, Pin, PinRefusal, PinRefusedError, pinIdentity, pinTargetOf, foldPin, pinCreate, assertPinMutation, sortedPins
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES } from '../astrology/bodies.js';
import type { EventSearchResult } from '../domain/event-search.js';
import { isId } from '../domain/id.js';
import type { NoteFieldRegister } from './notes.js';
import type { Mutation } from './oplog.js';
import { EVENT_SEARCH_KINDS } from './saved-queries.js';

/** Entity kind of a pin. Its entity id is the derived `k-` id. */
export const PIN_ENTITY = 'pin';
export const PIN_TARGET_FIELD = 'target';

/** The `deleted` tombstone field, spelled here so the guard does not import the fold it is called from. */
const TOMBSTONE_FIELD = 'deleted';

const TARGET_VERSION = 1;
const EVENT_SEARCH_TOOL = 'event-search';

/** The longest label a pin may carry, in code points. Event labels are short generated sentences. */
const LABEL_MAX_CHARACTERS = 200;

const BODY_KEYS: readonly string[] = BODIES.map((body) => body.key);
const ASPECT_KEYS: readonly string[] = ASPECTS.map((aspect) => aspect.key);

/** One pinned sky event. `at` is the instant in whole seconds since the Unix epoch (UTC). */
export interface PinTarget {
  readonly tool: 'event-search';
  readonly version: 1;
  readonly kind: (typeof EVENT_SEARCH_KINDS)[number];
  readonly at: number;
  readonly bodyKey?: string;
  readonly relatedBodyKey?: string;
  readonly aspectKey?: string;
  readonly label: string;
}

export type PinUnreadable = 'future-version' | 'unknown-tool' | 'invalid';

export type Pin =
  | { readonly status: 'ready'; readonly id: string; readonly target: PinTarget }
  | { readonly status: 'unreadable'; readonly id: string; readonly reason: PinUnreadable };

/** Why a pin mutation was refused. A code, not prose, so the UI owns the wording. */
export type PinRefusal = 'invalid';

export class PinRefusedError extends Error {
  readonly refusal: PinRefusal;

  constructor(refusal: PinRefusal) {
    super(`Pin mutation refused: ${refusal}`);
    this.name = 'PinRefusedError';
    this.refusal = refusal;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is PinTarget['kind'] {
  return EVENT_SEARCH_KINDS.some((kind) => kind === value);
}

/** An optional key: absent is fine, present must be a known key. Returns false when the value is unacceptable. */
function optionalKey(value: unknown, known: readonly string[]): boolean {
  return value === undefined || (typeof value === 'string' && known.includes(value));
}

/** Read a target, or a reason it cannot be read. Total: any input yields a verdict. */
function readTarget(
  value: unknown,
): { readonly ok: true; readonly target: PinTarget } | { readonly ok: false; readonly reason: PinUnreadable } {
  if (!isRecord(value)) return { ok: false, reason: 'invalid' };
  const { tool, version, kind, at, bodyKey, relatedBodyKey, aspectKey, label } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  // The version is checked before the tool: a newer target may have changed anything else.
  if (version > TARGET_VERSION) return { ok: false, reason: 'future-version' };
  if (tool !== EVENT_SEARCH_TOOL) {
    return { ok: false, reason: typeof tool === 'string' && tool !== '' ? 'unknown-tool' : 'invalid' };
  }
  if (!isKind(kind) || typeof at !== 'number' || !Number.isSafeInteger(at)) return { ok: false, reason: 'invalid' };
  if (typeof label !== 'string' || Array.from(label).length > LABEL_MAX_CHARACTERS)
    return { ok: false, reason: 'invalid' };
  if (
    !optionalKey(bodyKey, BODY_KEYS) ||
    !optionalKey(relatedBodyKey, BODY_KEYS) ||
    !optionalKey(aspectKey, ASPECT_KEYS)
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    target: {
      tool: EVENT_SEARCH_TOOL,
      version: TARGET_VERSION,
      kind,
      at,
      ...(typeof bodyKey === 'string' ? { bodyKey } : {}),
      ...(typeof relatedBodyKey === 'string' ? { relatedBodyKey } : {}),
      ...(typeof aspectKey === 'string' ? { aspectKey } : {}),
      label,
    },
  };
}

/** A stored target value as this build reads it, or undefined when it is not one it can read exactly. */
export function readPinTarget(value: unknown): PinTarget | undefined {
  const verdict = readTarget(value);
  return verdict.ok ? verdict.target : undefined;
}

/** The target for a search result. The instant is rounded to the second, the precision the iCalendar UID also uses. */
export function pinTargetOf(result: EventSearchResult): PinTarget {
  return {
    tool: EVENT_SEARCH_TOOL,
    version: TARGET_VERSION,
    kind: result.kind,
    at: Math.round((result.jd - 2440587.5) * 86_400),
    ...(result.bodyKey === undefined ? {} : { bodyKey: result.bodyKey }),
    ...(result.relatedBodyKey === undefined ? {} : { relatedBodyKey: result.relatedBodyKey }),
    ...(result.aspectKey === undefined ? {} : { aspectKey: result.aspectKey }),
    label: result.label,
  };
}

/**
 * The canonical identity string a pin id is derived from. Tool, kind, bodies, aspect and instant; never the label,
 * so a reworded label does not make a second pin. Fields are joined with a separator no key contains.
 */
export function pinIdentity(target: PinTarget): string {
  return [
    target.tool,
    target.kind,
    target.bodyKey ?? '',
    target.relatedBodyKey ?? '',
    target.aspectKey ?? '',
    String(target.at),
  ].join('|');
}

/**
 * Fold one pin's registers. Pure, total (never throws), deterministic.
 *
 * Returns `undefined` when the entity holds no `target`. The caller tests for a purge marker first, since a purged
 * entity holds only that marker.
 */
export function foldPin(id: string, fields: Readonly<Record<string, NoteFieldRegister>>): Pin | undefined {
  const register = fields[PIN_TARGET_FIELD];
  if (register === undefined) return undefined;
  const verdict = readTarget(register.value);
  if (!verdict.ok) return { status: 'unreadable', id, reason: verdict.reason };
  return { status: 'ready', id, target: verdict.target };
}

/**
 * The writes for pinning a result, to be committed in one `Store.mutate` batch. The caller derives `id` from
 * `pinIdentity(target)`. It writes `deleted: false` as well as the target, so a pin made on one device wins over an
 * unpin made on another device that has not synced yet (last write wins on `deleted`); with the target alone, the
 * older tombstone would survive and silently undo the pin.
 */
export function pinCreate(id: string, target: PinTarget): readonly Mutation[] {
  return [
    { entity: PIN_ENTITY, entityId: id, field: PIN_TARGET_FIELD, value: { ...target } },
    { entity: PIN_ENTITY, entityId: id, field: TOMBSTONE_FIELD, value: false },
  ];
}

/**
 * The write for restoring a pin from a file (#1194): the target alone, with no `deleted` write. A restore is not a
 * deliberate pin click, so it must not carry a fresh `deleted: false` that would outrank an unpin made on another
 * device. With no tombstone on this device the pin is live anyway, and a tombstone that arrives later still wins.
 */
export function pinRestore(id: string, target: PinTarget): Mutation {
  return { entity: PIN_ENTITY, entityId: id, field: PIN_TARGET_FIELD, value: { ...target } };
}

/**
 * Refuse a pin mutation the store must not write. Other entities pass through untouched.
 *
 * Allows only `target` (a readable shape) and `deleted` (a boolean). Every other field, `purged` included, is
 * refused: a purge goes through `Store.purge`, which appends directly. Covers `mutate`, `remove` and `restore` only.
 */
export function assertPinMutation(mutation: Mutation): void {
  if (mutation.entity !== PIN_ENTITY) return;
  if (!isId(mutation.entityId) || !mutation.entityId.startsWith('k-')) throw new PinRefusedError('invalid');
  switch (mutation.field) {
    case PIN_TARGET_FIELD:
      if (!readTarget(mutation.value).ok) throw new PinRefusedError('invalid');
      return;
    case TOMBSTONE_FIELD:
      if (typeof mutation.value !== 'boolean') throw new PinRefusedError('invalid');
      return;
    default:
      throw new PinRefusedError('invalid');
  }
}

/** Plain code-unit comparison, so the tiebreak cannot differ between devices with different ICU data. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The list order: instant (unreadable pins last), then id by code unit. Map iteration order is not the contract. */
export function sortedPins(pins: ReadonlyMap<string, Pin>): readonly Pin[] {
  const instant = (pin: Pin): number => (pin.status === 'ready' ? pin.target.at : Number.POSITIVE_INFINITY);
  return [...pins.values()].sort((a, b) => {
    const left = instant(a);
    const right = instant(b);
    if (left !== right) return left < right ? -1 : 1;
    return compareCodeUnits(a.id, b.id);
  });
}
