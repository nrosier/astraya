/**
 * The shared horizontally scrolling tab row (#818, breakpoint moved to 40rem by #826): above 40rem the
 * tabs sit in one non-wrapping row that scrolls sideways (touch pan, trackpad, or a wheel turned into sideways
 * movement), with a fade at whichever edge still has tabs hidden behind it; at 40rem and below the caller's own
 * `fallback` (a labelled Select, `docs/ui/UI-UX_GUIDELINES.md` §2) is shown in place of the tabs. The row's
 * actions are pinned at the far right, outside the scrolling part and outside the fades; at 40rem and below they
 * collapse into one "Chart actions" text toggle with a caret that opens the same actions in an in-flow panel.
 *
 * Presentation only: the caller owns the links (a real `<a aria-current="page">` each), the fallback control,
 * the actions and every string, so each tab row in the app can adopt this without it knowing what the tabs are.
 */
/**
 * @module ScrollingTabRow
 * @purpose Shared wrapper giving a row of route links a hidden-scrollbar horizontal scroller with start/end edge fades, a pinned actions slot that collapses to one menu trigger on narrow screens, and a caller-supplied fallback control at 40rem and below.
 * @conventions Layout, fades and breakpoints live in app.css under `.tab-row*` (one 40rem breakpoint: tabs above it, fallback select and collapsed actions at and below it). The caller supplies the `<a>` children and their `aria-current`; the wrapper renders the labelled `<nav>`. Fades read the scroll position and never take pointer events. Actions are rendered once and shown or hidden by CSS, so a dialog they own keeps its state across the collapse. The collapse toggle is a disclosure (aria-expanded), not an ARIA menu, because the actions are ordinary buttons.
 * @exports ScrollingTabRow, ScrollingTabRowProps, ScrollingTabRowBaseProps, ScrollingTabRowActions
 */
import { Children, useEffect, useId, useRef, useState } from 'react';
import { Button } from './primitives/Button.js';
import { ACTIVE_ROUTE_LINK, useTabRowScroll } from './primitives/useTabRowScroll.js';

export interface ScrollingTabRowBaseProps {
  /** The accessible name of the tab navigation. */
  readonly label: string;
  /** The tab links, each a real link with `aria-current="page"` on the open one. Empty: no tab navigation is drawn. */
  readonly children: React.ReactNode;
  /** Changes when the open tab does, so the row scrolls it clear of the edge fades. */
  readonly activeKey?: string | undefined;
  /** Controls placed first on the row at every width (inside the scrolling part when wide). */
  readonly leading?: React.ReactNode;
  /** What replaces the tabs at 40rem and below, e.g. a labelled Select. Hidden when the tabs show. */
  readonly fallback?: React.ReactNode;
  /** Extra class on the row root, for the caller's own spacing. */
  readonly className?: string | undefined;
  /** Extra class on the tab `<nav>`, for the caller's own hooks (tests and e2e find the chart's by it). */
  readonly navClassName?: string | undefined;
}

/** The pinned triggers (rendered once) and the name of the toggle that holds them at 40rem and below; both or neither. */
export type ScrollingTabRowActions =
  | { readonly actions?: undefined; readonly actionsLabel?: undefined }
  | { readonly actions: React.ReactNode; readonly actionsLabel: string };

/** The caret after the toggle's visible label; decorative, so the label alone is the accessible name. */
const CARET_CLOSED = '▾';
const CARET_OPEN = '▴';
const TOGGLE_ATTRIBUTE = 'data-tab-row-toggle';

export type ScrollingTabRowProps = ScrollingTabRowBaseProps & ScrollingTabRowActions;

export function ScrollingTabRow({
  label,
  children,
  activeKey,
  leading,
  fallback,
  actions,
  actionsLabel,
  className,
  navClassName,
}: ScrollingTabRowProps): React.JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null);
  const { scrollerRef, edges } = useTabRowScroll(activeKey, ACTIVE_ROUTE_LINK);
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();
  const hasTabs = Children.count(children) > 0;
  const hasActions = actions !== undefined && actions !== null && actions !== false;

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
              aria-expanded={menuOpen}
              aria-controls={panelId}
              data-tab-row-toggle=""
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              {actionsLabel} <span aria-hidden="true">{menuOpen ? CARET_OPEN : CARET_CLOSED}</span>
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
