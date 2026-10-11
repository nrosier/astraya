/**
 * A single-choice dropdown through the shared `Field` anatomy (#506/#508), for the "five to
 * twelve concise choices" row of `docs/UI-UX_GUIDELINES.md` §6's decision matrix.
 *
 * A styled native `<select>`, not a custom popover: this app has no runtime positioning
 * library (by deliberate dependency policy — see `docs/DEPENDENCIES.md`), and the native
 * element already gives correct keyboard, screen-reader, and mobile behavior for free. The
 * guidelines' "use a proven accessible popover primitive when the popup must match Astraya"
 * is for later, if a specific screen genuinely needs it — not a default every Select pays for.
 */
/**
 * @module ui/primitives/Select
 * @purpose Shared single-choice dropdown: label/help/error via Field, a styled native <select>.
 * @conventions Deliberately a styled native element rather than a custom popover/combobox — this app has no runtime positioning library by dependency policy, and native already satisfies the decision matrix's requirements for a 5-12 item choice list.
 * @exports Select, SelectOption
 */
import { Field, useFieldIds } from './Field.js';
import type { ButtonSize } from './Button.js';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

export interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly size?: ButtonSize;
  readonly disabled?: boolean | undefined;
}

export function Select({
  label,
  value,
  options,
  onChange,
  help,
  error,
  optional,
  size = 'standard',
  disabled,
}: SelectProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  return (
    <Field label={label} ids={ids} help={help} error={error} optional={optional}>
      <select
        id={ids.inputId}
        className={size === 'compact' ? 'primitive-control-compact' : undefined}
        value={value}
        disabled={disabled}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
