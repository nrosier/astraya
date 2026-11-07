/**
 * The shared button primitive (#506/#508): one anatomy for primary, quiet (secondary), and
 * danger (destructive) actions, in `standard` and `compact` sizes. Existing `.quiet`/`.danger`
 * classes already carry most of this app's button styling in `app.css`; this component is the
 * single place a feature picks the right variant instead of hand-assembling class names, so a
 * primary action stops being indistinguishable from a secondary one by accident (#506 finding:
 * the PDF builder's "Build PDF" used `.quiet`, the same class as every minor action around it).
 */
/**
 * @module ui/primitives/Button
 * @purpose Shared button primitive: primary/quiet/danger/plain variants, standard/compact sizes, busy-label support.
 * @conventions A thin wrapper over a real <button>; variant/size map onto existing app.css classes (.quiet, .danger) plus a new .primitive-button-primary for the previously-missing emphasized default, and `plain` (no class) for the bare button look. An optional `className` is appended after the variant/size classes for a control's own placement or identity class (#1161). `ref` is an ordinary prop (React 19), so a caller can focus or measure the button. Compact returns to standard touch sizing on coarse-pointer/touch layouts via CSS, not JS.
 * @exports Button
 */
export type ButtonVariant = 'primary' | 'quiet' | 'danger' | 'plain';
export type ButtonSize = 'standard' | 'compact';

export interface ButtonProps extends React.ComponentPropsWithRef<'button'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Shown instead of children while a submitted action is in flight, e.g. "Building PDF…". */
  readonly busyLabel?: string;
  readonly busy?: boolean;
}

/** `plain` carries no class: the bare button look, which is what the unclassed buttons that moved here had. */
const VARIANT_CLASS: Readonly<Record<ButtonVariant, string | undefined>> = {
  primary: 'primitive-button-primary',
  quiet: 'quiet',
  danger: 'danger',
  plain: undefined,
};

export function Button({
  variant = 'quiet',
  size = 'standard',
  busy = false,
  busyLabel,
  disabled,
  children,
  type = 'button',
  className: extraClass,
  ...rest
}: ButtonProps): React.JSX.Element {
  const sizeClass = size === 'compact' ? 'primitive-button-compact' : undefined;
  const className =
    [VARIANT_CLASS[variant], sizeClass, extraClass].filter((value) => value !== undefined && value !== '').join(' ') ||
    undefined;
  return (
    <button
      type={type}
      className={className}
      disabled={(disabled ?? false) || busy}
      aria-busy={busy ? true : undefined}
      {...rest}
    >
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}
