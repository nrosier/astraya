/**
 * @module ui/workspace-utility-slot
 * @purpose Holds the workspace's top-right utility row for global app utilities (the search trigger, #1769). Not page actions: the PageHeader's action group stays in page-actions-slot (#976).
 * @conventions `WorkspaceShell` attaches `useWorkspaceUtilityRef` to the utility row, and `App.tsx` mounts `WorkspaceUtilityProvider` once. A consumer portals into `useWorkspaceUtilityTarget()`. A null target means no shell is mounted, and the consumer keeps its own fallback.
 * @exports WorkspaceUtilityProvider, useWorkspaceUtilityRef, useWorkspaceUtilityTarget
 */
import { createContext, useCallback, useContext, useState, type RefCallback } from 'react';

interface WorkspaceUtility {
  readonly target: HTMLElement | null;
  readonly setTarget: (element: HTMLElement | null) => void;
}

const WorkspaceUtilityContext = createContext<WorkspaceUtility | null>(null);

/** Mounted once at the app root: holds the element the workspace utility row renders as. */
export function WorkspaceUtilityProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <WorkspaceUtilityContext.Provider value={{ target, setTarget }}>{children}</WorkspaceUtilityContext.Provider>;
}

/**
 * The ref the shell attaches to the utility row, so the row is published while mounted. Stable across renders (a
 * changing ref callback would be called again every render); with no provider above it, it does nothing.
 */
export function useWorkspaceUtilityRef(): RefCallback<HTMLElement> {
  const setTarget = useContext(WorkspaceUtilityContext)?.setTarget;
  return useCallback(
    (element: HTMLElement | null) => {
      setTarget?.(element);
    },
    [setTarget],
  );
}

/** The utility row element, or null when no shell is mounted (the consumer then keeps its fallback). */
export function useWorkspaceUtilityTarget(): HTMLElement | null {
  return useContext(WorkspaceUtilityContext)?.target ?? null;
}
