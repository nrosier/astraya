/**
 * The shared checkbox primitive (#506/#508): one size, stroke, selected colour, focus ring,
 * label gap, disabled treatment, and minimum row target, shared with `Radio` so the two read
 * as one visual family with different semantics (a checkmark vs. a dot), per
 * `docs/ui/UI-UX_GUIDELINES.md` §6.
 */
/**
 * @module ui/primitives/Checkbox
 * @purpose Shared checkbox control: a real <input type="checkbox"> plus its label, sharing anatomy with Radio.
 * @conventions A bare labelled checkbox, not wrapped in Field — checkboxes are usually one of several in a fieldset with its own <legend>, not a single labelled value; a caller wanting help/error text around a lone checkbox composes Field itself.
 * @exports Checkbox
 */
export interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  /** The label stays for assistive technology but is not drawn, e.g. a row-select box in a table. */
  readonly hideLabel?: boolean | undefined;
  /** One line of explanation under the label. */
  readonly description?: string | undefined;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  id,
  hideLabel,
  description,
}: CheckboxProps): React.JSX.Element {
  return (
    <label className="primitive-choice">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />{' '}
      <span className={hideLabel === true ? 'sr-only' : undefined}>{label}</span>
      {description !== undefined && (
        <>
          <br />
          <span className="hint">{description}</span>
        </>
      )}
    </label>
  );
}
