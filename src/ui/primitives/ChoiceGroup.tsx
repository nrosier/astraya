/**
 * A segmented control for "two to four short, exclusive choices" (#506/#508,
 * `docs/UI-UX_GUIDELINES.md` §6) — implemented as a labelled radio group, not a custom
 * tab-like widget, so selected/hover/focus/disabled states come from `Radio` for free.
 */
/**
 * @module ui/primitives/ChoiceGroup
 * @purpose Segmented control for a short, exclusive choice set: a labelled native radiogroup over Radio.
 * @conventions role="radiogroup" with an aria-label naming the decision, not a role="tablist" — this is a value choice, not navigation between panels.
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
}

export function ChoiceGroup({ label, value, options, onChange, disabled }: ChoiceGroupProps): React.JSX.Element {
  const name = useId();
  return (
    <div className="primitive-choice-group" role="radiogroup" aria-label={label}>
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
}
