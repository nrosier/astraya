/**
 * The shared disclosure primitive (#506/#508, used by #511): optional reference content that opens in
 * place, per `docs/ui/UI-UX_GUIDELINES.md` §6's "Disclosure pattern" and the WAI-ARIA disclosure pattern.
 * The whole trigger row is one button with a title, optional secondary text saying what will open,
 * explicit Show/Hide wording, and a trailing chevron hidden from assistive technology.
 */
/**
 * @module ui/primitives/Disclosure
 * @purpose Shared expandable region: a full-width 44px trigger row (title, summary, explicit action text, chevron) controlling a panel.
 * @conventions A real button with aria-expanded/aria-controls (not a bare browser triangle); opening never moves focus; the panel's content is only mounted while open; uncontrolled, starting closed unless `defaultOpen` — a caller wanting it to reset on a new subject remounts it with a `key`. Wording comes from the caller's locale files.
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
  readonly children: React.ReactNode;
}

export function Disclosure({
  title,
  summary,
  showLabel,
  hideLabel,
  defaultOpen = false,
  children,
}: DisclosureProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={open ? 'primitive-disclosure open' : 'primitive-disclosure'}>
      <button
        type="button"
        className="primitive-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
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
