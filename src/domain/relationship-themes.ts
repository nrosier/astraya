/**
 * Groups a synastry pairing's cross-chart aspects by theme (#422): the customary groupings a
 * human synastry reading uses, instead of one flat list ranked only by strength. Pure and
 * synchronous over an already-computed `SynastryData` — no ephemeris access, same convention
 * `report.ts` follows for one chart.
 *
 * Reuses `rankedSynastryAspects` for the strength each contact is sorted by; this module adds
 * only the theme classification and the angle-contact computation `SynastryData.aspects` never
 * includes (`synastry-importance.ts`'s own doc comment: the angles are not bodies, so the
 * cross-aspect search never touches them).
 */
import { bodyById } from '../astrology/bodies.js';
import { matchAspect, type Aspect, type AspectMatch, type OrbConfig } from '../astrology/aspects.js';
import { rankedSynastryAspects, type SynastryData } from './synastry.js';
import { housesAreDefined } from './chart-compute.js';
import type { BodyId, BodyPosition, Degrees } from '../ephemeris/types.js';

export const RELATIONSHIP_THEMES = [
  'bond',
  'attraction',
  'communication',
  'commitment',
  'growth',
  'identity',
  'angles',
  'other',
] as const;
export type RelationshipTheme = (typeof RELATIONSHIP_THEMES)[number];

export interface RelationshipContact {
  readonly aspect: Aspect;
  readonly importance: number;
}

/** A body-to-angle contact: `body` (from `side`'s own chart) to the *other* chart's Ascendant or Midheaven. */
export interface AngleContact extends AspectMatch {
  readonly body: BodyId;
  readonly angle: 'asc' | 'mc';
  /** Whose body this is — `'a'`'s body reaching into `'b'`'s angles, or the reverse. */
  readonly side: 'a' | 'b';
}

const bodyKeyOf = (id: BodyId): string => bodyById(id)?.key ?? String(id);

export type AspectValence = 'harmonious' | 'challenging' | 'neutral';

const HARMONIOUS_ASPECT_KEYS = new Set(['conjunction', 'sextile', 'trine']);
const CHALLENGING_ASPECT_KEYS = new Set(['semisquare', 'square', 'sesquiquadrate', 'opposition']);

/**
 * Harmonious/challenging/neutral, by the same three-way split the live wheel's own aspect-line
 * colours already use (`chart-aspect-{square,opposition,...}` vs. `{conjunction,sextile,trine}`
 * vs. the quintile family — see `app.css`'s `--aspect-hard`/`--aspect-soft`/`--aspect-minor`),
 * so a count here never disagrees with what the chart itself shows. `semisextile` and the
 * quintile family (no tension, no flow) are `neutral`, matching that same convention.
 */
export function aspectValence(aspectKey: string): AspectValence {
  if (HARMONIOUS_ASPECT_KEYS.has(aspectKey)) return 'harmonious';
  if (CHALLENGING_ASPECT_KEYS.has(aspectKey)) return 'challenging';
  return 'neutral';
}

/**
 * Which theme a contact belongs to, by the body pair alone — classified by the first matching
 * rule below, in this fixed priority order (stated explicitly since a pair like Moon-Saturn
 * matches more than one rule and the choice of which theme "wins" is otherwise implicit):
 * 1. Moon with anything — the emotional-bond contacts a synastry reading leads with.
 * 2. Venus-Mars (either order) — attraction, the other customary lead.
 * 3. Mercury with anything — communication.
 * 4. Saturn with anything — commitment and structure.
 * 5. Jupiter with anything — growth and shared expansion.
 * 6. Sun-Sun or Sun-Moon — identity (every other Sun pairing falls through to `other`, since a
 *    reading does not customarily treat e.g. Sun-Saturn as "identity" over "commitment").
 * Everything else (outer-planet-to-outer-planet, asteroid pairs, and so on) is `other`.
 */
function themeOf(bodyAKey: string, bodyBKey: string): RelationshipTheme {
  const keys = [bodyAKey, bodyBKey];
  if (keys.includes('moon')) return 'bond';
  if ((bodyAKey === 'venus' && bodyBKey === 'mars') || (bodyAKey === 'mars' && bodyBKey === 'venus')) {
    return 'attraction';
  }
  if (keys.includes('mercury')) return 'communication';
  if (keys.includes('saturn')) return 'commitment';
  if (keys.includes('jupiter')) return 'growth';
  if (keys.includes('sun')) return 'identity';
  return 'other';
}

/** `rankedSynastryAspects`'s contacts, grouped by `themeOf`, each group still strongest-first. */
export function groupedRelationshipContacts(
  data: SynastryData,
): ReadonlyMap<RelationshipTheme, readonly RelationshipContact[]> {
  const groups = new Map<RelationshipTheme, RelationshipContact[]>();
  for (const { aspect, importance } of rankedSynastryAspects(data)) {
    const theme = themeOf(bodyKeyOf(aspect.bodyA), bodyKeyOf(aspect.bodyB));
    const list = groups.get(theme);
    if (list) list.push({ aspect, importance });
    else groups.set(theme, [{ aspect, importance }]);
  }
  return groups;
}

/** A real body's own rotation rate is irrelevant to a fixed angle's own motion — the same stand-in `computeChartDataAtJd`'s own angle-aspect search uses for "is this still forming". */
const ANGLE_SPEED_DEG_PER_DAY = 360.9856;

function angleBodyPosition(longitude: Degrees): BodyPosition {
  return {
    body: -1,
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed: ANGLE_SPEED_DEG_PER_DAY,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: false,
  };
}

function contactsToAngles(
  bodies: readonly BodyPosition[],
  houses: SynastryData['chartA']['houses'],
  side: 'a' | 'b',
  orbConfig: OrbConfig,
): readonly AngleContact[] {
  if (!housesAreDefined(houses)) return [];
  const targets: readonly ['asc' | 'mc', Degrees][] = [
    ['asc', houses.ascendant],
    ['mc', houses.midheaven],
  ];
  const contacts: AngleContact[] = [];
  for (const [angle, longitude] of targets) {
    const anglePosition = angleBodyPosition(longitude);
    for (const body of bodies) {
      const bodyDefinition = bodyById(body.body);
      if (bodyDefinition === undefined) continue;
      const match = matchAspect(body, bodyDefinition.category, anglePosition, 'planet', orbConfig);
      if (match !== undefined) contacts.push({ ...match, body: body.body, angle, side });
    }
  }
  return contacts;
}

/**
 * Every real contact between one side's bodies and the *other* side's Ascendant/Midheaven —
 * both directions, each using the app's own established aspect/orb rules (`matchAspect`), not
 * an invented "within N degrees" cutoff. Empty for a side whose houses have no solution (an
 * unknown-time person has no Ascendant/Midheaven to contact).
 */
export function relationshipAngleContacts(data: SynastryData): readonly AngleContact[] {
  const orbConfig = data.orbConfig;
  return [
    ...contactsToAngles(data.chartA.positions, data.chartB.houses, 'a', orbConfig),
    ...contactsToAngles(data.chartB.positions, data.chartA.houses, 'b', orbConfig),
  ];
}
