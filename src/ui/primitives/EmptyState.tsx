/**
 * @module ui/primitives/EmptyState
 * @purpose The shared "nothing here" block for a list or panel with no entries: a message, plus an optional follow-up such as a clear-filters or setup action.
 * @conventions Reuses the app's `.empty` look (dashed box, muted text) and adds only `.primitive-empty-state` spacing in `app.css`. The caller passes the already-translated message and owns any action; the primitive has no strings of its own and no live region (a static list state, not a result announcement; use `StatusMessage` for that).
 * @exports EmptyState
 */
import type { ReactNode } from 'react';

export function EmptyState({
  message,
  children,
}: {
  readonly message: string;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="empty primitive-empty-state">
      <p className="primitive-empty-state-message">{message}</p>
      {children}
    </div>
  );
}
