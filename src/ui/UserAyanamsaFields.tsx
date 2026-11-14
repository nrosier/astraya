/**
 * @module ui/UserAyanamsaFields
 * @purpose The reference date and the degrees and minutes of a user-defined ayanamsa (#1407; owner decision 2026-11-14, "Date + degrees"), shown under the ayanamsa Select in Extended settings.
 * @conventions Thin: the split and join are `user-ayanamsa.ts`. Typed text is kept locally, and `onChange` fires only with a complete, valid definition, so the settings never hold a half-typed value; an invalid entry shows an error and leaves the last valid one in force.
 * @exports UserAyanamsaFields
 */
import { useState } from 'react';
import type { UserAyanamsa } from '../ephemeris/types.js';
import { useMessages } from './messages.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { joinDegrees, splitDegrees } from './user-ayanamsa.js';
import { userAyanamsaFieldsMessages } from './UserAyanamsaFields.messages.js';

export function UserAyanamsaFields({
  value,
  onChange,
}: {
  readonly value: UserAyanamsa;
  readonly onChange: (value: UserAyanamsa) => void;
}): React.JSX.Element {
  const t = useMessages(userAyanamsaFieldsMessages);
  const split = splitDegrees(value.degrees);
  const [date, setDate] = useState(value.referenceDate);
  const [degreesText, setDegreesText] = useState(String(split.degrees));
  const [minutesText, setMinutesText] = useState(String(split.minutes));
  const degrees = joinDegrees(degreesText, minutesText);

  const update = (nextDate: string, nextDegrees: string, nextMinutes: string): void => {
    const joined = joinDegrees(nextDegrees, nextMinutes);
    if (nextDate !== '' && joined !== undefined) onChange({ referenceDate: nextDate, degrees: joined });
  };

  return (
    <fieldset className="field-group user-ayanamsa-fields">
      <legend>{t.legend}</legend>
      <DateField
        label={t.referenceDate}
        value={date}
        help={t.referenceDateHelp}
        error={date === '' ? t.invalidDate : undefined}
        onChange={(next) => {
          setDate(next);
          update(next, degreesText, minutesText);
        }}
      />
      <div className="user-ayanamsa-value">
        <NumberField
          label={t.degrees}
          value={degreesText}
          help={t.valueHelp}
          unit="°"
          min={0}
          max={359}
          step="any"
          size="compact"
          onChange={(next) => {
            setDegreesText(next);
            update(date, next, minutesText);
          }}
        />
        <NumberField
          label={t.minutes}
          value={minutesText}
          error={degrees === undefined ? t.invalidValue : undefined}
          unit="′"
          min={0}
          max={59.99}
          step="any"
          size="compact"
          onChange={(next) => {
            setMinutesText(next);
            update(date, degreesText, next);
          }}
        />
      </div>
    </fieldset>
  );
}
