/**
 * The shared term-disclosure primitive (#456, #506/#508): hover, click/tap, and keyboard focus
 * all reveal the *same real visible popup* — the gap #456 found in the native `title`
 * attribute every tooltip in the app relied on until now (confirmed live: hovering a column
 * header for 2+ seconds never rendered a visible box, only the cursor's help icon). Generalized
 * from `SyncBadge.tsx`'s click-toggled `aria-expanded`/`aria-controls` popover shape rather than
 * inventing a third one-off implementation (`docs/UI-UX_GUIDELINES.md`'s design-authority rule).
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
import { useEffect, useId, useRef, useState } from 'react';

const HOVER_OPEN_DELAY_MS = 400;

export interface TooltipProps {
  /** The visible trigger text, e.g. a column label or an inline glossary term. */
  readonly children: React.ReactNode;
  /** The definition shown in the popup. */
  readonly text: string;
  /** Rendered trigger element: 'button' for a standalone trigger (e.g. a column header's label), 'span' when the caller already renders its own interactive element and only wants this as a sibling disclosure (e.g. a dotted-underline term inside a sentence) — still a real button under the hood. */
  readonly className?: string | undefined;
}

export function Tooltip({ children, text, className }: TooltipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const openNow = (): void => {
    setOpen(true);
  };
  const closeUnlessSticky = (): void => {
    if (!sticky) setOpen(false);
  };
  const closeFully = (): void => {
    setSticky(false);
    setOpen(false);
  };

  const onPointerEnter = (): void => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(openNow, HOVER_OPEN_DELAY_MS);
  };
  const onPointerLeave = (): void => {
    clearTimeout(hoverTimer.current);
    closeUnlessSticky();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (wrapperRef.current !== null && event.target instanceof Node && wrapperRef.current.contains(event.target)) {
        return;
      }
      closeFully();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      closeFully();
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => {
          setSticky((was) => !was);
          setOpen((was) => !was || !sticky);
        }}
        onFocus={openNow}
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
