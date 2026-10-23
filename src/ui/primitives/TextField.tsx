/**
 * A plain single-line text input through the shared `Field` anatomy (#506/#508).
 */
/**
 * @module ui/primitives/TextField
 * @purpose Shared single-line text input: label/help/error via Field, standard/compact sizing, aria-invalid wiring.
 * @conventions Thin wrapper over a real <input type="text">; the field owns no validation logic — it only renders whatever error string the caller already computed (same split domain/person-form.ts already uses).
 * @exports TextField
 */
import { Field, useFieldIds } from './Field.js';
import type { ButtonSize } from './Button.js';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly unit?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly size?: ButtonSize;
  readonly disabled?: boolean | undefined;
  readonly autoComplete?: string | undefined;
  /** The on-screen keyboard to offer, e.g. `numeric` for a year typed as text. */
  /** For a caller that moves focus into the field, e.g. when a panel opens. */
  readonly inputRef?: React.Ref<HTMLInputElement> | undefined;
  readonly inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'search' | 'tel' | 'url' | undefined;
  /** Extra attributes for the input itself, e.g. the combobox ARIA and key handler of an autocomplete (#784). */
  readonly inputProps?:
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'value' | 'onChange'> | undefined;
}

export function TextField({
  label,
  value,
  onChange,
  help,
  error,
  unit,
  optional,
  placeholder,
  size = 'standard',
  disabled,
  autoComplete,
  inputMode,
  inputRef,
  inputProps,
}: TextFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  return (
    <Field label={label} ids={ids} help={help} error={error} unit={unit} optional={optional}>
      <input
        {...inputProps}
        id={ids.inputId}
        ref={inputRef}
        type="text"
        className={size === 'compact' ? 'primitive-control-compact' : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}
