/**
 * The open/pinned state behind the shared term-disclosure popup (#456, #1867). Extracted from
 * `Tooltip.tsx` so a second trigger shape (a non-interactive word inside a radio's label, #1867)
 * shares the exact same hover delay, pinning and dismissal rules instead of a third one-off copy.
 */
/**
 * @module ui/primitives/use-tooltip-state
 * @purpose Shared open/sticky state, hover timer, popover id and outside-pointerdown/Escape dismissal for term-disclosure popups.
 * @conventions Dismissal is scoped to the caller's wrapper ref: a pointerdown inside it never closes the popup. An optional Escape callback runs after the popup closes (Tooltip uses it to return focus to its trigger).
 * @exports HOVER_OPEN_DELAY_MS, TooltipState, UseTooltipStateOptions, useTooltipState
 */
import { useEffect, useId, useRef, useState } from 'react';

export const HOVER_OPEN_DELAY_MS = 400;

export interface UseTooltipStateOptions {
  /** Runs after Escape has closed the popup. */
  readonly onEscape?: (() => void) | undefined;
}

export interface TooltipState {
  readonly open: boolean;
  readonly sticky: boolean;
  readonly popoverId: string;
  readonly wrapperRef: React.RefObject<HTMLSpanElement | null>;
  readonly openNow: () => void;
  readonly closeUnlessSticky: () => void;
  readonly closeFully: () => void;
  /** Click/tap: pin open, or unpin and close when already pinned. */
  readonly toggleSticky: () => void;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function useTooltipState({ onEscape }: UseTooltipStateOptions = {}): TooltipState {
  const [open, setOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();
  // Latest callback in a ref, so the dismissal listeners stay keyed on `open` alone (as before the extraction).
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

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
  const toggleSticky = (): void => {
    setSticky((was) => !was);
    setOpen((was) => !was || !sticky);
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
      onEscapeRef.current?.();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return {
    open,
    sticky,
    popoverId,
    wrapperRef,
    openNow,
    closeUnlessSticky,
    closeFully,
    toggleSticky,
    onPointerEnter,
    onPointerLeave,
  };
}
