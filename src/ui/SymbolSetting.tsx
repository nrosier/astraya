/**
 * The control for the symbol class (#419). It writes the device preference (`symbol-setting.ts`), so
 * every wheel, grid, diagram and table follows at once.
 */
import { useId } from 'react';
import { isSymbolClass, SYMBOL_CLASSES } from '../chart/symbol-class.js';
import { useMessages } from './messages.js';
import { useSymbolClass } from './symbol-setting.js';
import { symbolSettingMessages } from './SymbolSetting.messages.js';

export function SymbolSetting(): React.JSX.Element {
  const t = useMessages(symbolSettingMessages);
  const [choice, setChoice] = useSymbolClass();
  const id = useId();
  return (
    <p className="rulership-setting">
      <label htmlFor={`${id}-select`}>{t.label} </label>
      <select
        id={`${id}-select`}
        value={choice}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          if (isSymbolClass(event.target.value)) setChoice(event.target.value);
        }}
      >
        {SYMBOL_CLASSES.map((option) => (
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
