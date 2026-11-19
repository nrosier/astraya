/**
 * Message catalogue for `RailCollapseButton.tsx` (#1747): the sidebar rail's collapse/expand control.
 */
/**
 * @module ui/RailCollapseButton.messages
 * @purpose English/Dutch strings for the sidebar rail's collapse/expand button: the visible label and the accessible names for both states.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RailCollapseButton.tsx`; `nl` is typed as `typeof en`.
 * @exports railCollapseButtonMessages
 */
const en = {
  collapseLabel: 'Collapse',
  collapseAria: 'Collapse sidebar',
  expandAria: 'Expand sidebar',
};

const nl: typeof en = {
  collapseLabel: 'Samenvouwen',
  collapseAria: 'Zijbalk samenvouwen',
  expandAria: 'Zijbalk uitvouwen',
};

export const railCollapseButtonMessages = { en, nl };
