/**
 * The PageHeader's top-right action group as a slot a screen's own controls can reach (#976). The header publishes its
 * group element; a control deep in a screen (the chart's Overlays and Extended settings triggers) portals itself into
 * it. The provider sits at the app root, beside `ExportRegistryProvider`, because a chart page's header and its
 * `ChartDataView` are siblings, not parent and child.
 */
/**
 * @module ui/page-actions-slot
 * @purpose Lets a screen's page-level action controls (Overlay settings, Extended settings) render in the PageHeader's top-right action group, so chart navigation and page actions stay separate (#976).
 * @conventions `App.tsx` mounts `PageActionsProvider` once. `PageHeader` attaches `usePageActionsRef` to its action group; a consumer portals into `usePageActionsTarget()`. A null target means no header is mounted, and the consumer keeps its own fallback.
 * @exports PageActionsProvider, usePageActionsRef, usePageActionsTarget
 */
import { createContext, useCallback, useContext, useState, type RefCallback } from 'react';

interface PageActions {
  readonly target: HTMLElement | null;
  readonly setTarget: (element: HTMLElement | null) => void;
}

const PageActionsContext = createContext<PageActions | null>(null);

/** Mounted once at the app root: holds the element the current page header's action group renders as. */
export function PageActionsProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <PageActionsContext.Provider value={{ target, setTarget }}>{children}</PageActionsContext.Provider>;
}

/**
 * The ref a `PageHeader` attaches to its action group, so the group is published while mounted. Stable across renders
 * (a changing ref callback would be called again every render); with no provider above it, it does nothing.
 */
export function usePageActionsRef(): RefCallback<HTMLElement> {
  const setTarget = useContext(PageActionsContext)?.setTarget;
  return useCallback(
    (element: HTMLElement | null) => {
      setTarget?.(element);
    },
    [setTarget],
  );
}

/** The header's action group element, or null when no header is mounted (the consumer then keeps its fallback). */
export function usePageActionsTarget(): HTMLElement | null {
  return useContext(PageActionsContext)?.target ?? null;
}
