/**
 * The wire shape of the sign-ruler context for one selected sign (#1998) and the closed-set
 * validator the server runs on it before it reaches a prompt. Like `focus-context-schema.ts`, it
 * imports only static reference tables, so the server can use it without the calculation graph;
 * `sign-context.ts` builds the payload.
 *
 * What is sent, and nothing more: the sign, the houses whose cusp lies in it (Lilly, *Christian
 * Astrology*, 1647, p. 49: a house's significator is the lord of the sign on its cusp), the house
 * an intercepted sign sits in, its ruler or rulers under the reader's rulership choice (#426) with
 * each ruler's placement and aspects, and the bodies in the sign (the inspector's list), without
 * their own aspects. No longitudes, name, date, time or place.
 */
/**
 * @module interpretation/sign-context-schema
 * @purpose Defines the wire shape of the Tier-2 "sign" payload (a selected sign, its cusp houses, its ruler's placement and aspects, the bodies in it) and validates it against closed sets before it reaches a model prompt.
 * @conventions Imports only static reference tables and the focus schema's per-item validators. Stricter than the focus validator: an unknown key at any level is refused, not dropped. At most two rulers (two only under Both, traditional first), unique occupants and unique cusp houses 1-12; an intercepted sign has no cusp houses and names the house it sits in.
 * @exports MAX_SIGN_RULERS, SignRulerScheme, SignRuler, SignOccupant, SignContext, SignContextValidation, validateSignContext
 */
import { isRulershipChoice, type RulershipChoice } from '../astrology/rulership.ts';
import {
  BODY_KEYS,
  MAX_FOCUS_ASPECTS,
  SIGN_NAMES,
  houseList,
  houseOrNull,
  isAngle,
  isMember,
  isRecord,
  validateFocusAspect,
  validateFocusObject,
  type FocusAngle,
  type FocusAspect,
  type FocusObject,
  type Raw,
} from './focus-context-schema.ts';

/** A sign has one ruler, or two co-rulers under Both (Scorpio, Aquarius and Pisces only). */
export const MAX_SIGN_RULERS = 2;

/** `shared`: the traditional and modern rulers are the same planet. Otherwise which of the two this is. */
export type SignRulerScheme = 'shared' | 'traditional' | 'modern';

export interface SignRuler {
  readonly scheme: SignRulerScheme;
  /** Where the ruler stands: its own sign, house, rulerships and dispositor. */
  readonly placement: FocusObject;
  /** The ruler's aspects, tightest first. */
  readonly aspects: readonly FocusAspect[];
}

/** A body in the selected sign: where it stands in the houses, without its own aspects (#1998 decision O2). */
export interface SignOccupant {
  readonly key: string;
  readonly house: number | null;
  readonly rules_houses: readonly number[];
  readonly is_chart_ruler: boolean;
  readonly on_angle: boolean;
  readonly angle: FocusAngle | null;
}

export interface SignContext {
  /** Natal wheel only (#1998 decision O3). */
  readonly perspective: 'natal';
  readonly rulership: RulershipChoice;
  readonly sign: string;
  /** The houses whose cusp lies in the sign; empty for an intercepted sign or a chart with no houses. */
  readonly cusp_houses: readonly number[];
  /** For an intercepted sign, the house it sits in; otherwise `null`. */
  readonly intercepted_in_house: number | null;
  readonly rulers: readonly SignRuler[];
  readonly occupants: readonly SignOccupant[];
}

export type SignContextValidation = { readonly context: SignContext } | { readonly errors: readonly string[] };

const CONTEXT_KEYS = ['perspective', 'rulership', 'sign', 'cusp_houses', 'intercepted_in_house', 'rulers', 'occupants'];
const RULER_KEYS = ['scheme', 'placement', 'aspects'];
const PLACEMENT_KEYS = [
  'key',
  'sign',
  'house',
  'rules_houses',
  'is_chart_ruler',
  'on_angle',
  'angle',
  'dispositor',
  'co_dispositor',
];
const ASPECT_FIELDS = [
  'target_key',
  'target_sign',
  'target_house',
  'target_rules_houses',
  'aspect',
  'orb',
  'state',
  'is_target_chart_ruler',
  'is_target_luminary',
];
const OCCUPANT_KEYS = ['key', 'house', 'rules_houses', 'is_chart_ruler', 'on_angle', 'angle'];

/** Pushes an error for every key of `record` outside `allowed`: nothing unlisted is passed on or silently dropped. */
function refuseUnknownKeys(record: Raw, allowed: readonly string[], where: string, errors: string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) errors.push(`${where} has an unknown field`);
  }
}

function isScheme(value: unknown): value is SignRulerScheme {
  return value === 'shared' || value === 'traditional' || value === 'modern';
}

function validateRuler(entry: unknown, where: string, errors: string[]): SignRuler | undefined {
  if (!isRecord(entry)) {
    errors.push(`${where} must be an object`);
    return undefined;
  }
  refuseUnknownKeys(entry, RULER_KEYS, where, errors);
  if (!isScheme(entry.scheme)) errors.push(`${where}.scheme must be 'shared', 'traditional' or 'modern'`);
  let placement: FocusObject | undefined;
  if (!isRecord(entry.placement)) {
    errors.push(`${where}.placement must be an object`);
  } else {
    refuseUnknownKeys(entry.placement, PLACEMENT_KEYS, `${where}.placement`, errors);
    placement = validateFocusObject(entry.placement, `${where}.placement`, errors);
  }
  const aspects: FocusAspect[] = [];
  let aspectsValid = true;
  if (!Array.isArray(entry.aspects)) {
    errors.push(`${where}.aspects must be a list`);
    aspectsValid = false;
  } else if (entry.aspects.length > MAX_FOCUS_ASPECTS) {
    errors.push(`${where}.aspects must not exceed ${String(MAX_FOCUS_ASPECTS)} entries`);
    aspectsValid = false;
  } else {
    entry.aspects.forEach((raw: unknown, index) => {
      const at = `${where}.aspects[${String(index)}]`;
      if (isRecord(raw)) refuseUnknownKeys(raw, ASPECT_FIELDS, at, errors);
      const aspect = validateFocusAspect(raw, at, errors);
      if (aspect === undefined) aspectsValid = false;
      else aspects.push(aspect);
    });
  }
  if (!isScheme(entry.scheme) || placement === undefined || !aspectsValid) return undefined;
  return { scheme: entry.scheme, placement, aspects };
}

function validateOccupant(entry: unknown, where: string, errors: string[]): SignOccupant | undefined {
  if (!isRecord(entry)) {
    errors.push(`${where} must be an object`);
    return undefined;
  }
  refuseUnknownKeys(entry, OCCUPANT_KEYS, where, errors);
  const house = houseOrNull(entry.house);
  const rules = houseList(entry.rules_houses);
  const angle = entry.angle === null ? null : isAngle(entry.angle) ? entry.angle : undefined;
  if (!isMember(BODY_KEYS, entry.key)) errors.push(`${where}.key must be a known body`);
  if (house === undefined) errors.push(`${where}.house must be 1-12 or null`);
  if (rules === undefined) errors.push(`${where}.rules_houses must be a list of houses 1-12`);
  if (typeof entry.is_chart_ruler !== 'boolean') errors.push(`${where}.is_chart_ruler must be a boolean`);
  if (typeof entry.on_angle !== 'boolean') errors.push(`${where}.on_angle must be a boolean`);
  if (angle === undefined) errors.push(`${where}.angle must be 'asc', 'mc', 'dsc', 'ic' or null`);
  if (
    !isMember(BODY_KEYS, entry.key) ||
    house === undefined ||
    rules === undefined ||
    typeof entry.is_chart_ruler !== 'boolean' ||
    typeof entry.on_angle !== 'boolean' ||
    angle === undefined
  ) {
    return undefined;
  }
  return {
    key: entry.key,
    house,
    rules_houses: rules,
    is_chart_ruler: entry.is_chart_ruler,
    on_angle: entry.on_angle,
    angle,
  };
}

/** Re-derives a `SignContext` from untrusted input, or says what is wrong with it. */
export function validateSignContext(value: unknown): SignContextValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ['signContext must be an object'] };
  refuseUnknownKeys(value, CONTEXT_KEYS, 'signContext', errors);

  if (value.perspective !== 'natal') errors.push("perspective must be 'natal'");
  if (!isRulershipChoice(value.rulership)) errors.push("rulership must be 'modern', 'traditional' or 'both'");
  if (!isMember(SIGN_NAMES, value.sign)) errors.push('sign must be a zodiac sign');

  const cuspHouses = houseList(value.cusp_houses);
  if (cuspHouses === undefined) {
    errors.push('cusp_houses must be a list of houses 1-12');
  } else if (new Set(cuspHouses).size !== cuspHouses.length) {
    errors.push('cusp_houses must not repeat a house');
  }
  const intercepted = houseOrNull(value.intercepted_in_house);
  if (intercepted === undefined) errors.push('intercepted_in_house must be 1-12 or null');
  if (intercepted !== undefined && intercepted !== null && cuspHouses !== undefined && cuspHouses.length > 0) {
    errors.push('intercepted_in_house must be null when the sign is on a cusp');
  }

  const rulers: SignRuler[] = [];
  if (!Array.isArray(value.rulers)) {
    errors.push('rulers must be a list');
  } else if (value.rulers.length === 0 || value.rulers.length > MAX_SIGN_RULERS) {
    errors.push(`rulers must hold 1 to ${String(MAX_SIGN_RULERS)} entries`);
  } else {
    value.rulers.forEach((entry: unknown, index) => {
      const ruler = validateRuler(entry, `rulers[${String(index)}]`, errors);
      if (ruler !== undefined) rulers.push(ruler);
    });
    if (value.rulers.length > 1 && value.rulership !== 'both') errors.push("two rulers need rulership 'both'");
    if (new Set(rulers.map((ruler) => ruler.placement.key)).size !== rulers.length) {
      errors.push('rulers must not repeat a body');
    }
  }

  const occupants: SignOccupant[] = [];
  if (!Array.isArray(value.occupants)) {
    errors.push('occupants must be a list');
  } else if (value.occupants.length > BODY_KEYS.size) {
    errors.push(`occupants must not exceed ${String(BODY_KEYS.size)} entries`);
  } else {
    value.occupants.forEach((entry: unknown, index) => {
      const occupant = validateOccupant(entry, `occupants[${String(index)}]`, errors);
      if (occupant !== undefined) occupants.push(occupant);
    });
    if (new Set(occupants.map((occupant) => occupant.key)).size !== occupants.length) {
      errors.push('occupants must not repeat a body');
    }
  }

  if (errors.length > 0 || cuspHouses === undefined || intercepted === undefined) return { errors };
  return {
    context: {
      perspective: 'natal',
      rulership: value.rulership as RulershipChoice,
      sign: value.sign as string,
      cusp_houses: cuspHouses,
      intercepted_in_house: intercepted,
      rulers,
      occupants,
    },
  };
}
