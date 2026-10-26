/**
 * The shared staged dialog (#506/#508, #512): a modal card whose contents are a draft. Nothing in it changes the
 * page until the caller's own Apply commits the whole draft at once; Cancel, Escape, the close button, a press on
 * the backdrop and leaving the page all discard it and give focus back to the control that opened it.
 */
/**
 * @module ui/primitives/StagedDialog
 * @purpose A native `<dialog>` modal (focus trap, Escape, backdrop) for editing a draft, with one discard path and a sticky footer.
 * @conventions Controlled: the caller owns `open` and the draft, and closes the dialog from `onDiscard` (and from its own Apply); the dialog only reports that the reader wants out. Reuses the `.settings-card` look. `dialog.showModal` is missing in some test DOMs, hence the attribute fallback. The body scrolls inside the card and the footer stays reachable, so a short viewport never loses Apply. `placement="right"` sets `data-placement` and styles the same card as a right-anchored drawer (flat border, `--shadow-popover`).
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
  /** Feature-specific card class; defaults to the established settings-card hook. */
  readonly dialogClassName?: string;
  /** `center` (default) is the modal card; `right` anchors it to the right edge as a drawer (#826). */
  readonly placement?: 'center' | 'right';
}

export function StagedDialog({
  open,
  heading,
  closeLabel,
  onDiscard,
  returnFocusTo,
  children,
  footer,
  dialogClassName = 'settings-card',
  placement = 'center',
}: StagedDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else dialog.setAttribute('open', '');
    } else if (wasOpen.current) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      returnFocusTo.current?.focus();
    }
    wasOpen.current = open;
  }, [open, returnFocusTo]);

  // Leaving the page closes the card, the same rule the menus follow.
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('hashchange', onDiscard);
    return () => {
      window.removeEventListener('hashchange', onDiscard);
    };
  }, [open, onDiscard]);

  return (
    <dialog
      ref={dialogRef}
      className={`${dialogClassName} primitive-staged-dialog`}
      aria-labelledby={headingId}
      {...(placement === 'right' ? { 'data-placement': 'right' } : {})}
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
          <div className="settings-card-body">{children}</div>
          <div className="settings-card-footer">{footer}</div>
        </>
      )}
    </dialog>
  );
}
