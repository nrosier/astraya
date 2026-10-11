/**
 * The shared password field (#506/#508): a `type="password"` input in the `Field` wrapper, with the
 * `autocomplete` hint a password manager needs.
 */
/**
 * @module ui/primitives/PasswordField
 * @purpose Masked text input with the standard label/help/error wiring and a required autocomplete purpose.
 * @conventions `autoComplete` is required, not optional: `current-password` for signing in, `new-password` for choosing one, so a password manager fills and offers to save the right thing.
 * @exports PasswordField, PasswordFieldProps
 */
import { Field, useFieldIds } from './Field.js';

export interface PasswordFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: 'current-password' | 'new-password';
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  help,
  error,
  disabled,
}: PasswordFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  return (
    <Field label={label} ids={ids} help={help} error={error}>
      <input
        id={ids.inputId}
        type="password"
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}
