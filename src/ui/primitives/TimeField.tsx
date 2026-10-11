/**
 * The shared time-of-day field (#506/#508): a real `type="time"` input in the `Field` wrapper, to the second when
 * asked, with room for one more description (why it is switched off) beside its own help and error.
 */
/**
 * @module ui/primitives/TimeField
 * @purpose Time-of-day input with the standard label/help/error wiring and an optional extra aria-describedby id.
 * @conventions Value is `HH:MM` or `HH:MM:SS` text, or '' when empty; stored as typed, never reinterpreted by locale.
 * @exports TimeField, TimeFieldProps
 */
import { Field, useFieldIds } from './Field.js';

export interface TimeFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly optional?: boolean | undefined;
  /** Seconds between steps; `1` shows and accepts seconds. */
  readonly step?: number | undefined;
  readonly disabled?: boolean | undefined;
  /** Another element's id that also describes this field, e.g. the reason it is disabled. */
  readonly extraDescribedBy?: string | undefined;
}

export function TimeField({
  label,
  value,
  onChange,
  help,
  error,
  optional,
  step,
  disabled,
  extraDescribedBy,
}: TimeFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined, extraDescribedBy);
  return (
    <Field label={label} ids={ids} help={help} error={error} optional={optional}>
      <input
        id={ids.inputId}
        type="time"
        step={step}
        value={value}
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
