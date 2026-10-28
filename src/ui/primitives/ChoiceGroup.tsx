/**
 * A segmented control for "two to four short, exclusive choices" (#506/#508,
 * `docs/ui/UI-UX_GUIDELINES.md` §6) — implemented as a labelled radio group, not a custom
 * tab-like widget, so selected/hover/focus/disabled states come from `Radio` for free. With `segmented` it is drawn
 * as one horizontal strip of joined segments (#824); the radios stay native, so the arrow keys move and select
 * within the group exactly as they do for any radio set.
 */
/**
 * @module ui/primitives/ChoiceGroup
 * @purpose Segmented control for a short, exclusive choice set: a labelled native radiogroup over Radio.
 * @conventions role="radiogroup" with an aria-label naming the decision, not a role="tablist" — this is a value choice, not navigation between panels. `segmented` only changes the drawing (class `primitive-choice-group-segmented`); `showLabel` also draws the group's name above it, aria-hidden because the radiogroup already carries it.
 * @exports ChoiceGroup, ChoiceGroupOption
 */
import { useId } from 'react';
import { Radio } from './Radio.js';

export interface ChoiceGroupOption {
  readonly value: string;
  readonly label: string;
}

export interface ChoiceGroupProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly ChoiceGroupOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean | undefined;
  /** Draw the options as one joined horizontal strip of segments (#824). */
  readonly segmented?: boolean | undefined;
  /** Also draw `label` as visible text above the group (#824). The radiogroup keeps its own accessible name. */
  readonly showLabel?: boolean | undefined;
}

export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  disabled,
  segmented,
  showLabel,
}: ChoiceGroupProps): React.JSX.Element {
  const name = useId();
  const group = (
    <div
      className={
        segmented === true ? 'primitive-choice-group primitive-choice-group-segmented' : 'primitive-choice-group'
      }
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          label={option.label}
          checked={value === option.value}
          disabled={disabled}
          onChange={() => {
            onChange(option.value);
          }}
        />
      ))}
    </div>
  );
  if (showLabel !== true) return group;
  return (
    <div className="primitive-choice-field">
      <span className="primitive-field-label" aria-hidden="true">
        {label}
      </span>
      {group}
    </div>
  );
}
