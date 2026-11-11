/**
 * Draws a wheel's SVG markup into a container by patching the DOM already there, so the parts that did not change
 * keep their nodes (#1440). A playback step moves only the transiting glyphs and the cross-ring aspect lines; the
 * zodiac ring, house spokes and sign boundaries are byte-identical step to step and are left untouched, and the
 * parent `<svg>` is never replaced.
 */
/**
 * @module ui/wheel-morph
 * @purpose Keyed in-place DOM patching of generated wheel markup, and the `PatchedWheel` component that uses it instead of `dangerouslySetInnerHTML`, so a playback step updates attributes rather than re-creating the wheel.
 * @conventions The markup is app-generated (never user-supplied), the same trust boundary as the `dangerouslySetInnerHTML` it replaces. Children are matched by tag plus the wheel's own identity attributes (class, data-body, data-ring, data-sign, data-house, data-aspect-*), then by order among equals, then once more without the class (a state class such as applying or separating changes by attribute); unmatched old nodes are removed and new ones inserted. Output is identical to a fresh `innerHTML` of the same markup. Positions are never recomputed here.
 * @exports morphMarkup, PatchedWheel
 */
import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEventHandler, MouseEventHandler, Ref } from 'react';

const IDENTITY_ATTRIBUTES = [
  'class',
  'data-body',
  'data-ring',
  'data-sign',
  'data-house',
  'data-aspect-key',
  'data-aspect-body-a',
  'data-aspect-body-b',
  'data-ring-a',
  'data-ring-b',
  'data-ring-legend',
  'data-ring-legend-arrow',
  'id',
] as const;

/** The key a child is matched on: its tag and the attributes that say which wheel element it is. */
function keyOf(node: Node, withClass = true): string {
  if (!(node instanceof Element)) return `#${String(node.nodeType)}`;
  const parts = IDENTITY_ATTRIBUTES.map((name) =>
    name === 'class' && !withClass ? '' : (node.getAttribute(name) ?? ''),
  );
  return `${node.tagName}|${parts.join('|')}`;
}

function syncAttributes(from: Element, to: Element): void {
  for (const { name, value } of [...to.attributes]) {
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  for (const { name } of [...from.attributes]) {
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
}

/** Groups `nodes` by `key`, keeping their order within each group. */
function poolOf(nodes: readonly Node[], key: (node: Node) => string): Map<string, Node[]> {
  const pool = new Map<string, Node[]>();
  for (const node of nodes) {
    const list = pool.get(key(node));
    if (list === undefined) pool.set(key(node), [node]);
    else list.push(node);
  }
  return pool;
}

/**
 * Makes the children of `current` equal those of `next`, reusing `current`'s nodes wherever a child's key matches.
 * A second pass matches what is left without the class, so an aspect line turning from applying to separating, or a
 * glyph gaining a state class, keeps its node and changes by attribute.
 */
function morphChildren(current: Node, next: Node): void {
  const wantedNodes = [...next.childNodes];
  const strict = poolOf([...current.childNodes], (node) => keyOf(node));
  const matches = wantedNodes.map((wanted) => strict.get(keyOf(wanted))?.shift());
  const unused = [...strict.values()].flat();
  const loose = poolOf(unused, (node) => keyOf(node, false));
  wantedNodes.forEach((wanted, index) => {
    if (matches[index] !== undefined || !(wanted instanceof Element)) return;
    const reused = loose.get(keyOf(wanted, false))?.shift();
    if (reused !== undefined) matches[index] = reused;
  });
  const kept = new Set(matches);

  let cursor: Node | null = current.firstChild;
  wantedNodes.forEach((wanted, index) => {
    const reused = matches[index];
    let placed: Node;
    if (reused === undefined) {
      placed = wanted;
    } else {
      placed = reused;
      if (reused instanceof Element && wanted instanceof Element) {
        syncAttributes(reused, wanted);
        morphChildren(reused, wanted);
      } else if (reused.nodeValue !== wanted.nodeValue) {
        reused.nodeValue = wanted.nodeValue;
      }
    }
    // Skip over old nodes that are about to be removed, so a kept node is not moved just to pass them.
    while (cursor !== null && cursor !== placed && !kept.has(cursor)) cursor = cursor.nextSibling;
    if (placed === cursor) {
      cursor = cursor.nextSibling;
    } else {
      current.insertBefore(placed, cursor);
    }
  });
  for (const node of unused) if (!kept.has(node)) node.parentNode?.removeChild(node);
}

/** Patches `container` so it holds `markup`, keeping every node whose key still matches. */
export function morphMarkup(container: Element, markup: string): void {
  const template = document.createElement('template');
  template.innerHTML = markup;
  morphChildren(container, template.content);
}

interface PatchedWheelProps {
  readonly markup: string;
  readonly className?: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly onClick?: MouseEventHandler<HTMLDivElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

/** A wheel container whose SVG is patched in place on each new `markup` rather than re-injected. */
export function PatchedWheel({ markup, className, ref, onClick, onKeyDown }: PatchedWheelProps): React.JSX.Element {
  const own = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (own.current !== null) morphMarkup(own.current, markup);
  }, [markup]);
  return (
    <div
      ref={(element) => {
        own.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = element;
      }}
      className={className}
      onClick={onClick}
      onKeyDown={onKeyDown}
    />
  );
}
