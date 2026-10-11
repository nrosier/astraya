/**
 * The wheel's selection keys (#511): one place that builds them and one that reads them back, so a wheel click,
 * a table row's "Show on the chart" button and the inspector can never disagree about a key's shape.
 */
/**
 * @module interpretation/selection-key
 * @purpose Builds and parses the string keys that name a wheel selection (a planet, sign, house cusp, derived point or aspect line).
 * @conventions Formats are `body:<id>`, `sign:<lowercase sign name>`, `house:<1-12>`, `derived:<point>` and `aspect:<idA>|<idB>` (ids sorted, so the pair reads the same either way round); an id is a body key with an optional ring (`sun`, `sun@1`). Pure; no chart data.
 * @exports WheelSelection, parseSelectionKey, selectionKey
 */
import { isDerivedPointKey, type DerivedPointKey } from '../astrology/derived-points.js';
import { SIGNS } from '../astrology/signs.js';
import { parseBodyId } from '../chart/body-id.js';

export type WheelSelection =
  | { readonly kind: 'body'; readonly key: string; readonly ring: number }
  | { readonly kind: 'sign'; readonly signIndex: number }
  | { readonly kind: 'house'; readonly house: number }
  | { readonly kind: 'derived'; readonly point: DerivedPointKey }
  | {
      readonly kind: 'aspect';
      readonly bodyA: string;
      readonly ringA: number;
      readonly bodyB: string;
      readonly ringB: number;
    };

/**
 * Reads the wheel's selection key: `body:<id>`, `sign:<lowercase sign name>`, `house:<1-12>` (a house's
 * cusp) or `aspect:<idA>|<idB>`,
 * where an id is a body key with an optional ring (`sun`, or `sun@1` — see `chart/body-id.ts`; a
 * bare key is ring 0). `undefined` for anything else, including a sign that does not exist.
 */
export function parseSelectionKey(key: string): WheelSelection | undefined {
  const colon = key.indexOf(':');
  if (colon === -1) return undefined;
  const kind = key.slice(0, colon);
  const value = key.slice(colon + 1);
  if (kind === 'body') {
    const { key: bodyKey, ring } = parseBodyId(value);
    return bodyKey === '' ? undefined : { kind: 'body', key: bodyKey, ring };
  }
  if (kind === 'sign') {
    const signIndex = SIGNS.findIndex((sign) => sign.name.toLowerCase() === value);
    return signIndex === -1 ? undefined : { kind: 'sign', signIndex };
  }
  if (kind === 'derived') {
    return isDerivedPointKey(value) ? { kind: 'derived', point: value } : undefined;
  }
  if (kind === 'house') {
    const house = Number(value);
    return Number.isInteger(house) && house >= 1 && house <= 12 ? { kind: 'house', house } : undefined;
  }
  if (kind === 'aspect') {
    const [idA, idB] = value.split('|');
    if (idA === undefined || idB === undefined) return undefined;
    const a = parseBodyId(idA);
    const b = parseBodyId(idB);
    return a.key === '' || b.key === ''
      ? undefined
      : { kind: 'aspect', bodyA: a.key, ringA: a.ring, bodyB: b.key, ringB: b.ring };
  }
  return undefined;
}

/** Builders for each kind's key: the inverse of `parseSelectionKey`. */
export const selectionKey = {
  body: (id: string): string => `body:${id}`,
  sign: (signName: string): string => `sign:${signName.toLowerCase()}`,
  house: (house: number | string): string => `house:${String(house)}`,
  derived: (point: string): string => `derived:${point}`,
  aspect: (idA: string, idB: string): string => `aspect:${[idA, idB].sort().join('|')}`,
};
