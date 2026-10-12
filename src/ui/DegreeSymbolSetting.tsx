/**
 * The control for whether degree-symbol (Sabian symbol, #405/#484) paragraphs show in the Report
 * at all (#527). It writes the device preference (`degree-symbol-setting.ts`), so `ReportView.tsx`
 * follows at once. Same plain label + explanation + control shape as `RulershipSetting.tsx` —
 * named and explained in its own right, rather than a bare checkbox with no context next to it.
 */
/**
 * @module DegreeSymbolSetting
 * @purpose Device-preference control for showing/hiding degree-symbol (Sabian symbol) notes in the Report, with its own explanation of what a Sabian symbol is.
 * @conventions Writes the shared device preference via degree-symbol-setting.ts; uses DegreeSymbolSetting.messages.ts for en/nl text via useMessages(). Mirrors RulershipSetting.tsx's label+explanation+control shape, but a single boolean (Checkbox) rather than an exclusive multi-choice (OptionCards) — per docs/UI-UX_GUIDELINES.md's decision table, a lone checkbox is the right primitive here, not a radiogroup.
 * @exports DegreeSymbolSetting
 */
import { useShowDegreeSymbol } from './degree-symbol-setting.js';
import { degreeSymbolSettingMessages } from './DegreeSymbolSetting.messages.js';
import { useMessages } from './messages.js';
import { Checkbox } from './primitives/Checkbox.js';

export function DegreeSymbolSetting(): React.JSX.Element {
  const t = useMessages(degreeSymbolSettingMessages);
  const [show, setShow] = useShowDegreeSymbol();

  return (
    <div className="degree-symbol-setting">
      <p className="degree-symbol-setting-label">{t.label}</p>
      <p className="hint">{t.explanation}</p>
      <Checkbox label={t.toggle} checked={show} onChange={setShow} />
    </div>
  );
}
