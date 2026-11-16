/**
 * @module ui/palette-recents
 * @purpose Device-local store for the command palette's recently opened entries (last 8) and pinned entries (#1654), kept in localStorage.
 * @conventions Device convenience, never synced. Every storage access is wrapped in try/catch and falls back to empty; a failed write is silently dropped. Ids are opaque strings from the search index; unknown ids are pruned when the index changes.
 * @exports PaletteState, RECENT_CAP, readPaletteState, recordRecent, togglePin, prunePaletteState
 */

const KEY = 'astraya:palette-recents';

/** Maximum number of recently opened entries kept. */
export const RECENT_CAP = 8;

export interface PaletteState {
  /** Most recent first, deduplicated, at most `RECENT_CAP` long. */
  readonly recents: readonly string[];
  /** In the order they were pinned. */
  readonly pins: readonly string[];
}

function emptyState(): PaletteState {
  return { recents: [], pins: [] };
}

/** Keeps the first occurrence of each non-empty string, ignoring anything that is not a string. */
function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: unknown[] = value;
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item === 'string' && item !== '') seen.add(item);
  }
  return [...seen];
}

function writeState(state: PaletteState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not remembered across a reload. This is a convenience, so nothing else depends on it taking effect.
  }
}

/** The stored recents and pins, or empty lists when nothing is stored, the value is malformed, or storage is unavailable. */
export function readPaletteState(): PaletteState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const recents = 'recents' in parsed ? parseIds(parsed.recents).slice(0, RECENT_CAP) : [];
    const pins = 'pins' in parsed ? parseIds(parsed.pins) : [];
    return { recents, pins };
  } catch {
    return emptyState();
  }
}

/** Moves `id` to the front of the recents, dropping any older copy and anything past the cap. */
export function recordRecent(id: string): void {
  const state = readPaletteState();
  const recents = [id, ...state.recents.filter((recent) => recent !== id)].slice(0, RECENT_CAP);
  writeState({ ...state, recents });
}

/** Pins `id` at the end of the pin order, or unpins it if already pinned. Returns `true` when `id` is now pinned. */
export function togglePin(id: string): boolean {
  const state = readPaletteState();
  const wasPinned = state.pins.includes(id);
  const pins = wasPinned ? state.pins.filter((pin) => pin !== id) : [...state.pins, id];
  writeState({ ...state, pins });
  return !wasPinned;
}

/** Drops recents and pins whose ids are not in `validIds`, and writes only when something was dropped. */
export function prunePaletteState(validIds: ReadonlySet<string>): void {
  const state = readPaletteState();
  const recents = state.recents.filter((id) => validIds.has(id));
  const pins = state.pins.filter((id) => validIds.has(id));
  if (recents.length === state.recents.length && pins.length === state.pins.length) return;
  writeState({ recents, pins });
}
