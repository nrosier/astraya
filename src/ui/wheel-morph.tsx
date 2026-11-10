/**
 * Draws a wheel's SVG markup into a container by patching the DOM already there, so the parts that did not change
 * keep their nodes (#1440). A playback step moves only the transiting glyphs and the cross-ring aspect lines; the
 * zodiac ring, house spokes and sign boundaries are byte-identical step to step and are left untouched, and the
 * parent `<svg>` is never replaced.
 */
/**
 * @module ui/wheel-morph
 * @purpose Keyed in-place DOM patching of generated wheel markup, and the `PatchedWheel` component that uses it instead of `dangerouslySetInnerHTML`, so a playback step updates attributes rather than re-creating the wheel.
 * @conventions The markup is app-generated (never user-supplied), the same trust boundary as the `dangerouslySetInnerHTML` it replaces. Children are matched by tag plus the wheel's own identity attributes (class, data-body, data-ring, data-sign, data-house, data-aspect-*), then by order among equals; unmatched old nodes are removed and new ones inserted. Output is identical to a fresh `innerHTML` of the same markup. Positions are never recomputed here.
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
function keyOf(node: Node): string {
  if (!(node instanceof Element)) return `#${String(node.nodeType)}`;
  const parts = IDENTITY_ATTRIBUTES.map((name) => node.getAttribute(name) ?? '');
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

/** Makes the children of `current` equal those of `next`, reusing `current`'s nodes wherever a child's key matches. */
function morphChildren(current: Node, next: Node): void {
  const pool = new Map<string, Node[]>();
  for (const child of [...current.childNodes]) {
    const key = keyOf(child);
    const list = pool.get(key);
    if (list === undefined) pool.set(key, [child]);
    else list.push(child);
  }
  let cursor: Node | null = current.firstChild;
  for (const wanted of [...next.childNodes]) {
    const reused = pool.get(keyOf(wanted))?.shift();
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
    if (placed === cursor) {
      cursor = cursor.nextSibling;
    } else {
      current.insertBefore(placed, cursor);
    }
  }
  for (const leftovers of pool.values()) {
    for (const node of leftovers) node.parentNode?.removeChild(node);
  }
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
