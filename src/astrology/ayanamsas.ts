/**
 * The canonical set of sidereal modes (ayanamsas) Astraya offers (#21).
 *
 * Every `SE_SIDM_*` constant in `generated-constants.ts` names a predefined
 * ayanamsa — that file is itself generated from a live `sweph-wasm` instance
 * (see its own doc comment), so deriving this list from it rather than
 * hand-copying ~46 ids keeps the same "never transcribed" guarantee one level
 * up: a future Swiss Ephemeris release that adds a mode is picked up the next
 * time `gen-constants.mjs` runs, with no edit needed here.
 *
 * `SE_SIDM_USER` is excluded: it selects a caller-supplied custom ayanamsa
 * rather than naming a predefined one, so it has no fixed reference point to
 * list. It is offered separately as `USER_AYANAMSA_ID`, with the user's own
 * reference date and degrees (#1407); `isValidUserAyanamsa` checks those.
 *
 * As with `houses.ts`, display names are not hardcoded here: they come from
 * `EphemerisProvider.ayanamsaName`, a thin wrapper over
 * `swe_get_ayanamsa_name`, so there is one source of truth for the text shown
 * in the UI.
 */

/**
 * @module Ayanamsas
 * @purpose Lists the canonical set of sidereal ayanamsa modes Astraya offers for ayanamsa selection.
 * @conventions The list is derived from SE_SIDM_* constants in generated-constants.ts (itself generated from a live sweph-wasm instance), excluding SE_SIDM_USER, which has no fixed reference point and is offered separately with the user's own definition (#1407); display names come from EphemerisProvider.ayanamsaName, not hardcoded here.
 * @exports AYANAMSAS, ayanamsaById, ayanamsaByKey, USER_AYANAMSA_ID, isValidUserAyanamsa
 */
import { SE } from '../ephemeris/generated-constants.js';
import type { UserAyanamsa } from '../ephemeris/types.js';

export interface AyanamsaDefinition {
  readonly id: number;
  readonly key: string;
}

/** "SE_SIDM_TRUE_CITRA" -> "trueCitra". */
function keyFromConstantName(name: string): string {
  const [first, ...rest] = name
    .replace(/^SE_SIDM_/, '')
    .toLowerCase()
    .split('_');
  return [first, ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1))].join('');
}

export const AYANAMSAS: readonly AyanamsaDefinition[] = Object.entries(SE)
  .filter(([name]) => name.startsWith('SE_SIDM_') && name !== 'SE_SIDM_USER')
  .map(([name, id]) => ({ id, key: keyFromConstantName(name) }))
  .sort((a, b) => a.id - b.id);

const BY_ID = new Map<number, AyanamsaDefinition>(AYANAMSAS.map((ayanamsa) => [ayanamsa.id, ayanamsa]));
const BY_KEY = new Map<string, AyanamsaDefinition>(AYANAMSAS.map((ayanamsa) => [ayanamsa.key, ayanamsa]));

export function ayanamsaById(id: number): AyanamsaDefinition | undefined {
  return BY_ID.get(id);
}

export function ayanamsaByKey(key: string): AyanamsaDefinition | undefined {
  return BY_KEY.get(key);
}

/** The sidereal mode of a user-defined ayanamsa (#1407): `SE_SIDM_USER`, which needs the user's own definition. */
export const USER_AYANAMSA_ID: number = SE.SE_SIDM_USER;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether `value` is a usable user ayanamsa: a real Gregorian `YYYY-MM-DD` reference date and degrees in
 * [0, 360). The date's range is checked by the engine, which refuses dates outside its ephemeris files.
 */
export function isValidUserAyanamsa(value: unknown): value is UserAyanamsa {
  if (typeof value !== 'object' || value === null) return false;
  const { referenceDate, degrees } = value as Record<string, unknown>;
  if (typeof degrees !== 'number' || !Number.isFinite(degrees) || degrees < 0 || degrees >= 360) return false;
  if (typeof referenceDate !== 'string') return false;
  const match = ISO_DATE.exec(referenceDate);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
