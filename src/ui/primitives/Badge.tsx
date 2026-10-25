/**
 * @module ui/primitives/Badge
 * @purpose A small static label chip for a fact about the thing beside it (e.g. a placement's sign and house), as opposed to a control.
 * @conventions Plain text only and not interactive: nothing to focus, no live region. Styled by `.primitive-badge` in `app.css`.
 * @exports Badge
 */
import type { ReactNode } from 'react';

export function Badge({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <span className="primitive-badge">{children}</span>;
}
