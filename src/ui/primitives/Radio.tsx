/**
 * The shared radio primitive (#506/#508) — see `Checkbox`'s doc comment for the shared-anatomy
 * rationale. Always used in a `name`-grouped set; `ChoiceGroup` builds the common "two to four
 * exclusive choices" segmented-control case on top of this.
 */
/**
 * @module ui/primitives/Radio
 * @purpose Shared radio control: a real <input type="radio"> plus its label, sharing anatomy with Checkbox.
 * @conventions Always rendered inside a caller-owned `role="radiogroup"`/`name` group — this primitive is one option, not the group.
 * @exports Radio
 */
export interface RadioProps {
  readonly label: string;
  readonly name: string;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly disabled?: boolean | undefined;
}

export function Radio({ label, name, checked, onChange, disabled }: RadioProps): React.JSX.Element {
  return (
    <label className="primitive-choice">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} /> {label}
    </label>
  );
}
