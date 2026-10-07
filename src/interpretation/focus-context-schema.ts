/**
 * The wire shape of the enriched context for one selected placement (#424) and the closed-set
 * validator the server runs on it before it reaches a prompt. It imports only the static
 * astrology tables, never the chart-computing modules, so the server can use it without pulling
 * the whole calculation graph into its own build; `focus-context.ts` builds the payload and
 * re-exports everything here.
 */
/**
 * @module interpretation/focus-context-schema
 * @purpose Defines the wire shape of the Tier-2 "focus" payload (one selected placement's enriched context) and validates it against closed sets before it reaches a model prompt.
 * @conventions Imports only static astrology reference tables (BODIES, SIGNS, ASPECTS, rulership), never chart-computing modules, so the server can use this without the full calculation graph. Every field of untrusted input is rebuilt from a known/closed set rather than passed through, since this crosses the wire from an untrusted client into a prompt.
 * @exports MAX_FOCUS_ASPECTS, roundOrb, FocusAngle, FocusPerspective, FocusAspectState, FocusObject, FocusAspect, FocusContext, FocusContextValidation, validateFocusContext
 */
import { ASPECTS } from '../astrology/aspects.ts';
import { BODIES } from '../astrology/bodies.ts';
import { isRulershipChoice, type RulershipChoice } from '../astrology/rulership.ts';
import { SIGNS } from '../astrology/signs.ts';

const HOUSE_COUNT = 12;
/** The most aspects a payload carries (a body has at most ~19 aspects; this bounds a padded request too). */
export const MAX_FOCUS_ASPECTS = 40;

/** Orbs are sent to two decimals. */
export function roundOrb(value: number): number {
  return Math.round(value * 100) / 100;
}

export type FocusAngle = 'asc' | 'mc' | 'dsc' | 'ic';
export type FocusPerspective = 'natal' | 'transit';
export type FocusAspectState = 'applying' | 'separating';

export interface FocusObject {
  readonly key: string;
  readonly sign: string;
  /** The (natal) house it is in; `null` without houses. */
  readonly house: number | null;
  readonly rules_houses: readonly number[];
  readonly is_chart_ruler: boolean;
  readonly on_angle: boolean;
  readonly angle: FocusAngle | null;
  /** The ruler of the sign it is in (the traditional ruler first under Both). */
  readonly dispositor: string;
  /** The second ruler of that sign, under Both and only in Scorpio, Aquarius and Pisces. */
  readonly co_dispositor: string | null;
}

export interface FocusAspect {
  readonly target_key: string;
  readonly target_sign: string;
  readonly target_house: number | null;
  readonly target_rules_houses: readonly number[];
  readonly aspect: string;
  readonly orb: number;
  readonly state: FocusAspectState;
  readonly is_target_chart_ruler: boolean;
  readonly is_target_luminary: boolean;
}

export interface FocusContext {
  /** `natal`: a planet of the birth chart. `transit`: a transiting planet read against the natal chart. */
  readonly perspective: FocusPerspective;
  readonly rulership: RulershipChoice;
  readonly focus_object: FocusObject;
  readonly aspects: readonly FocusAspect[];
}

// --- Validation, for the server: the payload crosses the wire from an untrusted client and is
// --- placed in a prompt, so every value is rebuilt from a closed set rather than passed through.

const BODY_KEYS: ReadonlySet<string> = new Set(BODIES.map((body) => body.key));
const SIGN_NAMES: ReadonlySet<string> = new Set(SIGNS.map((sign) => sign.name));
const ASPECT_KEYS: ReadonlySet<string> = new Set(ASPECTS.map((aspect) => aspect.key));
function isAngle(value: unknown): value is FocusAngle {
  return value === 'asc' || value === 'mc' || value === 'dsc' || value === 'ic';
}

type Raw = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMember(set: ReadonlySet<string>, value: unknown): value is string {
  return typeof value === 'string' && set.has(value);
}

function isHouse(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= HOUSE_COUNT;
}

function houseList(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length > HOUSE_COUNT || !value.every(isHouse)) return undefined;
  return value;
}

function houseOrNull(value: unknown): number | null | undefined {
  return value === null ? null : isHouse(value) ? value : undefined;
}

export type FocusContextValidation = { readonly context: FocusContext } | { readonly errors: readonly string[] };

/** Re-derives a `FocusContext` from untrusted input, or says what is wrong with it. */
export function validateFocusContext(value: unknown): FocusContextValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ['focusContext must be an object'] };

  const perspective = value.perspective;
  if (perspective !== 'natal' && perspective !== 'transit') errors.push("perspective must be 'natal' or 'transit'");
  if (!isRulershipChoice(value.rulership)) errors.push("rulership must be 'modern', 'traditional' or 'both'");

  const focus = value.focus_object;
  let focusObject: FocusObject | undefined;
  if (!isRecord(focus)) {
    errors.push('focus_object must be an object');
  } else {
    const rules = houseList(focus.rules_houses);
    const house = houseOrNull(focus.house);
    const angle = focus.angle === null ? null : isAngle(focus.angle) ? focus.angle : undefined;
    if (!isMember(BODY_KEYS, focus.key)) errors.push('focus_object.key must be a known body');
    if (!isMember(SIGN_NAMES, focus.sign)) errors.push('focus_object.sign must be a zodiac sign');
    if (house === undefined) errors.push('focus_object.house must be 1-12 or null');
    if (rules === undefined) errors.push('focus_object.rules_houses must be a list of houses 1-12');
    if (typeof focus.is_chart_ruler !== 'boolean') errors.push('focus_object.is_chart_ruler must be a boolean');
    if (typeof focus.on_angle !== 'boolean') errors.push('focus_object.on_angle must be a boolean');
    if (angle === undefined) errors.push("focus_object.angle must be 'asc', 'mc', 'dsc', 'ic' or null");
    if (!isMember(BODY_KEYS, focus.dispositor)) errors.push('focus_object.dispositor must be a known body');
    // Absent from an older client's payload: no second ruler.
    const coDispositor =
      focus.co_dispositor === undefined || focus.co_dispositor === null
        ? null
        : isMember(BODY_KEYS, focus.co_dispositor)
          ? focus.co_dispositor
          : undefined;
    if (coDispositor === undefined) errors.push('focus_object.co_dispositor must be a known body or null');
    if (
      isMember(BODY_KEYS, focus.key) &&
      isMember(SIGN_NAMES, focus.sign) &&
      house !== undefined &&
      rules !== undefined &&
      typeof focus.is_chart_ruler === 'boolean' &&
      typeof focus.on_angle === 'boolean' &&
      angle !== undefined &&
      isMember(BODY_KEYS, focus.dispositor) &&
      coDispositor !== undefined
    ) {
      focusObject = {
        key: focus.key,
        sign: focus.sign,
        house,
        rules_houses: rules,
        is_chart_ruler: focus.is_chart_ruler,
        on_angle: focus.on_angle,
        angle,
        dispositor: focus.dispositor,
        co_dispositor: coDispositor,
      };
    }
  }

  const aspects: FocusAspect[] = [];
  if (!Array.isArray(value.aspects)) {
    errors.push('aspects must be a list');
  } else if (value.aspects.length > MAX_FOCUS_ASPECTS) {
    errors.push(`aspects must not exceed ${String(MAX_FOCUS_ASPECTS)} entries`);
  } else {
    value.aspects.forEach((entry: unknown, index) => {
      const where = `aspects[${String(index)}]`;
      if (!isRecord(entry)) {
        errors.push(`${where} must be an object`);
        return;
      }
      const targetKey = isMember(BODY_KEYS, entry.target_key) ? entry.target_key : undefined;
      const targetSign = isMember(SIGN_NAMES, entry.target_sign) ? entry.target_sign : undefined;
      const house = houseOrNull(entry.target_house);
      const rules = houseList(entry.target_rules_houses);
      const aspect = isMember(ASPECT_KEYS, entry.aspect) ? entry.aspect : undefined;
      const orb =
        typeof entry.orb === 'number' && Number.isFinite(entry.orb) && entry.orb >= 0 && entry.orb <= 15
          ? entry.orb
          : undefined;
      const state = entry.state === 'applying' || entry.state === 'separating' ? entry.state : undefined;
      const chartRuler = typeof entry.is_target_chart_ruler === 'boolean' ? entry.is_target_chart_ruler : undefined;
      const luminary = typeof entry.is_target_luminary === 'boolean' ? entry.is_target_luminary : undefined;
      if (targetKey === undefined) errors.push(`${where}.target_key must be a known body`);
      if (targetSign === undefined) errors.push(`${where}.target_sign must be a zodiac sign`);
      if (house === undefined) errors.push(`${where}.target_house must be 1-12 or null`);
      if (rules === undefined) errors.push(`${where}.target_rules_houses must be a list of houses 1-12`);
      if (aspect === undefined) errors.push(`${where}.aspect must be a known aspect`);
      if (orb === undefined) errors.push(`${where}.orb must be 0-15`);
      if (state === undefined) errors.push(`${where}.state must be 'applying' or 'separating'`);
      if (chartRuler === undefined) errors.push(`${where}.is_target_chart_ruler must be a boolean`);
      if (luminary === undefined) errors.push(`${where}.is_target_luminary must be a boolean`);
      if (
        targetKey === undefined ||
        targetSign === undefined ||
        house === undefined ||
        rules === undefined ||
        aspect === undefined ||
        orb === undefined ||
        state === undefined ||
        chartRuler === undefined ||
        luminary === undefined
      ) {
        return;
      }
      aspects.push({
        target_key: targetKey,
        target_sign: targetSign,
        target_house: house,
        target_rules_houses: rules,
        aspect,
        orb: roundOrb(orb),
        state,
        is_target_chart_ruler: chartRuler,
        is_target_luminary: luminary,
      });
    });
  }

  if (errors.length > 0 || focusObject === undefined) return { errors };
  return {
    context: {
      perspective: perspective as FocusPerspective,
      rulership: value.rulership as RulershipChoice,
      focus_object: focusObject,
      aspects,
    },
  };
}
