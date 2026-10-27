/**
 * @module ui/primitives/StatList
 * @purpose A definition list of label/value stat tiles (metrics, resolved values) inside the existing card surface.
 * @conventions One `<dl>` of `<div><dt/><dd/></div>` groups (valid HTML). The card surface (border, radius, background) is the global `dl` rule; this adds no card style of its own. Styled by `.primitive-stat-list` in `app.css`, tokens only. The caller owns label and value text (and its translation); values are tabular-nums via the global `dd` rule.
 * @exports StatList, StatListItem
 */
import type { ReactNode } from 'react';

export interface StatListItem {
  readonly label: string;
  readonly value: ReactNode;
}

export function StatList({ items }: { readonly items: readonly StatListItem[] }): React.JSX.Element {
  return (
    <dl className="primitive-stat-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
