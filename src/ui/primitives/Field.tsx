/**
 * The shared field anatomy (#506/#508): label, optional/required marker, unit, help text, and
 * error occupy defined slots so every text/date/number/select control looks and behaves the
 * same regardless of which screen it is on (`docs/UI-UX_GUIDELINES.md` §6 "Shared control
 * anatomy"). `TextField`/`DateField`/`NumberField`/`Select` wrap their native control in this;
 * a feature should not assemble a label/input/error trio by hand.
 */
/**
 * @module ui/primitives/Field
 * @purpose Shared label/help/error/unit slot layout wrapping one form control, used by every other field primitive.
 * @conventions Renders the error paragraph only when there is one (matches the existing PersonForm.tsx convention — no app-wide layout-shift change bundled into this primitive); associates label/help/error via htmlFor/aria-describedby so a child control need only accept the ids this component hands it.
 * @exports Field, useFieldIds
 */
import { useId } from 'react';

export interface FieldIds {
  readonly inputId: string;
  readonly helpId: string | undefined;
  readonly errorId: string | undefined;
  readonly describedBy: string | undefined;
}

/** One stable id per slot, and the combined aria-describedby a control should pass through. */
export function useFieldIds(hasHelp: boolean, hasError: boolean): FieldIds {
  const base = useId();
  const helpId = hasHelp ? `${base}-help` : undefined;
  const errorId = hasError ? `${base}-error` : undefined;
  const describedBy = [helpId, errorId].filter((id): id is string => id !== undefined).join(' ') || undefined;
  return { inputId: base, helpId, errorId, describedBy };
}

export interface FieldProps {
  readonly label: string;
  readonly ids: FieldIds;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly unit?: string | undefined;
  readonly optional?: boolean | undefined;
  readonly children: React.ReactNode;
  readonly className?: string | undefined;
}

export function Field({
  label,
  ids,
  help,
  error,
  unit,
  optional = false,
  children,
  className,
}: FieldProps): React.JSX.Element {
  return (
    <div className={['primitive-field', className].filter((value) => value !== undefined).join(' ')}>
      <label htmlFor={ids.inputId}>
        {label}
        {optional && <span className="primitive-field-optional"> (optional)</span>}
        {unit !== undefined && <span className="primitive-field-unit"> ({unit})</span>}
      </label>
      {children}
      {help !== undefined && (
        <p className="hint primitive-field-help" id={ids.helpId}>
          {help}
        </p>
      )}
      {error !== undefined && (
        <p className="field-error" id={ids.errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
