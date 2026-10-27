/**
 * @module useTabRowScroll
 * @purpose Scroll behaviour shared by every tab row (#818): which edges still have tabs hidden behind them, a mouse wheel turned into sideways movement, and the open tab kept clear of the edge fades.
 * @conventions Presentation only; the caller renders the scroller element (attach `scrollerRef`) and the fades, and finds the open tab with a CSS selector (`[aria-current="page"]` for route links, `[aria-selected="true"]` for ARIA tabs). Edges are read from the scroll position, never assumed. The wheel listener is native because React's wheel handlers are passive.
 * @exports useTabRowScroll, TabRowScrollEdges, ACTIVE_ROUTE_LINK, ACTIVE_ARIA_TAB
 */
import { useEffect, useRef, useState } from 'react';

export interface TabRowScrollEdges {
  readonly start: boolean;
  readonly end: boolean;
}

export const ACTIVE_ROUTE_LINK = '[aria-current="page"]';
export const ACTIVE_ARIA_TAB = '[aria-selected="true"]';

/** Moves the scroller without the row's smooth animation (each wheel tick starts where the last one landed). */
function jumpTo(scroller: HTMLElement, left: number): void {
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'instant' });
  else scroller.scrollLeft = left;
}

export function useTabRowScroll(
  activeKey: string | undefined,
  activeSelector: string,
): { readonly scrollerRef: React.RefObject<HTMLDivElement | null>; readonly edges: TabRowScrollEdges } {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<TabRowScrollEdges>({ start: false, end: false });
  const measureRef = useRef<() => void>(() => undefined);

  // Which edges still have tabs behind them: read from the scroll position, never assumed.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return undefined;
    const measure = (): void => {
      const start = scroller.scrollLeft > 0;
      const end = scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1;
      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    measureRef.current = measure;
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  // The tabs themselves (another locale, a view added or dropped) change the scrollable width without resizing the
  // scroller, so the edges are read again after every render; the state setter bails out when nothing changed.
  useEffect(() => {
    measureRef.current();
  });

  // A mouse wheel only turns vertically; over the tab row it moves the tabs sideways instead, until an end is
  // reached and the page gets the wheel back.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (max <= 0) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const next = Math.min(max, Math.max(0, scroller.scrollLeft + delta));
      if (next === scroller.scrollLeft) return;
      event.preventDefault();
      jumpTo(scroller, next);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Keeps the open tab clear of the fades (3rem wide) when it changes, or on first draw.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || activeKey === undefined) return;
    const active = scroller.querySelector<HTMLElement>(activeSelector);
    if (active === null) return;
    const box = scroller.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.width === 0) return;
    const rem = Number.parseFloat(getComputedStyle(scroller).fontSize);
    const margin = Number.isFinite(rem) ? rem * 3 : 0;
    const behind = box.left + margin - item.left;
    const beyond = item.right - (box.right - margin);
    let left = scroller.scrollLeft;
    if (behind > 0) left -= behind;
    else if (beyond > 0) left += beyond;
    if (left === scroller.scrollLeft) return;
    jumpTo(scroller, left);
  }, [activeKey, activeSelector]);

  return { scrollerRef, edges };
}
