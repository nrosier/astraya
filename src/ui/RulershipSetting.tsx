/**
 * The control for the planetary-rulers choice (#426). It is controlled (#806): the caller says whose choice it
 * edits (a person's, a draft in the settings card, or the device default) and what happens when it changes, so
 * the same control, with the same explanation, is shown wherever the choice matters.
 */
/**
 * @module RulershipSetting
 * @purpose Controlled control for choosing modern/traditional/both planetary rulers, shared by every screen that edits a ruler choice (a person's, a settings draft, or the device default).
 * @conventions Controlled (`value`/`onChange`, like `DegreeSymbolSetting`), never reads or writes storage itself; `onChange` may return a promise, and a rejection is shown beside the control rather than swallowed; uses RulershipSetting.messages.ts for en/nl text via useMessages(). Three exclusive choices that each need a consequence, so it is the shared `OptionCards` primitive (#513, `docs/ui/UI-UX_GUIDELINES.md` §6) with the full explanation as a hint beneath.
 * @exports RulershipSetting
 */
import { useState } from 'react';
import { RULERSHIP_CHOICES, isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import { GlossaryText } from './GlossaryText.js';
import { useMessages } from './messages.js';
import { OptionCards } from './primitives/OptionCards.js';
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
      <OptionCards
        label={t.label}
        value={value}
        options={RULERSHIP_CHOICES.map((option) => ({
          value: option,
          title: t.titles[option],
          consequence: t.consequences[option],
        }))}
        onChange={(next) => {
          if (isRulershipChoice(next)) choose(next);
        }}
      />
      <p className="hint">
        <GlossaryText text={t.hint} />
      </p>
      {error !== undefined && <StatusMessage kind="error">{t.saveFailed(error)}</StatusMessage>}
    </div>
  );
}
