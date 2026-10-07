/**
 * The control for the planetary-rulers choice (#426). It writes the device preference
 * (`rulership-setting.ts`), so every screen that shows a ruler, a dignity or a dispositor follows at
 * once; it is shown wherever the choice matters (the chart's extended settings, the transit filter,
 * profections), always the same control with the same explanation.
 */
/**
 * @module RulershipSetting
 * @purpose Device-preference control for choosing modern/traditional/both planetary rulers, shared across every screen that shows a ruler, dignity, or dispositor.
 * @conventions Writes the shared device preference via rulership-setting.ts; uses RulershipSetting.messages.ts for en/nl text via useMessages().
 * @exports RulershipSetting
 */
import { useId } from 'react';
import { RULERSHIP_CHOICES, isRulershipChoice } from '../astrology/rulership.js';
import { useMessages } from './messages.js';
import { useRulershipChoice } from './rulership-setting.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';

export function RulershipSetting(): React.JSX.Element {
  const t = useMessages(rulershipSettingMessages);
  const [choice, setChoice] = useRulershipChoice();
  const id = useId();
  return (
    <p className="rulership-setting">
      <label htmlFor={`${id}-select`}>{t.label} </label>
      <select
        id={`${id}-select`}
        value={choice}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          if (isRulershipChoice(event.target.value)) setChoice(event.target.value);
        }}
      >
        {RULERSHIP_CHOICES.map((option) => (
          <option key={option} value={option}>
            {t.options[option]}
          </option>
        ))}
      </select>
      <span id={`${id}-hint`} className="hint rulership-setting-hint">
        {' '}
        {t.hint}
      </span>
    </p>
  );
}
