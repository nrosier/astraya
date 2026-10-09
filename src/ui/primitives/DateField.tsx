/**
 * A date input through the shared `Field` anatomy (#506/#508).
 *
 * Uses the browser's own `<input type="date">` deliberately — `docs/UI-UX_GUIDELINES.md` §6
 * is explicit that a native picker is the right fallback "when those requirements cannot be
 * met" (a mature accessible calendar primitive, verified across arrow keys, zoom, screen
 * readers and both languages, is a bigger build than this phase's scope). It already satisfies
 * every hard requirement that matters here: direct keyboard typing works without opening the
 * picker, the stored `value` is always `YYYY-MM-DD` regardless of the browser's localized
 * display, and `color-scheme` (bound in `app.css`, #508) keeps its chrome matching the app's
 * explicit theme.
 */
/**
 * @module ui/primitives/DateField
 * @purpose Shared date input: label/help/error via Field, native <input type="date"> for ISO storage independent of localized display.
 * @conventions Deliberately the native picker, not a hand-built calendar grid — see module doc comment for why; reports the raw YYYY-MM-DD string (or '' when cleared), same as the input's own `.value`.
 * @exports DateField
 */
import { Field, useFieldIds } from './Field.js';

export interface DateFieldProps {
  readonly label: string;
  /** `YYYY-MM-DD`, or '' when empty. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly min?: string | undefined;
  readonly max?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export function DateField({
  label,
  value,
  onChange,
  help,
  error,
  optional,
  min,
  max,
  disabled,
}: DateFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  return (
    <Field label={label} ids={ids} help={help} error={error} optional={optional}>
      <input
        id={ids.inputId}
        type="date"
        value={value}
        min={min}
        max={max}
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
