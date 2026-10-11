/**
 * The control for the planetary-rulers choice (#426). It writes the device preference
 * (`rulership-setting.ts`), so every screen that shows a ruler, a dignity or a dispositor follows at
 * once; it is shown wherever the choice matters (the chart's extended settings, the transit filter,
 * profections), always the same control with the same explanation.
 */
/**
 * @module RulershipSetting
 * @purpose Device-preference control for choosing modern/traditional/both planetary rulers, shared across every screen that shows a ruler, dignity, or dispositor.
 * @conventions Writes the shared device preference via rulership-setting.ts; uses RulershipSetting.messages.ts for en/nl text via useMessages(). Three exclusive choices that each need a consequence, so it is the shared `OptionCards` primitive (#513, `docs/UI-UX_GUIDELINES.md` §6) with the full explanation as a hint beneath.
 * @exports RulershipSetting
 */
import { RULERSHIP_CHOICES, isRulershipChoice } from '../astrology/rulership.js';
import { useMessages } from './messages.js';
import { OptionCards } from './primitives/OptionCards.js';
import { useRulershipChoice } from './rulership-setting.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';

export function RulershipSetting(): React.JSX.Element {
  const t = useMessages(rulershipSettingMessages);
  const [choice, setChoice] = useRulershipChoice();

  return (
    <div className="rulership-setting">
      <p className="rulership-setting-label">{t.label}</p>
      <OptionCards
        label={t.label}
        value={choice}
        options={RULERSHIP_CHOICES.map((option) => ({
          value: option,
          title: t.titles[option],
          consequence: t.consequences[option],
        }))}
        onChange={(value) => {
          if (isRulershipChoice(value)) setChoice(value);
        }}
      />
      <p className="hint">{t.hint}</p>
    </div>
  );
}
