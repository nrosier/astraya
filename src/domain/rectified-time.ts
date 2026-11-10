/**
 * A person's rectified birth time (#1445): an optional estimate stored beside, never instead of, the reported time.
 *
 * The reported time is the person's `civil` time of day as recorded; it is never written here. The rectified time is
 * one `rectifiedTime` register holding a clock time and the source note that says where it came from. It is an
 * estimate wherever it appears, and its scoring method has its citation pending (#1445).
 */
/**
 * @module rectified-time
 * @purpose Defines the `RectifiedTime` value, its atomic reader and write guard, and the source-note text for a promoted time.
 * @conventions Pure and DOM-free; read atomically (an invalid time or note makes the register unreadable, undefined); the write guard throws on exactly what the reader rejects; the reported time (`civil`) is never part of this register; written through the person operation log only, never the op-log spine; the note is capped at `RECTIFIED_TIME_NOTE_MAX_CHARACTERS` code points, equal to the birth source note cap.
 * @exports RectifiedTime, RECTIFICATION_CITATION_RECORDED, PromotionBlock, promotionBlock, RECTIFIED_TIME_NOTE_MAX_CHARACTERS, RECTIFIED_TIME_FIELD, readRectifiedTime, rectifiedTimeMutation, rectifiedTimeNote
 */
import type { Mutation } from '../store/oplog.js';
import type { JsonValue } from '../store/ops.js';

/**
 * The longest a source note may be, in code points: the same limit as the birth source note, which `person.ts` owns.
 * Repeated here because `person.ts` imports this module; the tests assert the two are equal.
 */
export const RECTIFIED_TIME_NOTE_MAX_CHARACTERS = 200;

/** The person register this value is stored in. */
export const RECTIFIED_TIME_FIELD = 'rectifiedTime';

export interface RectifiedTime {
  /** Local clock time at the birth place, `HH:MM`. */
  readonly time: string;
  /** Where the estimate came from, e.g. the method and the lift. */
  readonly note: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the register atomically; anything but a valid `{ time, note }` is unreadable (undefined). */
export function readRectifiedTime(value: unknown): RectifiedTime | undefined {
  if (!isRecordValue(value)) return undefined;
  const { time, note } = value;
  if (typeof time !== 'string' || !TIME_PATTERN.test(time)) return undefined;
  if (typeof note !== 'string') return undefined;
  const trimmed = note.trim();
  if (trimmed === '' || Array.from(trimmed).length > RECTIFIED_TIME_NOTE_MAX_CHARACTERS) return undefined;
  return { time, note: trimmed };
}

/** The write for a person's `rectifiedTime` register; throws when the value would not read back. */
export function rectifiedTimeMutation(personId: string, rectified: RectifiedTime): Mutation {
  const checked = readRectifiedTime(rectified);
  if (checked === undefined) {
    throw new Error(
      `Rectified time is not valid: a time as HH:MM and a source note of 1 to ${String(RECTIFIED_TIME_NOTE_MAX_CHARACTERS)} characters.`,
    );
  }
  return {
    entity: 'person',
    entityId: personId,
    field: RECTIFIED_TIME_FIELD,
    value: { time: checked.time, note: checked.note } satisfies JsonValue,
  };
}

/** The source note stored with a promoted time, e.g. "Rectified via Solar Arc and transits (lift 1.8)". */
/** `liftText` is the lift already formatted by the shared formatter (`ui/format`), which the domain layer does not import. */
export function rectifiedTimeNote(liftText: string): string {
  return `Rectified via Solar Arc and transits (lift ${liftText}), estimate; method citation pending`;
}

/**
 * Whether a methodology citation for the Solar Arc and transit scoring is recorded (#1445). It is not: the only
 * verified source (Huber's rectification article) supports rectifying against dated events, not this scoring. While
 * false, promotion stays disabled. Flip only when a verified citation is recorded on the issue.
 */
export const RECTIFICATION_CITATION_RECORDED = false;

export type PromotionBlock = 'citation' | 'noPerson' | 'noSpike';

/** Why "Promote to rectified time" is unavailable, or undefined when it may be used. The citation reason comes first. */
export function promotionBlock(input: {
  readonly citationRecorded: boolean;
  readonly hasPerson: boolean;
  readonly topLift: number | undefined;
}): PromotionBlock | undefined {
  if (!input.citationRecorded) return 'citation';
  if (!input.hasPerson) return 'noPerson';
  if (input.topLift === undefined || !(input.topLift > 1)) return 'noSpike';
  return undefined;
}
