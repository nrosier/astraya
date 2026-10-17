/**
 * @module ui/primitives/Notice
 * @purpose A persistent block of explanatory text that the reader must not miss, as opposed to a result's state (`StatusMessage`): a caveat on a method, the consequence of an action.
 * @conventions `warning` is the panel with a bar and an indent, so it survives greyscale; `info` is plain muted text. Not a live region, because it is there from the start and does not report a change; an error that appears after an action is a `StatusMessage` with `kind="error"`.
 * @exports Notice, NoticeTone
 */
import type { ReactNode } from 'react';

export type NoticeTone = 'warning' | 'info';

export function Notice({
  tone = 'warning',
  children,
  className,
}: {
  readonly tone?: NoticeTone;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): React.JSX.Element {
  const look = tone === 'warning' ? 'warning' : 'hint';
  return (
    <p className={className === undefined ? look : `${look} ${className}`} data-tone={tone}>
      {children}
    </p>
  );
}
