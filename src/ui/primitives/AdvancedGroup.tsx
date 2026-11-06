/**
 * The advanced option group (#916, #856): fine-tuning controls that stay out of the way until asked for. A named
 * wrapper over `Disclosure` that cannot start open, so every screen's advanced options read the same: collapsed.
 */
/**
 * @module ui/primitives/AdvancedGroup
 * @purpose Shared collapsed-by-default group for fine-tuning options (object filters, per-section sub-settings).
 * @conventions Starts closed (no `defaultOpen` prop); a caller wanting it to reset on a new subject remounts it with a `key`. A caller that remembers the state (the Extended settings drawer, #856) passes `open` and `onOpenChange` and owns it. Delegates the trigger, aria-expanded/aria-controls and panel to `Disclosure`. Wording comes from the caller's locale files.
 * @exports AdvancedGroup, AdvancedGroupProps
 */
import { Disclosure } from './Disclosure.js';

export interface AdvancedGroupProps {
  readonly title: string;
  /** What is inside, e.g. "3 sections ticked". */
  readonly summary?: string | undefined;
  readonly showLabel: string;
  readonly hideLabel: string;
  /** Controlled mode: the caller remembers whether the group is open. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly children: React.ReactNode;
}

export function AdvancedGroup({
  title,
  summary,
  showLabel,
  hideLabel,
  open,
  onOpenChange,
  children,
}: AdvancedGroupProps): React.JSX.Element {
  return (
    <Disclosure
      title={title}
      summary={summary}
      showLabel={showLabel}
      hideLabel={hideLabel}
      defaultOpen={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      {children}
    </Disclosure>
  );
}
