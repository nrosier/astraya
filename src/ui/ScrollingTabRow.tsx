/**
 * The shared horizontally scrolling tab row (#818): at and above the app's standing 64rem nav breakpoint the
 * tabs sit in one non-wrapping row that scrolls sideways (touch pan, trackpad, or a wheel turned into sideways
 * movement), with a fade at whichever edge still has tabs hidden behind it; below 64rem the caller's own
 * `fallback` (a labelled Select, `docs/ui/UI-UX_GUIDELINES.md` §2) is shown in place of the tabs. The row's
 * actions are pinned at the far right, outside the scrolling part and outside the fades; below 450px they
 * collapse into one "⚙️ ▾" trigger that opens the same actions in an in-flow panel.
 *
 * Presentation only: the caller owns the links (a real `<a aria-current="page">` each), the fallback control,
 * the actions and every string, so each tab row in the app can adopt this without it knowing what the tabs are.
 */
/**
 * @module ScrollingTabRow
 * @purpose Shared wrapper giving a row of route links a hidden-scrollbar horizontal scroller with start/end edge fades, a pinned actions slot that collapses to one menu trigger on narrow screens, and a caller-supplied fallback control below 64rem.
 * @conventions Layout, fades and breakpoints live in app.css under `.tab-row*` (64rem tabs-vs-fallback, 449.98px actions collapse). The caller supplies the `<a>` children and their `aria-current`; the wrapper renders the labelled `<nav>`. Fades read the scroll position and never take pointer events. Actions are rendered once and shown or hidden by CSS, so a dialog they own keeps its state across the collapse. The collapse toggle is a disclosure (aria-expanded), not an ARIA menu, because the actions are ordinary buttons.
 * @exports ScrollingTabRow, ScrollingTabRowProps, ScrollingTabRowBaseProps, ScrollingTabRowActions
 */
import { Children, useEffect, useId, useRef, useState } from 'react';
import { Button } from './primitives/Button.js';

export interface ScrollingTabRowBaseProps {
  /** The accessible name of the tab navigation. */
  readonly label: string;
  /** The tab links, each a real link with `aria-current="page"` on the open one. Empty: no tab navigation is drawn. */
  readonly children: React.ReactNode;
  /** Changes when the open tab does, so the row scrolls it clear of the edge fades. */
  readonly activeKey?: string | undefined;
  /** Controls placed first on the row at every width (inside the scrolling part when wide). */
  readonly leading?: React.ReactNode;
  /** Muted text between `leading` and the tabs; shown only where the tabs are (at and above 64rem). */
  readonly prefix?: React.ReactNode;
  /** What replaces the tabs below 64rem, e.g. a labelled Select. Hidden when the tabs show. */
  readonly fallback?: React.ReactNode;
  /** Extra class on the row root, for the caller's own spacing. */
  readonly className?: string | undefined;
  /** Extra class on the tab `<nav>`, for the caller's own hooks (tests and e2e find the chart's by it). */
  readonly navClassName?: string | undefined;
}

/** The pinned triggers (rendered once) and the name of the toggle that holds them below 450px; both or neither. */
export type ScrollingTabRowActions =
  | { readonly actions?: undefined; readonly actionsLabel?: undefined }
  | { readonly actions: React.ReactNode; readonly actionsLabel: string };

/** The label under the "⚙️ ▾" glyphs is the accessible name; the glyphs themselves carry no words. */
const TOGGLE_GLYPHS = '⚙️ ▾';
const TOGGLE_ATTRIBUTE = 'data-tab-row-toggle';

export type ScrollingTabRowProps = ScrollingTabRowBaseProps & ScrollingTabRowActions;

/** Moves the scroller without the row's smooth animation (each wheel tick starts where the last one landed). */
function jumpTo(scroller: HTMLElement, left: number): void {
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'instant' });
  else scroller.scrollLeft = left;
}

export function ScrollingTabRow({
  label,
  children,
  activeKey,
  leading,
  prefix,
  fallback,
  actions,
  actionsLabel,
  className,
  navClassName,
}: ScrollingTabRowProps): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();
  const hasTabs = Children.count(children) > 0;
  const hasActions = actions !== undefined && actions !== null && actions !== false;

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
  // reached and the page gets the wheel back. Native listener: React's wheel handlers are passive.
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
    const active = scroller.querySelector<HTMLElement>('[aria-current="page"]');
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
  }, [activeKey]);

  // The collapsed actions panel: closes on an outside press, Escape and focus leaving, and once a dialog it
  // opened has closed (focus then goes to the toggle, since the trigger that opened it is hidden again).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const group = groupRef.current;
      if (group !== null && event.target instanceof Node && group.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const group = groupRef.current;
    if (group === null || !menuOpen) return undefined;
    const onDialogClose = (event: Event): void => {
      if (!(event.target instanceof HTMLDialogElement)) return;
      setMenuOpen(false);
      group.querySelector<HTMLElement>(`[${TOGGLE_ATTRIBUTE}]`)?.focus();
    };
    // `close` does not bubble, so it is caught on the way down.
    group.addEventListener('close', onDialogClose, true);
    return () => {
      group.removeEventListener('close', onDialogClose, true);
    };
  }, [menuOpen]);

  const rootClass = ['tab-row', className].filter((value) => value !== undefined).join(' ');
  return (
    <div className={rootClass} data-can-scroll-start={edges.start} data-can-scroll-end={edges.end}>
      <div className="tab-row__viewport">
        <div ref={scrollerRef} className="tab-row__scroll">
          {leading !== undefined && leading !== null && <div className="tab-row__leading">{leading}</div>}
          {hasTabs && prefix !== undefined && prefix !== null && <div className="tab-row__prefix">{prefix}</div>}
          {hasTabs && (
            <nav
              className={['tab-row__tabs', navClassName].filter((c) => c !== undefined).join(' ')}
              aria-label={label}
            >
              {children}
            </nav>
          )}
          {fallback !== undefined && fallback !== null && <div className="tab-row__fallback">{fallback}</div>}
        </div>
        <span className="tab-row__fade tab-row__fade--start" aria-hidden="true" />
        <span className="tab-row__fade tab-row__fade--end" aria-hidden="true" />
      </div>
      {hasActions && (
        <div
          ref={groupRef}
          className="tab-row__actions"
          data-open={menuOpen}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !menuOpen) return;
            // Escape inside a dialog belongs to the dialog.
            if (event.target instanceof Element && event.target.closest('dialog') !== null) return;
            setMenuOpen(false);
            groupRef.current?.querySelector<HTMLElement>(`[${TOGGLE_ATTRIBUTE}]`)?.focus();
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (menuOpen && next instanceof Node && !event.currentTarget.contains(next)) setMenuOpen(false);
          }}
        >
          <span className="tab-row__actions-toggle">
            <Button
              size="compact"
              aria-label={actionsLabel}
              aria-expanded={menuOpen}
              aria-controls={panelId}
              data-tab-row-toggle=""
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              {TOGGLE_GLYPHS}
            </Button>
          </span>
          <div id={panelId} className="tab-row__actions-panel">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
