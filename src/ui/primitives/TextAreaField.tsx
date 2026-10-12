/**
 * The shared multi-line text field (#506/#508): a `<textarea>` in the `Field` wrapper.
 */
/**
 * @module ui/primitives/TextAreaField
 * @purpose Multi-line text input with the standard label/help/error wiring; the label can be visually hidden when a heading already introduces it.
 * @conventions Resizes vertically only; reports the raw typed text.
 * @exports TextAreaField, TextAreaFieldProps
 */
import { Field, useFieldIds } from './Field.js';

export interface TextAreaFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly rows?: number | undefined;
  readonly hideLabel?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export function TextAreaField({
  label,
  value,
  onChange,
  help,
  error,
  optional,
  rows = 3,
  hideLabel,
  placeholder,
  disabled,
}: TextAreaFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  return (
    <Field label={label} ids={ids} help={help} error={error} optional={optional} hideLabel={hideLabel}>
      <textarea
        id={ids.inputId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}
