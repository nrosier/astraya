/**
 * The calculated points of a chart that are not bodies and that the corpus describes — the Part of
 * Fortune and the Part of Spirit (#511). They carry a position (a sign and a house) but no motion, aspects or
 * dignity, so a chart interprets them by where they fall, like the corpus's `derived-point-in-sign` /
 * `derived-point-in-house` categories do.
 *
 * The ASC/MC and Sun/Moon midpoints the Derived points table can also list are deliberately NOT here: no
 * public-domain source gives them a meaning (they are 20th-century Hamburg School/Ebertin material), so they
 * stay a table display option with no corpus entry and no selection (owner decision, #511).
 *
 * Only the identities live here; how each is calculated stays in `arabic-parts.ts` and
 * `domain/chart-compute.ts`. The English labels match `derivedPointRows`, which does not translate them
 * (#158's glossary has no vetted Dutch term).
 */
/**
 * @module astrology/derived-points
 * @purpose The closed list of derived (non-body) chart points a corpus entry can describe — the Parts of Fortune and Spirit, keyed by kebab-case identifier.
 * @conventions Identity only — calculation lives elsewhere. Keys are stable corpus vocabulary (they appear inside `derived-point-in-*` keys), so renaming one changes every entry's key.
 * @exports DERIVED_POINTS, DerivedPointKey, DerivedPointDefinition, derivedPointByKey, isDerivedPointKey
 */

export const DERIVED_POINTS = [
  { key: 'part-of-fortune', label: 'Part of Fortune' },
  { key: 'part-of-spirit', label: 'Part of Spirit' },
] as const;

export type DerivedPointDefinition = (typeof DERIVED_POINTS)[number];
export type DerivedPointKey = DerivedPointDefinition['key'];

export function isDerivedPointKey(value: string | undefined): value is DerivedPointKey {
  return DERIVED_POINTS.some((point) => point.key === value);
}

export function derivedPointByKey(key: string): DerivedPointDefinition | undefined {
  return DERIVED_POINTS.find((point) => point.key === key);
}
