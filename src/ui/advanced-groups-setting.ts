/**
 * Which Advanced groups of the Extended settings drawer are open (#856): a device display preference, remembered per
 * browser like the theme. Nothing here is a calculation setting, and nothing that is calculated, saved, shared,
 * exported or printed depends on it; it never enters the draft the drawer applies.
 */
/**
 * @module ui/advanced-groups-setting
 * @purpose Reads, saves and subscribes to the set of open Advanced groups (profile, orbs, special) of the Extended settings drawer, kept in this browser.
 * @conventions One localStorage key holding a JSON list of open tab keys; every group starts closed. A malformed or unknown stored value reads as all closed. Storage is best-effort (a blocked store means "not remembered", the choice still holds for this page). External store for `useSyncExternalStore`, with a stable snapshot until the stored text changes.
 * @exports ADVANCED_GROUPS_KEY, readOpenAdvancedGroups, writeAdvancedGroupOpen, useAdvancedGroupOpen, resetAdvancedGroupsForTests
 */
import { useCallback, useSyncExternalStore } from 'react';
import { isAdvancedTab, type AdvancedTab } from './settings-groups.js';

export const ADVANCED_GROUPS_KEY = 'astraya:advancedGroups';

const CHANGED_EVENT = 'astraya:advanced-groups-changed';
const NONE: readonly AdvancedTab[] = [];

/** The open set when the browser cannot store it, for this page only. */
let memory: readonly AdvancedTab[] | undefined;

function parse(raw: string | null): readonly AdvancedTab[] {
  if (raw === null) return NONE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return NONE;
    const open = [...new Set(value.filter(isAdvancedTab))];
    return open.length === 0 ? NONE : open;
  } catch {
    return NONE;
  }
}

let cachedRaw: string | null | undefined;
let cachedValue: readonly AdvancedTab[] = NONE;

function snapshot(): readonly AdvancedTab[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ADVANCED_GROUPS_KEY);
  } catch {
    return memory ?? NONE;
  }
  if (raw === null && memory !== undefined) return memory;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

export function readOpenAdvancedGroups(): readonly AdvancedTab[] {
  return snapshot();
}

/** Open or close one tab's Advanced group and remember it. */
export function writeAdvancedGroupOpen(tab: AdvancedTab, open: boolean): void {
  const current = snapshot();
  if (current.includes(tab) === open) return;
  const next = open ? [...current, tab] : current.filter((candidate) => candidate !== tab);
  try {
    localStorage.setItem(ADVANCED_GROUPS_KEY, JSON.stringify(next));
    memory = undefined;
  } catch {
    memory = next;
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

/** Whether one tab's Advanced group is open, and a setter that remembers the choice. */
export function useAdvancedGroupOpen(tab: AdvancedTab): readonly [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, snapshot, () => NONE).includes(tab);
  const set = useCallback(
    (next: boolean) => {
      writeAdvancedGroupOpen(tab, next);
    },
    [tab],
  );
  return [open, set];
}

/** For tests: forget the page-only fallback and the cached text. */
export function resetAdvancedGroupsForTests(): void {
  memory = undefined;
  cachedRaw = undefined;
  cachedValue = NONE;
}
