/**
 * Platform detection shared by the shortcut hints (#1654, #1769): the command palette's legend and the search
 * trigger's tooltip both name ⌘K on Apple keyboards and Ctrl+K elsewhere.
 */
/**
 * @module ui/platform
 * @purpose Platform detection for keyboard shortcut labels: whether the reader's keyboard is an Apple one (⌘ for Cmd), so the hints name the right modifier.
 * @conventions Reads `navigator.platform` at call time, so tests can change it per case. No state, no imports.
 * @exports isApplePlatform
 */

/** Apple keyboards press Cmd, so the shortcut hints name ⌘K there and Ctrl+K elsewhere (#1654). */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
