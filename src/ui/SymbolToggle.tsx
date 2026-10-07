/**
 * A one-press switch in the header between the drawn symbols and text-only ones (#419). Someone who needs text
 * on a new device should not have to find a chart's Extended settings first. It sets the same device preference
 * as the Symbols setting there: pressed means text only; pressing again goes back to the drawn symbols.
 */
/**
 * @module SymbolToggle
 * @purpose Header one-press toggle between drawn glyph symbols and text-only symbols.
 * @conventions Writes the same device preference as SymbolSetting.tsx via symbol-setting.ts; uses SymbolToggle.messages.ts for en/nl text via useMessages().
 * @exports SymbolToggle
 */
import { useMessages } from './messages.js';
import { useSymbolClass } from './symbol-setting.js';
import { symbolToggleMessages } from './SymbolToggle.messages.js';

export function SymbolToggle(): React.JSX.Element {
  const t = useMessages(symbolToggleMessages);
  const [symbolClass, setSymbolClass] = useSymbolClass();
  const textOnly = symbolClass === 'text';
  return (
    <button
      type="button"
      className="corner-pill symbol-toggle"
      aria-pressed={textOnly}
      aria-label={t.label}
      title={textOnly ? t.hintOn : t.hintOff}
      onClick={() => {
        setSymbolClass(textOnly ? 'drawn' : 'text');
      }}
    >
      {textOnly ? 'Abc' : '☉'}
    </button>
  );
}
