/**
 * Message catalogue for `RailCollapseButton.tsx` (#1747, #1851): the sidebar rail's collapse/expand toggle.
 */
/**
 * @module ui/RailCollapseButton.messages
 * @purpose English/Dutch strings for the sidebar rail's collapse/expand button: the short tooltip texts and the longer accessible names for both states.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RailCollapseButton.tsx`; `nl` is typed as `typeof en`.
 * @exports railCollapseButtonMessages
 */
const en = {
  collapseTip: 'Collapse',
  expandTip: 'Expand',
  collapseAria: 'Collapse sidebar',
  expandAria: 'Expand sidebar',
};

const nl: typeof en = {
  collapseTip: 'Samenvouwen',
  expandTip: 'Uitvouwen',
  collapseAria: 'Zijbalk samenvouwen',
  expandAria: 'Zijbalk uitvouwen',
};

export const railCollapseButtonMessages = { en, nl };
