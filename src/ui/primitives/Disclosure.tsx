/**
 * The shared disclosure primitive (#506/#508, used by #511): optional reference content that opens in
 * place, per `docs/ui/UI-UX_GUIDELINES.md` §6's "Disclosure pattern" and the WAI-ARIA disclosure pattern.
 * The whole trigger row is one button with a title, optional secondary text saying what will open,
 * explicit Show/Hide wording, and a trailing chevron hidden from assistive technology.
 */
/**
 * @module ui/primitives/Disclosure
 * @purpose Shared expandable region: a full-width 44px trigger row (title, summary, explicit action text, chevron) controlling a panel.
 * @conventions A real button with aria-expanded/aria-controls (not a bare browser triangle); opening never moves focus; the panel's content is only mounted while open; uncontrolled by default, starting closed unless `defaultOpen` — a caller wanting it to reset on a new subject remounts it with a `key`. A caller that remembers the state passes `open` and `onOpenChange` (#856) and owns it. Wording comes from the caller's locale files.
 * @exports Disclosure, DisclosureProps
 */
import { useId, useState } from 'react';

export interface DisclosureProps {
  readonly title: string;
  /** What will open, e.g. "5 more meanings". */
  readonly summary?: string | undefined;
  /** Explicit action wording for the closed and open states, e.g. "Show all meanings" / "Hide meanings". */
  readonly showLabel: string;
  readonly hideLabel: string;
  readonly defaultOpen?: boolean | undefined;
  /** Controlled mode (#856): when given, the caller owns the open state and `onOpenChange` is told of each toggle. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly children: React.ReactNode;
}

export function Disclosure({
  title,
  summary,
  showLabel,
  hideLabel,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
}: DisclosureProps): React.JSX.Element {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const panelId = useId();
  return (
    <div className={open ? 'primitive-disclosure open' : 'primitive-disclosure'}>
      <button
        type="button"
        className="primitive-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (controlledOpen === undefined) setOwnOpen(!open);
          onOpenChange?.(!open);
        }}
      >
        <span className="primitive-disclosure-text">
          <span className="primitive-disclosure-title">{title}</span>
          {summary !== undefined && <span className="primitive-disclosure-summary">{summary}</span>}
        </span>
        <span className="primitive-disclosure-action">{open ? hideLabel : showLabel}</span>
        <span className="primitive-disclosure-chevron" aria-hidden="true" />
      </button>
      <div id={panelId} className="primitive-disclosure-panel" hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
