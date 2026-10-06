/**
 * The control for the symbol class (#419). It writes the device preference (`symbol-setting.ts`), so
 * every wheel, grid, diagram and table follows at once.
 */
import { useId } from 'react';
import { isSymbolClass, SYMBOL_CLASSES } from '../chart/symbol-class.js';
import { GLYPH_WEIGHTS, isGlyphWeight } from '../chart/glyph-weight.js';
import { isVariantKey, VARIANT_BODIES, VARIANT_KEYS } from '../chart/glyph-variants.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useMessages } from './messages.js';
import { useSymbolClass } from './symbol-setting.js';
import { symbolSettingMessages } from './SymbolSetting.messages.js';

export function SymbolSetting({ onChanged }: { readonly onChanged?: () => void } = {}): React.JSX.Element {
  const t = useMessages(symbolSettingMessages);
  const [choice, setChoice] = useSymbolClass();
  const [variants, setVariant, setWeight] = useGlyphVariants();
  const id = useId();

  const handleChange = (callback: () => void): void => {
    callback();
    onChanged?.();
  };

  // Reactive description based on symbol class choice
  const getSymbolDescription = (): string | undefined => {
    switch (choice) {
      case 'unicode':
        return t.unicodeDescription;
      case 'drawn':
        return t.drawnDescription;
      case 'text':
        return t.textDescription;
      default:
        return undefined;
    }
  };

  return (
    <>
      <p className="rulership-setting">
        <label htmlFor={`${id}-select`}>{t.label} </label>
        <select
          id={`${id}-select`}
          value={choice}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const value = event.target.value;
            if (isSymbolClass(value)) {
              handleChange(() => {
                setChoice(value);
              });
            }
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
      {getSymbolDescription() && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.9em',
            lineHeight: '1.5',
            color: '#333',
            padding: '0.75rem',
            backgroundColor: '#fff',
            borderLeft: '3px solid #007acc',
            marginBottom: '1rem',
          }}
        >
          {getSymbolDescription()}
        </p>
      )}
      <p className="rulership-setting">
        <label htmlFor={`${id}-weight`}>{t.weightLabel} </label>
        <select
          id={`${id}-weight`}
          disabled={choice !== 'drawn'}
          value={variants.weight}
          aria-describedby={`${id}-weight-hint`}
          onChange={(event) => {
            const value = event.target.value;
            if (isGlyphWeight(value)) {
              handleChange(() => {
                setWeight(value);
              });
            }
          }}
        >
          {GLYPH_WEIGHTS.map((option) => (
            <option key={option} value={option}>
              {t.weightOptions[option]}
            </option>
          ))}
        </select>
        <span id={`${id}-weight-hint`} className="hint rulership-setting-hint">
          {' '}
          {choice === 'drawn' ? t.weightHint : t.weightAvailableWhen}
        </span>
      </p>
      {choice === 'drawn' && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.9em',
            lineHeight: '1.5',
            color: '#333',
            padding: '0.75rem',
            backgroundColor: '#fff',
            borderLeft: '3px solid #007acc',
            marginBottom: '1rem',
          }}
        >
          {variants.weight === 'fine' && t.fineWeightDescription}
          {variants.weight === 'regular' && t.regularWeightDescription}
          {variants.weight === 'bold' && t.boldWeightDescription}
        </p>
      )}
      <fieldset className="field-group">
        <legend>{t.variantsLegend}</legend>
        <p className="hint">{t.variantsHint}</p>
        {VARIANT_BODIES.map((body) => (
          <label key={body}>
            {t.variantLabels[body]}{' '}
            <select
              aria-label={t.variantLabels[body]}
              // The line weight and the Pluto forms are only visible in the drawn class; Uranus also has a Unicode form.
              disabled={body === 'uranus' ? choice === 'text' : choice !== 'drawn'}
              value={variants[body]}
              onChange={(event) => {
                const value = event.target.value;
                if (isVariantKey(body, value)) {
                  handleChange(() => {
                    setVariant(body, value);
                  });
                }
              }}
            >
              {VARIANT_KEYS[body].map((key) => (
                <option key={key} value={key}>
                  {(t.variantOptions[body] as Record<string, string>)[key]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    </>
  );
}
