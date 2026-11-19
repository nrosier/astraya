/**
 * Whether the desktop workspace rail (#506/#509, `docs/ui/UI-UX_GUIDELINES.md` "Target application
 * shell") is collapsed: a device preference like the last-viewed-person id (`last-person.ts`,
 * whose shape this mirrors) — never synced, never sent anywhere. Collapsed means the rail becomes
 * an icon rail (#1747), not hidden: each navigation item keeps its icon, and its label is kept
 * available to assistive technology and as a tooltip. The preference applies only from 64rem up.
 */
/**
 * @module ui/workspace-rail-setting
 * @purpose Device preference for whether the desktop workspace rail is collapsed; mirrors the shape of last-person.ts.
 * @conventions Device preference stored in localStorage, never synced; cross-tab via a custom event plus the `storage` event, same as last-person.ts.
 * @exports readRailCollapsed, writeRailCollapsed, useRailCollapsed
 */
import { useSyncExternalStore } from 'react';

const KEY = 'astraya:workspaceRailCollapsed';
const CHANGED_EVENT = 'astraya:workspace-rail-collapsed-changed';

export function readRailCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeRailCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? 'true' : 'false');
  } catch {
    // Not remembered across a reload or by another tab, but this is a presentation convenience,
    // not a setting the reader would notice silently failing to persist.
    return;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Whether the rail is collapsed, and a setter that saves it and updates every open tab. */
export function useRailCollapsed(): readonly [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, readRailCollapsed, () => false);
  const set = (next: boolean): void => {
    writeRailCollapsed(next);
  };
  return [collapsed, set] as const;
}
