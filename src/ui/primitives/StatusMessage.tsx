/**
 * @module primitives/StatusMessage
 * @purpose The one message block for a result's state (#513, `docs/ui/UI-UX_GUIDELINES.md` §7): loading, updating, empty, zero, partial, offline, success and error, each with the right live-region semantics.
 * @conventions Errors are `role="alert"` (announced at once); every other kind is `role="status"` (polite). Appearance comes from the existing `.warning`/`.status` rules, keyed by `data-kind`, so a screen picks a kind, never a class.
 * @exports StatusMessage, STATUS_KINDS, StatusKind
 */
import type { ReactNode } from 'react';

/** Every state a result-bearing screen can be in besides "showing its result". */
export const STATUS_KINDS = ['loading', 'updating', 'empty', 'zero', 'partial', 'offline', 'success', 'error'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/** Kinds drawn as a pulsing "working" line; the rest are plain text, errors and partial results as a warning panel. */
const WORKING: ReadonlySet<StatusKind> = new Set(['loading', 'updating']);
const PANEL: ReadonlySet<StatusKind> = new Set(['error', 'partial', 'offline']);

export function StatusMessage({
  kind,
  children,
  id,
  className,
}: {
  readonly kind: StatusKind;
  readonly children: ReactNode;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
}): React.JSX.Element {
  const look = PANEL.has(kind) ? 'warning' : WORKING.has(kind) ? 'status' : 'hint';
  return (
    <p
      id={id}
      className={className === undefined ? look : `${look} ${className}`}
      data-kind={kind}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={WORKING.has(kind) ? true : undefined}
    >
      {children}
    </p>
  );
}
