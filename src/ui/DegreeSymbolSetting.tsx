/**
 * The control for whether degree-symbol (Sabian symbol, #405/#484) paragraphs show in the Report
 * at all (#527). It writes the device preference (`degree-symbol-setting.ts`), so `ReportView.tsx`
 * follows at once. Same plain label + explanation + control shape as `RulershipSetting.tsx` —
 * named and explained in its own right, rather than a bare checkbox with no context next to it.
 */
/**
 * @module DegreeSymbolSetting
 * @purpose Controlled control for showing/hiding degree-symbol (Sabian symbol) notes in the Report, with its own explanation of what a Sabian symbol is.
 * @conventions Controlled: the parent (ReportView.tsx) owns the value and passes `show` + `onChange`; this component never reads or writes storage. Uses DegreeSymbolSetting.messages.ts for en/nl text via useMessages(). Mirrors RulershipSetting.tsx's label+explanation+control shape, but a single boolean (Checkbox) rather than an exclusive multi-choice (OptionCards) — per docs/ui/UI-UX_GUIDELINES.md's decision table, a lone checkbox is the right primitive here, not a radiogroup.
 * @exports DegreeSymbolSettingProps, DegreeSymbolSetting
 */
import { degreeSymbolSettingMessages } from './DegreeSymbolSetting.messages.js';
import { useMessages } from './messages.js';
import { Checkbox } from './primitives/Checkbox.js';

export interface DegreeSymbolSettingProps {
  readonly show: boolean;
  readonly onChange: (next: boolean) => void;
}

export function DegreeSymbolSetting({ show, onChange }: DegreeSymbolSettingProps): React.JSX.Element {
  const t = useMessages(degreeSymbolSettingMessages);

  return (
    <div className="degree-symbol-setting">
      <p className="degree-symbol-setting-label">{t.label}</p>
      <p className="hint">{t.explanation}</p>
      <Checkbox label={t.toggle} checked={show} onChange={onChange} />
    </div>
  );
}
