/**
 * The control for the planetary-rulers choice (#426). It writes the device preference
 * (`rulership-setting.ts`), so every screen that shows a ruler, a dignity or a dispositor follows at
 * once; it is shown wherever the choice matters (the chart's extended settings, the transit filter,
 * profections), always the same control with the same explanation.
 */
/**
 * @module RulershipSetting
 * @purpose Device-preference control for choosing modern/traditional/both planetary rulers, shared across every screen that shows a ruler, dignity, or dispositor.
 * @conventions Writes the shared device preference via rulership-setting.ts; uses RulershipSetting.messages.ts for en/nl text via useMessages(). Built on the shared `Select` primitive (#506/#508) so label/control/help anatomy matches every other field in the app, rather than a bespoke inline layout.
 * @exports RulershipSetting
 */
import { RULERSHIP_CHOICES, isRulershipChoice } from '../astrology/rulership.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';
import { useRulershipChoice } from './rulership-setting.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';

export function RulershipSetting(): React.JSX.Element {
  const t = useMessages(rulershipSettingMessages);
  const [choice, setChoice] = useRulershipChoice();

  return (
    <Select
      label={t.label}
      value={choice}
      help={t.hint}
      options={RULERSHIP_CHOICES.map((option) => ({ value: option, label: t.options[option] }))}
      onChange={(value) => {
        if (isRulershipChoice(value)) setChoice(value);
      }}
    />
  );
}
