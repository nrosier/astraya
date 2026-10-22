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
import { useState } from 'react';
import { Field, useFieldIds } from './Field.js';

export interface PasswordFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: 'current-password' | 'new-password';
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Opt-in (#765): adds a show/hide toggle inside the field. Off by default, so other password fields are unchanged. */
  readonly revealable?: boolean | undefined;
  /** Accessible name of the toggle while the password is hidden. Pass a translated string; never exactly the field label. */
  readonly showLabel?: string | undefined;
  /** Accessible name of the toggle while the password is shown. */
  readonly hideLabel?: string | undefined;
}

/** Decorative eye icons for the toggle: the button's aria-label carries the meaning. */
function EyeIcon({ off }: { off: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  help,
  error,
  disabled,
  revealable = false,
  showLabel = 'Show password',
  hideLabel = 'Hide password',
}: PasswordFieldProps): React.JSX.Element {
  const [shown, setShown] = useState(false);
  const ids = useFieldIds(help !== undefined, error !== undefined);
  const input = (
    <input
      id={ids.inputId}
      type={revealable && shown ? 'text' : 'password'}
      value={value}
      disabled={disabled}
      autoComplete={autoComplete}
      aria-invalid={error !== undefined || undefined}
      aria-describedby={ids.describedBy}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
  return (
    <Field label={label} ids={ids} help={help} error={error}>
      {revealable ? (
        <div className="signin-password">
          {input}
          <button
            type="button"
            className="signin-password-toggle"
            aria-label={shown ? hideLabel : showLabel}
            aria-controls={ids.inputId}
            disabled={disabled}
            onClick={() => {
              setShown((value) => !value);
            }}
          >
            <EyeIcon off={shown} />
          </button>
        </div>
      ) : (
        input
      )}
    </Field>
  );
}
