/**
 * Message catalogue for `WorkspaceShell.tsx` (#506/#509): the desktop rail's collapse toggle.
 */
/**
 * @module ui/WorkspaceShell.messages
 * @purpose English/Dutch i18n strings for the workspace rail's collapse/expand toggle.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports workspaceShellMessages
 */
const en = {
  collapse: 'Collapse navigation',
  expand: 'Expand navigation',
  collapseGlyph: '«',
  expandGlyph: '»',
};

const nl: typeof en = {
  collapse: 'Navigatie samenvouwen',
  expand: 'Navigatie uitvouwen',
  collapseGlyph: '«',
  expandGlyph: '»',
};

export const workspaceShellMessages = { en, nl };
