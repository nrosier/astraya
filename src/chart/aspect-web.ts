/**
 * Aspect web rendering: chords across the wheel's inner circle (#42).
 *
 * Draws one line per already-computed `Aspect` (#24) from one body's true
 * longitude to the other's, at a fixed radius — conventionally the inner
 * circle `wheel.ts` (#39) leaves for house-cusp spokes to converge on, not
 * wherever collision spreading (#41) happened to draw that body's glyph, so
 * the web reflects exact zodiacal position regardless of how crowded the
 * glyph ring got.
 *
 * Styling and the "applying vs separating" distinction are left to CSS: each
 * line carries a class per aspect key (`chart-aspect-square`, ...) and one
 * for its direction (`chart-aspect-applying`/`chart-aspect-separating`),
 * matching the rest of `src/chart/**`, which never bakes colors into the
 * generated markup. `filterAspectsForDisplay` implements the toggles
 * ("by aspect type", "by orb tightness") as a plain filter over `Aspect[]`
 * — orb and aspect key are already on every `Aspect`, so no separate
 * bookkeeping is needed to support a future UI control for either.
 */
/**
 * @module chart/aspect-web
 * @purpose Renders computed aspects as chords across the wheel's inner circle, including a cross-ring variant for multi-ring wheels.
 * @conventions One `<line>` per `Aspect` at a fixed radius (the aspect circle, not wherever glyph collision-spreading moved a body); styling (aspect key, applying/separating, tight-orb) is carried as CSS classes plus a `data-tone` attribute from `aspectTone`, never inline colour; each chord is wrapped in a `<g>` with a wide invisible hit line for clickability and `data-aspect-*`/`data-ring-*` attributes for click-to-isolate.
 * @exports filterAspectsForDisplay, renderAspectWebSvg, renderCrossRingAspectWebSvg, renderCrossRingAngleWebSvg, TIGHT_ORB_DEG; AspectDisplayFilter, CrossRingAngleAspect types.
 */
import type { AspectFamily } from '../astrology/aspects.js';
import { type Aspect, type AspectMatch, aspectTone } from '../astrology/aspects.js';
import { bodyById } from '../astrology/bodies.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import type { WheelOrientationOptions } from './wheel.js';
import { pointOnCircle, wheelAngle } from './wheel.js';

/** `data-body` on a glyph is `BodyDefinition.key` (`glyph-layout.ts`) — resolve the same way here so a click handler can match an aspect line's endpoints against a glyph by the identical string. */
function bodyKeyOf(body: BodyId): string {
  return bodyById(body)?.key ?? String(body);
}

export interface AspectDisplayFilter {
  /** Only these aspect keys are shown; omit to show every aspect present. */
  readonly visibleAspectKeys?: ReadonlySet<string> | readonly string[];
  /** Only these families are shown; omit to show both major and minor. */
  readonly visibleFamilies?: readonly AspectFamily[];
  /** Drop any aspect whose orb is wider than this, in degrees. */
  readonly maxOrb?: Degrees;
}

/** Applies the aspect-type and orb-tightness display toggles to a computed aspect list. */
export function filterAspectsForDisplay(
  aspects: readonly Aspect[],
  filter: AspectDisplayFilter = {},
): readonly Aspect[] {
  const keys = filter.visibleAspectKeys ? new Set(filter.visibleAspectKeys) : undefined;
  const families = filter.visibleFamilies ? new Set(filter.visibleFamilies) : undefined;
  return aspects.filter((aspect) => {
    if (keys && !keys.has(aspect.aspect.key)) return false;
    if (families && !families.has(aspect.aspect.family)) return false;
    if (filter.maxOrb !== undefined && aspect.orb > filter.maxOrb) return false;
    return true;
  });
}

function fmt(value: number): string {
  return value.toFixed(2);
}

/** Orbs this tight are drawn heavier, the way the reference wheel weights an exact aspect (#412). */
export const TIGHT_ORB_DEG = 1;

/**
 * One chord as a group: an invisible, wide hit line (a 1-2px chord is otherwise nearly
 * impossible to click — #412) under the visible line, with the endpoint body keys on the
 * group so a click anywhere in it resolves to the same aspect.
 */
function aspectChord(
  aspect: AspectMatch,
  keyA: string,
  keyB: string,
  pointA: { readonly x: number; readonly y: number },
  pointB: { readonly x: number; readonly y: number },
  extraClass: string,
  ringA: number,
  ringB: number,
  extraAttributes = '',
): string {
  const direction = aspect.applying ? 'applying' : 'separating';
  const tight = aspect.orb <= TIGHT_ORB_DEG ? ' chart-aspect-tight' : '';
  const className = `chart-aspect${extraClass} chart-aspect-${aspect.aspect.key} chart-aspect-${direction}${tight}`;
  const coords = `x1="${fmt(pointA.x)}" y1="${fmt(pointA.y)}" x2="${fmt(pointB.x)}" y2="${fmt(pointB.y)}"`;
  return (
    `<g class="chart-aspect-link" data-aspect-key="${aspect.aspect.key}" data-aspect-body-a="${keyA}" data-aspect-body-b="${keyB}" data-ring-a="${String(ringA)}" data-ring-b="${String(ringB)}"${extraAttributes}>` +
    `<line ${coords} class="chart-hit-area" stroke="none" stroke-width="10" pointer-events="all" />` +
    `<line ${coords} class="${className}" data-tone="${aspectTone(aspect.aspect.key)}" />` +
    `</g>`
  );
}

/**
 * Renders one `<line>` per aspect, chording the circle of radius `radius`
 * centered at `(cx, cy)`. `longitudeOf` resolves each aspect's two bodies to
 * their true ecliptic longitude; `cx`/`cy`/`ascendant` must match the
 * `renderWheelSvg` call this is layered onto (#39), and so must
 * `orientation`/`sweep` (#43) if that call used anything other than the
 * defaults.
 */
export function renderAspectWebSvg(
  aspects: readonly Aspect[],
  longitudeOf: (body: BodyId) => Degrees,
  ascendant: Degrees,
  cx: number,
  cy: number,
  radius: number,
  orientationOptions?: WheelOrientationOptions,
  /** The ring both ends of these aspects are on (they are one chart's own). Defaults to 0. */
  ring = 0,
): string {
  const parts: string[] = [];
  for (const aspect of aspects) {
    const angleA = wheelAngle(longitudeOf(aspect.bodyA), ascendant, orientationOptions);
    const angleB = wheelAngle(longitudeOf(aspect.bodyB), ascendant, orientationOptions);
    const pointA = pointOnCircle(cx, cy, radius, angleA);
    const pointB = pointOnCircle(cx, cy, radius, angleB);
    parts.push(aspectChord(aspect, bodyKeyOf(aspect.bodyA), bodyKeyOf(aspect.bodyB), pointA, pointB, '', ring, ring));
  }
  return parts.join('');
}

/**
 * Cross-ring variant for a bi-wheel or tri-wheel (#52): like
 * `renderAspectWebSvg`, but the aspect's two bodies live on different rings at
 * different radii, so each side gets its own resolver rather than one shared
 * `longitudeOf`/`radius`. `resolveA`/`resolveB` order matches every #51
 * `contacts` field (`bodyA` is the moving/outer side, `bodyB` the fixed/inner
 * side) — pass the outer ring's resolver as `resolveA` and the inner ring's
 * as `resolveB` to draw them correctly.
 */
export function renderCrossRingAspectWebSvg(
  aspects: readonly Aspect[],
  resolveA: (body: BodyId) => { readonly longitude: Degrees; readonly radius: number; readonly ring: number },
  resolveB: (body: BodyId) => { readonly longitude: Degrees; readonly radius: number; readonly ring: number },
  ascendant: Degrees,
  cx: number,
  cy: number,
  orientationOptions?: WheelOrientationOptions,
): string {
  const parts: string[] = [];
  for (const aspect of aspects) {
    const a = resolveA(aspect.bodyA);
    const b = resolveB(aspect.bodyB);
    const angleA = wheelAngle(a.longitude, ascendant, orientationOptions);
    const angleB = wheelAngle(b.longitude, ascendant, orientationOptions);
    const pointA = pointOnCircle(cx, cy, a.radius, angleA);
    const pointB = pointOnCircle(cx, cy, b.radius, angleB);
    parts.push(
      aspectChord(
        aspect,
        bodyKeyOf(aspect.bodyA),
        bodyKeyOf(aspect.bodyB),
        pointA,
        pointB,
        ' chart-cross-aspect',
        a.ring,
        b.ring,
      ),
    );
  }
  return parts.join('');
}

/**
 * A body's aspect to a ring's Ascendant or Midheaven (#1508). The angle has no `BodyId`, so it is
 * kept apart from `Aspect`; `TransitAngleContact` satisfies this shape.
 */
export interface CrossRingAngleAspect extends AspectMatch {
  readonly angle: 'asc' | 'mc';
  readonly body: BodyId;
}

/**
 * Draws each angle contact from the moving body (outer ring) to the inner ring's Ascendant or
 * Midheaven longitude, on the same aspect circle as `renderCrossRingAspectWebSvg`. The line carries
 * the same `chart-aspect-link` markup with the angle's key (`asc`/`mc`) as the second end and
 * `data-aspect-point="angle"`, so the isolation click handling reads it like any cross line.
 */
export function renderCrossRingAngleWebSvg(
  aspects: readonly CrossRingAngleAspect[],
  resolveBody: (body: BodyId) => { readonly longitude: Degrees; readonly radius: number; readonly ring: number },
  resolveAngle: (angle: 'asc' | 'mc') => {
    readonly longitude: Degrees;
    readonly radius: number;
    readonly ring: number;
  },
  ascendant: Degrees,
  cx: number,
  cy: number,
  orientationOptions?: WheelOrientationOptions,
): string {
  const parts: string[] = [];
  for (const aspect of aspects) {
    const a = resolveBody(aspect.body);
    const b = resolveAngle(aspect.angle);
    const pointA = pointOnCircle(cx, cy, a.radius, wheelAngle(a.longitude, ascendant, orientationOptions));
    const pointB = pointOnCircle(cx, cy, b.radius, wheelAngle(b.longitude, ascendant, orientationOptions));
    parts.push(
      aspectChord(
        aspect,
        bodyKeyOf(aspect.body),
        aspect.angle,
        pointA,
        pointB,
        ' chart-cross-aspect',
        a.ring,
        b.ring,
        ' data-aspect-point="angle"',
      ),
    );
  }
  return parts.join('');
}
