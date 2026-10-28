/**
 * The shared staged dialog (#506/#508, #512): a modal card whose contents are a draft. Nothing in it changes the
 * page until the caller's own Apply commits the whole draft at once; Cancel, Escape, the close button, a press on
 * the backdrop and leaving the page all discard it and give focus back to the control that opened it.
 */
/**
 * @module ui/primitives/StagedDialog
 * @purpose A native `<dialog>` modal (focus trap, Escape, backdrop) for editing a draft, with one discard path and a sticky footer.
 * @conventions Controlled: the caller owns `open` and the draft, and closes the dialog from `onDiscard` (and from its own Apply); the dialog only reports that the reader wants out. Reuses the `.settings-card` look. `dialog.showModal` is missing in some test DOMs, hence the attribute fallback. The body scrolls inside the card and the footer stays reachable, so a short viewport never loses Apply. `placement="right"` sets `data-placement` and styles the same card as a right-anchored drawer (flat border, `--shadow-popover`, `--drawer-max-width`). `modal={false}` opens it with `show()` (no backdrop, page stays interactive; Escape handled by a document listener). An optional `subheader` row (e.g. category tabs, #824) stays pinned under the heading.
 * @exports StagedDialog, StagedDialogProps
 */
import { useEffect, useId, useRef } from 'react';

export interface StagedDialogProps {
  readonly open: boolean;
  readonly heading: string;
  /** Accessible name of the × button, e.g. "Close without applying". */
  readonly closeLabel: string;
  /** The reader wants out without applying: Escape, ×, backdrop, or leaving the page. */
  readonly onDiscard: () => void;
  /** Focus returns here when the dialog closes. */
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
  readonly children: React.ReactNode;
  /** The Apply / Cancel row. */
  readonly footer: React.ReactNode;
  /** Optional row pinned under the heading, e.g. a drawer's category tabs (#824). Stays put while the body scrolls. */
  readonly subheader?: React.ReactNode;
  /** Feature-specific card class; defaults to the established settings-card hook. */
  readonly dialogClassName?: string;
  /** `center` (default) is the modal card; `right` anchors it to the right edge as a drawer (#826). */
  readonly placement?: 'center' | 'right';
  /**
   * `true` (default) opens it with `showModal()`: focus trap, inert page, dimmed backdrop. `false` opens it with
   * `show()` so the page beside it stays live (#817's Overlays drawer); Escape is then handled here.
   */
  readonly modal?: boolean;
}

export function StagedDialog({
  open,
  heading,
  closeLabel,
  onDiscard,
  returnFocusTo,
  children,
  footer,
  subheader,
  dialogClassName = 'settings-card',
  placement = 'center',
  modal = true,
}: StagedDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (modal && typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else if (!modal && typeof dialog.show === 'function') {
        if (!dialog.open) dialog.show();
      } else dialog.setAttribute('open', '');
    } else if (wasOpen.current) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      returnFocusTo.current?.focus();
    }
    wasOpen.current = open;
  }, [open, returnFocusTo, modal]);

  // Leaving the page closes the card, the same rule the menus follow.
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('hashchange', onDiscard);
    return () => {
      window.removeEventListener('hashchange', onDiscard);
    };
  }, [open, onDiscard]);

  // A non-modal dialog gets no Escape from the browser, so it listens itself, wherever focus is.
  useEffect(() => {
    if (!open || modal) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDiscard();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, modal, onDiscard]);

  return (
    <dialog
      ref={dialogRef}
      className={`${dialogClassName} primitive-staged-dialog`}
      aria-labelledby={headingId}
      {...(placement === 'right' ? { 'data-placement': 'right' } : {})}
      {...(modal ? {} : { 'data-modal': 'false' })}
      onCancel={(event) => {
        // Escape: the browser would close it silently; closing it through the caller also drops the draft.
        event.preventDefault();
        onDiscard();
      }}
      onClick={(event) => {
        // A press on the backdrop is a press on the dialog element itself.
        if (event.target === dialogRef.current) onDiscard();
      }}
    >
      {open && (
        <>
          <div className="settings-card-header">
            <h2 id={headingId}>{heading}</h2>
            <button type="button" className="quiet" aria-label={closeLabel} onClick={onDiscard}>
              ×
            </button>
          </div>
          {subheader !== undefined && <div className="settings-card-subheader">{subheader}</div>}
          <div className="settings-card-body">{children}</div>
          <div className="settings-card-footer">{footer}</div>
        </>
      )}
    </dialog>
  );
}
