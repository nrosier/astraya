/**
 * The one place a file-picker control is written (#514, #587).
 *
 * The browser's own file-chooser dialog cannot be restyled — only how it is opened can be —
 * so the native `<input type="file">` stays, hidden, and a styled `<button>` triggers it via
 * `ref.click()`. The button, not the hidden input, is the control assistive technology sees:
 * its own visible text is the accessible name, so there is no label/`for` pairing to wire up
 * the way `Field`'s other wrapped controls need.
 */
/**
 * @module ui/primitives/FileInput
 * @purpose Shared single-file picker: a hidden native <input type="file"> opened by an accessible button.
 * @conventions The visible button carries the accessible name; the hidden input is never itself the thing a reader interacts with, so this does not go through the `Field` label/for anatomy other primitives use.
 * @exports FileInput
 */
import { useRef } from 'react';

export interface FileInputProps {
  readonly buttonLabel: string;
  readonly accept?: string | undefined;
  readonly onChange: (file: File | undefined) => void;
  readonly disabled?: boolean | undefined;
  /** Why the button is disabled, read out instead of the bare "disabled" a screen reader otherwise announces alone. */
  readonly disabledReason?: string | undefined;
  /** The page's main action for its group (#966): the primary button style instead of the quiet default. */
  readonly primary?: boolean | undefined;
}

export function FileInput({
  buttonLabel,
  accept,
  onChange,
  disabled,
  disabledReason,
  primary = false,
}: FileInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Lets the same file be chosen again after an error without a no-op change event.
          event.target.value = '';
          onChange(file);
        }}
      />
      <button
        type="button"
        className={primary ? 'primitive-button-primary' : undefined}
        disabled={disabled}
        aria-label={
          disabled === true && disabledReason !== undefined ? `${buttonLabel} — ${disabledReason}` : undefined
        }
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </button>
    </>
  );
}
