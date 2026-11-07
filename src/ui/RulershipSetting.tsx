/**
 * The control for the planetary-rulers choice (#426). It is controlled (#806): the caller says whose choice it
 * edits (a person's, a draft in the settings card, or the device default) and what happens when it changes, so
 * the same control, with the same explanation, is shown wherever the choice matters.
 */
/**
 * @module RulershipSetting
 * @purpose Controlled control for choosing modern/traditional/both planetary rulers, shared by every screen that edits a ruler choice (a person's, a settings draft, or the device default).
 * @conventions Controlled (`value`/`onChange`, like `DegreeSymbolSetting`), never reads or writes storage itself; `onChange` may return a promise, and a rejection is shown beside the control rather than swallowed; uses RulershipSetting.messages.ts for en/nl text via useMessages(). Three short exclusive choices, so it is the shared segmented `ChoiceGroup` on every screen that uses it (#1236, owner decision 2026-11-06), with the chosen option's consequence and the full explanation as hints beneath.
 * @exports RulershipSetting
 */
import { useState } from 'react';
import { RULERSHIP_CHOICES, isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import { GlossaryText } from './GlossaryText.js';
import { useMessages } from './messages.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';

export function RulershipSetting({
  value,
  onChange,
}: {
  readonly value: RulershipChoice;
  readonly onChange: (choice: RulershipChoice) => void | Promise<void>;
}): React.JSX.Element {
  const t = useMessages(rulershipSettingMessages);
  const [error, setError] = useState<string | undefined>(undefined);

  const choose = (choice: RulershipChoice): void => {
    setError(undefined);
    const outcome = onChange(choice);
    if (outcome !== undefined) {
      outcome.catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    }
  };

  return (
    <div className="rulership-setting">
      <p className="rulership-setting-label">{t.label}</p>
      <ChoiceGroup
        label={t.label}
        value={value}
        segmented
        options={RULERSHIP_CHOICES.map((option) => ({ value: option, label: t.titles[option] }))}
        onChange={(next) => {
          if (isRulershipChoice(next)) choose(next);
        }}
      />
      <p className="hint rulership-setting-consequence">{t.consequences[value]}</p>
      <p className="hint">
        <GlossaryText text={t.hint} />
      </p>
      {error !== undefined && <StatusMessage kind="error">{t.saveFailed(error)}</StatusMessage>}
    </div>
  );
}
