/**
 * Click-to-isolate for any chart wheel (#400, #412, #418, #448): which symbol was clicked, and
 * which parts of the wheel stay at full strength because of it.
 *
 * Everything here reads the wheel's own markup (`data-body`, `data-ring`, `data-body-sign`,
 * `data-sign`, `data-aspect-body-a/b`, `data-ring-a/b`, `data-ring-legend`), never the chart data
 * behind it. That is what lets one implementation serve the natal wheel, the transit and synastry
 * bi-wheels and any wheel added later: a screen only has to render `renderMultiWheelSvg`'s markup
 * and mount `useWheelIsolation`. A screen supplies its own panel of facts, since what is worth
 * stating differs.
 *
 * A body is identified by its key *and its ring*, written `sun@1`: a bi-wheel draws the Sun twice,
 * and clicking one must not light up the other. A single wheel has only ring 0, so `sun@0`.
 *
 * Selection keys are `body:<id>`, `sign:<lowercase sign name>`, `aspect:<idA>|<idB>` (sorted, so
 * the same pair is the same key whichever end was named first) and `ring:<index>` — the last from
 * clicking a ring's legend entry (#448), isolating every body on that ring plus every aspect, own
 * or cross-ring, touching one of them (the same "focus plus its connections" rule `body` and
 * `sign` already use, just seeded with a whole ring's bodies instead of one or a sign's worth).
 */
/**
 * @module ui/wheel-interaction
 * @purpose Click-to-isolate interaction logic shared by every chart wheel (natal, bi-wheels, ring legends — #400/#412/#418/#448): determines what was clicked and dims everything else in the drawn SVG.
 * @conventions Reads only the wheel's own markup data-attributes (data-body, data-ring, data-sign, data-aspect-body-a/b, data-ring-legend) rather than the underlying chart data, so one implementation serves every wheel type; applies classes directly to injected DOM (not React state) since the wheel markup is a raw string, not React elements.
 * @exports aspectKeyFor, selectionKeyForTarget, applyIsolation, WheelIsolation, useWheelIsolation
 */
import { useEffect, useRef, useState } from 'react';
import { bodyId } from '../chart/body-id.js';

function idOfBodyElement(element: Element): string {
  return bodyId(element.getAttribute('data-body') ?? '', element.getAttribute('data-ring') ?? '0');
}

function endsOfLink(link: Element): readonly [string, string] {
  return [
    bodyId(link.getAttribute('data-aspect-body-a') ?? '', link.getAttribute('data-ring-a') ?? '0'),
    bodyId(link.getAttribute('data-aspect-body-b') ?? '', link.getAttribute('data-ring-b') ?? '0'),
  ];
}

/** The pair key for two body ids, the same whichever is named first. */
export function aspectKeyFor(idA: string, idB: string): string {
  return `aspect:${[idA, idB].sort().join('|')}`;
}

/** The selection a click on `target` makes, or `undefined` when it landed on none of the wheel's symbols. */
export function selectionKeyForTarget(target: Element): string | undefined {
  const body = target.closest('[data-body]');
  if (body !== null) return `body:${idOfBodyElement(body)}`;
  const sign = target.closest('[data-sign]');
  if (sign !== null) return `sign:${sign.getAttribute('data-sign') ?? ''}`;
  const ringLegend = target.closest('[data-ring-legend]');
  if (ringLegend !== null) return `ring:${ringLegend.getAttribute('data-ring-legend') ?? ''}`;
  const link = target.closest('[data-aspect-body-a]');
  if (link !== null) {
    const [a, b] = endsOfLink(link);
    return aspectKeyFor(a, b);
  }
  return undefined;
}

interface Keep {
  readonly bodies: ReadonlySet<string>;
  readonly signs: ReadonlySet<string>;
  readonly links: ReadonlySet<Element>;
  /**
   * Which ring(s) a `[data-ring-legend]` entry should stay lit for (#455) — `undefined` for
   * every kind except `ring` itself, since a legend entry names *whose chart this is*, not
   * *does this body/sign/aspect selection happen to touch this ring somewhere* (a ring
   * selection's own `bodies` already includes the other ring's cross-aspect partners via
   * `withConnections`, so deriving this from `bodies` instead would wrongly keep the other
   * person's legend lit whenever any of their placements aspects the selected one).
   */
  readonly rings?: ReadonlySet<string>;
}

/** What stays at full strength for `selectionKey`, worked out from the markup under `root`. */
function whatStays(root: Element, selectionKey: string): Keep | undefined {
  const bodyElements = [...root.querySelectorAll('[data-body]')];
  const links = [...root.querySelectorAll('[data-aspect-body-a]')];
  const signOfBody = new Map<string, string>();
  for (const element of bodyElements) {
    signOfBody.set(idOfBodyElement(element), element.getAttribute('data-body-sign') ?? '');
  }

  const colon = selectionKey.indexOf(':');
  if (colon === -1) return undefined;
  const kind = selectionKey.slice(0, colon);
  const value = selectionKey.slice(colon + 1);

  /** The given bodies, plus every body they aspect and every aspect line involved. */
  const withConnections = (focus: ReadonlySet<string>): { bodies: Set<string>; links: Set<Element> } => {
    const bodies = new Set(focus);
    const kept = new Set<Element>();
    for (const link of links) {
      const [a, b] = endsOfLink(link);
      if (!focus.has(a) && !focus.has(b)) continue;
      bodies.add(a);
      bodies.add(b);
      kept.add(link);
    }
    return { bodies, links: kept };
  };

  if (kind === 'body') {
    const connected = withConnections(new Set([value]));
    const sign = signOfBody.get(value);
    return { ...connected, signs: new Set(sign === undefined || sign === '' ? [] : [sign]) };
  }
  if (kind === 'sign') {
    const inSign = new Set([...signOfBody].filter(([, sign]) => sign === value).map(([id]) => id));
    return { ...withConnections(inSign), signs: new Set([value]) };
  }
  if (kind === 'ring') {
    const inRing = new Set(
      bodyElements.filter((element) => (element.getAttribute('data-ring') ?? '0') === value).map(idOfBodyElement),
    );
    const signs = new Set(
      [...inRing].map((id) => signOfBody.get(id)).filter((sign): sign is string => sign !== undefined && sign !== ''),
    );
    return { ...withConnections(inRing), signs, rings: new Set([value]) };
  }
  if (kind === 'aspect') {
    const [a, b] = value.split('|');
    if (a === undefined || b === undefined) return undefined;
    const wanted = aspectKeyFor(a, b);
    const kept = new Set(
      links.filter((link) => {
        const [x, y] = endsOfLink(link);
        return aspectKeyFor(x, y) === wanted;
      }),
    );
    const signs = [signOfBody.get(a), signOfBody.get(b)].filter(
      (sign): sign is string => sign !== undefined && sign !== '',
    );
    return { bodies: new Set([a, b]), signs: new Set(signs), links: kept };
  }
  return undefined;
}

/**
 * Dims everything on the wheel except what `selectionKey` keeps, or clears every dimming when it is
 * `undefined`. Applied straight to the injected DOM — the wheel is a raw markup string, not React
 * elements, so no amount of state can re-render its classes. `chart-dimmed` is styled in `app.css`.
 */
export function applyIsolation(root: Element, selectionKey: string | undefined): void {
  const keep = selectionKey === undefined ? undefined : whatStays(root, selectionKey);
  for (const element of root.querySelectorAll('[data-body]')) {
    element.classList.toggle('chart-dimmed', keep !== undefined && !keep.bodies.has(idOfBodyElement(element)));
  }
  for (const element of root.querySelectorAll('[data-sign]')) {
    element.classList.toggle(
      'chart-dimmed',
      keep !== undefined && !keep.signs.has(element.getAttribute('data-sign') ?? ''),
    );
  }
  for (const element of root.querySelectorAll('[data-aspect-body-a]')) {
    element.classList.toggle('chart-dimmed', keep !== undefined && !keep.links.has(element));
  }
  // Only a `ring` selection says anything about which legend entry to dim (#455) — `keep.rings`
  // is `undefined` for every other kind, so this loop is a no-op then, same as a fresh wheel.
  for (const element of root.querySelectorAll('[data-ring-legend]')) {
    const ring = element.getAttribute('data-ring-legend') ?? '';
    element.classList.toggle('chart-dimmed', keep?.rings !== undefined && !keep.rings.has(ring));
  }
}

export interface WheelIsolation {
  /** Goes on the element that holds the wheel's markup. */
  readonly wheelRef: React.RefObject<HTMLDivElement | null>;
  /** The current selection, or `undefined`. */
  readonly selectionKey: string | undefined;
  readonly clear: () => void;
  /** Selects `key` as a click would (`body:sun@0`, `aspect:…`), or clears it when it is already the selection: for a table row's button (#418). */
  readonly toggle: (key: string) => void;
  /** Goes on the same element as `wheelRef`. */
  readonly onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Selection state and the dimming effect for one wheel. `resetKey` identifies the wheel's current
 * markup: a new one (a redraw, another person, changed settings) may no longer contain what was
 * selected, so the selection is cleared rather than left pointing at something that is gone.
 */
export function useWheelIsolation(resetKey: unknown): WheelIsolation {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [selectionKey, setSelectionKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSelectionKey(undefined);
  }, [resetKey]);

  useEffect(() => {
    if (wheelRef.current !== null) applyIsolation(wheelRef.current, selectionKey);
  }, [selectionKey, resetKey]);

  return {
    wheelRef,
    selectionKey,
    clear: () => {
      setSelectionKey(undefined);
    },
    toggle: (key) => {
      setSelectionKey((current) => (current === key ? undefined : key));
    },
    onClick: (event) => {
      const next = selectionKeyForTarget(event.target as Element);
      // Clicking the selected symbol again, or empty space, clears it.
      setSelectionKey((current) => (current === next ? undefined : next));
    },
  };
}
