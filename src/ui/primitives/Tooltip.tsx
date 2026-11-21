/**
 * The shared term-disclosure primitive (#456, #506/#508): hover, click/tap, and keyboard focus
 * all reveal the *same real visible popup* — the gap #456 found in the native `title`
 * attribute every tooltip in the app relied on until now (confirmed live: hovering a column
 * header for 2+ seconds never rendered a visible box, only the cursor's help icon). Generalized
 * from `SyncBadge.tsx`'s click-toggled `aria-expanded`/`aria-controls` popover shape rather than
 * inventing a third one-off implementation (`docs/ui/UI-UX_GUIDELINES.md`'s design-authority rule).
 *
 * Behavior:
 * - Hover opens after a short delay and stays open while the pointer is over the popover
 *   itself, not just the trigger (WCAG 1.4.13 "hoverable") — leaving both, or pressing Escape,
 *   closes it.
 * - Click/tap pins it open (`sticky`), overriding hover-dismiss, until an outside
 *   click/tap, Escape, or the trigger is clicked again.
 * - Keyboard focus on the trigger reveals the same popup (unlike native `title`, which only a
 *   mouse-hover user ever sees); blurring the trigger (when not pinned) closes it.
 *
 * Does not yet participate in `use-exclusive-open.ts` (#417) — that hook is keyed for one
 * parent's own row of menus, not an app-wide singleton across every independent Tooltip
 * instance on a page. Each instance already closes itself on outside click/Escape/blur, so two
 * simultaneously open tooltips is a visual nuisance, not a correctness bug; wiring true
 * one-at-a-time exclusivity across instances is left for the Phase 6 glossary rollout (#456),
 * once there are enough real call sites on one page to judge whether it is worth the shared
 * state it would need.
 */
/**
 * @module ui/primitives/Tooltip
 * @purpose Shared hover/click/keyboard-focus term-disclosure popup, replacing every native-title-based tooltip in the app (#456).
 * @conventions Generalizes SyncBadge.tsx's click-toggled aria-expanded/aria-controls popover; trigger is a real <button> (never a bare <span title>), sibling of the popup rather than nested inside another interactive element; dismissible (Escape/outside click), hoverable (survives pointer moving onto the popup), and persistent (no auto-timeout).
 * @exports Tooltip
 */
import { useRef } from 'react';
import { useTooltipState } from './use-tooltip-state';

export interface TooltipProps {
  /** The visible trigger text, e.g. a column label or an inline glossary term. */
  readonly children: React.ReactNode;
  /** The definition shown in the popup. */
  readonly text: string;
  /** Extra class names on the wrapper span, added after `primitive-tooltip` (e.g. `glossary-term`). */
  readonly className?: string | undefined;
  /** The trigger's accessible name when its visible content (a "?") does not name itself, e.g. "About Ruler". */
  readonly label?: string | undefined;
}

export function Tooltip({ children, text, className, label }: TooltipProps): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Escape returns focus to the trigger, which must not count as a focus that opens the popup again.
  const restoringFocus = useRef(false);
  const { open, popoverId, wrapperRef, openNow, closeUnlessSticky, toggleSticky, onPointerEnter, onPointerLeave } =
    useTooltipState({
      onEscape: () => {
        restoringFocus.current = true;
        triggerRef.current?.focus();
        restoringFocus.current = false;
      },
    });

  return (
    <span
      ref={wrapperRef}
      className={['primitive-tooltip', className].filter((value) => value !== undefined).join(' ')}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        className="primitive-tooltip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={open ? popoverId : undefined}
        onClick={toggleSticky}
        onFocus={() => {
          if (!restoringFocus.current) openNow();
        }}
        onBlur={closeUnlessSticky}
      >
        {children}
      </button>
      {open && (
        <span id={popoverId} role="tooltip" className="primitive-tooltip-popup" onPointerEnter={onPointerEnter}>
          {text}
        </span>
      )}
    </span>
  );
}
