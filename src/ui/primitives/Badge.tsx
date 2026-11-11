/**
 * @module ui/primitives/Badge
 * @purpose A small static label chip for a fact about the thing beside it (e.g. a placement's sign and house), as opposed to a control.
 * @conventions Plain text only and not interactive: nothing to focus, no live region. Styled by `.primitive-badge` in `app.css`. `tone` is optional (omitted is the neutral chip) and is never the only carrier of meaning: the label text always says it (WCAG 1.4.1). Tones come from the state tokens (warning, success, danger) or the accent; astrology colours are never a badge tone.
 * @exports Badge, BadgeTone
 */
import type { ReactNode } from 'react';

export type BadgeTone = 'warning' | 'success' | 'danger' | 'accent';

export function Badge({
  tone,
  children,
}: {
  readonly tone?: BadgeTone | undefined;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <span className="primitive-badge" data-tone={tone}>
      {children}
    </span>
  );
}
