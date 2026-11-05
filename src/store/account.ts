/**
 * Account preferences in the operation log (#1066, ADR 0004).
 *
 * A signed-in reader's language, default rulership and default calculation profile follow them across devices. They
 * are ordinary operations on one new entity, `account`, with the constant id `preferences`: no change to the
 * envelope, the spine, `OP_VERSION` or the relay. The account boundary is the per-account database and the relay's
 * per-user scoping, so the id carries no user identifier.
 *
 * **Each field is its own last-write-wins register**, folded like any other. Only the allowlisted fields are
 * materialised; any other field (a newer build's, say) stays in the log and is ignored here.
 *
 * **Never deleted, never purged.** The relay treats any `purged: true` as a purge marker and would then refuse every
 * later preference write for that user. So `assertAccountMutation` refuses `deleted` and `purged` on this entity
 * before anything is appended, the store refuses `remove`, `restore` and `purge` for it, and the fold ignores both
 * fields if a peer ever sends them. A reset is a write of `null`, never a delete.
 *
 * Pure: no IndexedDB, no clock. `fold.ts` calls `foldAccount`; `store.ts` calls the guard.
 *
 * @module store/account
 * @purpose Folds the `account`/`preferences` entity into per-field registers, refuses account writes that could deny-list or erase it, and holds the sign-in reconciliation state shape.
 * @conventions Entity id is the frozen constant `preferences`; only `ACCOUNT_FIELDS` are materialised; `deleted`/`purged` are refused on write and ignored on fold; refusals carry a code so the UI owns the wording; fold and readers never throw.
 * @exports ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID, ACCOUNT_LOCALE_FIELD, ACCOUNT_RULERSHIP_FIELD, ACCOUNT_PROFILE_FIELD, ACCOUNT_FIELDS, AccountField, isAccountField, AccountRegister, AccountRegisters, foldAccount, AccountRefusedError, assertAccountMutation, isAccountRecord, withoutAccountRecords, AccountReconcileState, readAccountReconcileState, newerHlc, AccountRefusal
 */
import { compareHlc, isHlc, type Hlc } from './hlc.js';
import { isJsonValue, type JsonValue } from './ops.js';
import type { Mutation } from './oplog.js';

/** Entity kind of the account preferences. */
export const ACCOUNT_ENTITY = 'account';

/** The one entity id every device writes. Frozen forever once shipped: every device must agree on it. */
export const ACCOUNT_ENTITY_ID = 'preferences';

export const ACCOUNT_LOCALE_FIELD = 'locale';
export const ACCOUNT_RULERSHIP_FIELD = 'defaultRulership';
export const ACCOUNT_PROFILE_FIELD = 'defaultCalculationProfile';

/** The closed allowlist of fields this build materialises (ADR 0004 section 2.2). */
export const ACCOUNT_FIELDS = [ACCOUNT_LOCALE_FIELD, ACCOUNT_RULERSHIP_FIELD, ACCOUNT_PROFILE_FIELD] as const;
export type AccountField = (typeof ACCOUNT_FIELDS)[number];

export function isAccountField(value: unknown): value is AccountField {
  return ACCOUNT_FIELDS.some((field) => field === value);
}

/** Spelled here, not imported from the fold that calls this module. */
const DELETED = 'deleted';
const PURGED = 'purged';

/** One field's winning value and the timestamp that won it. Same shape as the fold's `Register`. */
export interface AccountRegister {
  readonly value: JsonValue;
  readonly hlc: Hlc;
}

/** The allowlisted registers that are set, by field. A field with no register is absent. */
export type AccountRegisters = Readonly<Partial<Record<AccountField, AccountRegister>>>;

/** Keep only the allowlisted fields. `deleted`, `purged` and unknown fields are ignored, never surfaced. */
export function foldAccount(fields: Readonly<Record<string, AccountRegister>> | undefined): AccountRegisters {
  const out: Partial<Record<AccountField, AccountRegister>> = {};
  if (fields === undefined) return out;
  for (const field of ACCOUNT_FIELDS) {
    const register = fields[field];
    if (register !== undefined) out[field] = register;
  }
  return out;
}

/** Why an account write was refused. A code, not prose. */
export type AccountRefusal = 'reserved-field' | 'wrong-id';

export class AccountRefusedError extends Error {
  readonly refusal: AccountRefusal;

  constructor(refusal: AccountRefusal) {
    super(`Account preference mutation refused: ${refusal}`);
    this.name = 'AccountRefusedError';
    this.refusal = refusal;
  }
}

/**
 * Refuse an account write that would deny-list or erase the preferences: a `deleted` or `purged` field, or any entity
 * id other than `preferences`. Called for the whole batch before anything is appended, by `mutate` and by `seed`.
 */
export function assertAccountMutation(mutation: Mutation): void {
  if (mutation.entity !== ACCOUNT_ENTITY) return;
  if (mutation.entityId !== ACCOUNT_ENTITY_ID) throw new AccountRefusedError('wrong-id');
  if (mutation.field === DELETED || mutation.field === PURGED) throw new AccountRefusedError('reserved-field');
}

/** Whether a stored or outgoing record belongs to the account entity. */
export function isAccountRecord(record: { readonly entity?: unknown }): boolean {
  return record.entity === ACCOUNT_ENTITY;
}

/**
 * The records without the account entity. Adoption (#109) uses this: anonymous preferences reach an account only
 * through the explicit sign-in reconciliation, never pushed raw where last-write-wins would overwrite silently.
 */
export function withoutAccountRecords<T extends { readonly entity?: unknown }>(records: readonly T[]): T[] {
  return records.filter((record) => !isAccountRecord(record));
}

/**
 * The durable sign-in reconciliation state, kept in each account store's meta (ADR 0004 section 3.6).
 *
 * `pending` holds the signed-out store's preferences captured at sign-in, before that store is closed, so a reload
 * before the account's first sync still offers them. `marker` is the newest candidate timestamp already reconciled;
 * a later sign-in offers only candidates newer than it, so declining does not prompt forever.
 */
export interface AccountReconcileState {
  readonly marker?: Hlc;
  readonly pending?: AccountRegisters;
}

/** Read the stored state, dropping anything malformed. Never throws. */
export function readAccountReconcileState(value: unknown): AccountReconcileState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const raw = value as Readonly<Record<string, unknown>>;
  const marker = isHlc(raw.marker) ? raw.marker : undefined;
  const pending: Partial<Record<AccountField, AccountRegister>> = {};
  const rawPending = raw.pending;
  if (typeof rawPending === 'object' && rawPending !== null && !Array.isArray(rawPending)) {
    for (const field of ACCOUNT_FIELDS) {
      const entry = (rawPending as Readonly<Record<string, unknown>>)[field];
      if (typeof entry !== 'object' || entry === null) continue;
      const { value: entryValue, hlc } = entry as { readonly value?: unknown; readonly hlc?: unknown };
      if (isHlc(hlc) && isJsonValue(entryValue)) pending[field] = { value: entryValue, hlc };
    }
  }
  const hasPending = Object.keys(pending).length > 0;
  return {
    ...(marker === undefined ? {} : { marker }),
    ...(hasPending ? { pending } : {}),
  };
}

/** The newer of two optional timestamps. */
export function newerHlc(a: Hlc | undefined, b: Hlc | undefined): Hlc | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return compareHlc(a, b) >= 0 ? a : b;
}
