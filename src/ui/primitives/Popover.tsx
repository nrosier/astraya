/**
 * A small floating panel opened from a trigger button, anchored in the flow beside the trigger (#1770).
 * It shares its open and close rules with the other dropdown buttons through `use-exclusive-open`
 * (#417), so Escape, outside click and Tab-out behave the same here as in the Export menu.
 */
/**
 * @module ui/primitives/Popover
 * @purpose Shared trigger-and-panel popover (#1770): a button with aria-expanded and aria-controls opens a floating panel, mounted only while open; Escape returns focus to the trigger, and outside click or Tab-out closes it.
 * @conventions Built on use-exclusive-open for the close rules; positioned relatively in flow, not fixed; the panel's content is only mounted while open; the caller supplies the label, the trigger content and the panel content and owns their wording.
 * @exports Popover, PopoverProps
 */
import { useId } from 'react';
import { useExclusiveOpen } from '../use-exclusive-open.js';

export interface PopoverProps {
  /** The accessible name of the trigger button. */
  readonly label: string;
  /** What the trigger shows, e.g. an icon or a short word. */
  readonly trigger: React.ReactNode;
  readonly children: React.ReactNode;
}

const KEY = 'popover';

export function Popover({ label, trigger, children }: PopoverProps): React.JSX.Element {
  const id = useId();
  const menu = useExclusiveOpen<typeof KEY>(id);
  const open = menu.open === KEY;
  const panelId = `${id}-panel`;
  return (
    <div
      className="primitive-popover"
      ref={menu.groupRef(KEY)}
      onBlur={(event) => {
        menu.onGroupBlur(KEY, event);
      }}
    >
      <button
        type="button"
        className="primitive-popover-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        ref={menu.buttonRef(KEY)}
        onClick={() => {
          menu.toggle(KEY);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div id={panelId} className="primitive-popover-panel">
          {children}
        </div>
      )}
    </div>
  );
}
