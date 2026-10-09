/**
 * A numeric input with a standard stepper, through the shared `Field` anatomy (#506/#508).
 *
 * Keeps a real `<input type="number">` for keyboard/screen-reader semantics, suppresses the
 * browser's own spinner (inconsistent across browsers), and renders the shared trailing
 * Decrease/Increase buttons instead — same dimensions, icon, and boundary-disabled behavior
 * everywhere this is used, per `docs/UI-UX_GUIDELINES.md` §6. Preserves an in-progress typed
 * value (empty, a bare minus sign, a trailing decimal separator) rather than coercing on every
 * keystroke; a caller validates on blur/submit the same way `domain/person-form.ts` already does
 * for its own numeric fields.
 */
/**
 * @module ui/primitives/NumberField
 * @purpose Shared numeric input: label/help/error via Field, a standard Decrease/Increase stepper, Arrow Up/Down support, preserved in-progress typing.
 * @conventions Reports the raw typed string to the caller (not a coerced number) so a caller can allow an empty value, a minus sign, or a decimal point mid-entry and validate at blur/submit, same split domain/person-form.ts already uses for its own fields; `step` alone only sets the native keyboard-arrow increment — the visible Decrease/Increase buttons render only when `decreaseLabel`/`increaseLabel` are also given, so a field that wants arrow-key granularity without a visible stepper (e.g. a fine-grained age-in-years field) can have one without the other, per the guidelines ("omit the buttons rather than showing a different spinner style").
 * @exports NumberField
 */
import { Field, useFieldIds } from './Field.js';
import type { ButtonSize } from './Button.js';

export interface NumberFieldProps {
  readonly label: string;
  /** The raw typed value — may be '', '-', or a trailing '.', not just a parsed number. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly unit?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Omit to render a plain number input with no stepper, per the guidelines. */
  readonly step?: number | undefined;
  readonly size?: ButtonSize;
  readonly disabled?: boolean | undefined;
  /** Accessible names for the stepper buttons, e.g. "Decrease age" / "Increase age". Required when `step` is given. */
  readonly decreaseLabel?: string | undefined;
  readonly increaseLabel?: string | undefined;
  /** For a draft/canonical split (e.g. reconciling a typed value to a computed one once the user leaves the field). */
  readonly onBlur?: (() => void) | undefined;
}

function stepValue(current: string, delta: number, min: number | undefined, max: number | undefined): string {
  const parsed = Number(current);
  const base = Number.isFinite(parsed) ? parsed : 0;
  let next = base + delta;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return String(next);
}

export function NumberField({
  label,
  value,
  onChange,
  help,
  error,
  unit,
  optional,
  min,
  max,
  step,
  size = 'standard',
  disabled,
  decreaseLabel,
  increaseLabel,
  onBlur,
}: NumberFieldProps): React.JSX.Element {
  const ids = useFieldIds(help !== undefined, error !== undefined);
  const atMin = min !== undefined && Number(value) <= min;
  const atMax = max !== undefined && Number(value) >= max;
  return (
    <Field label={label} ids={ids} help={help} error={error} unit={unit} optional={optional}>
      <div className="primitive-number-field">
        <input
          id={ids.inputId}
          type="number"
          inputMode="decimal"
          className={['primitive-number-input', size === 'compact' ? 'primitive-control-compact' : undefined]
            .filter((v) => v !== undefined)
            .join(' ')}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={ids.describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onBlur}
        />
        {step !== undefined && decreaseLabel !== undefined && increaseLabel !== undefined && (
          <div className="primitive-number-stepper">
            <button
              type="button"
              className="quiet primitive-number-step"
              aria-label={decreaseLabel}
              disabled={(disabled ?? false) || atMin}
              onClick={() => {
                onChange(stepValue(value, -step, min, max));
              }}
            >
              −
            </button>
            <button
              type="button"
              className="quiet primitive-number-step"
              aria-label={increaseLabel}
              disabled={(disabled ?? false) || atMax}
              onClick={() => {
                onChange(stepValue(value, step, min, max));
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
    </Field>
  );
}
