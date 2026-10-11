/**
 * The control for the symbol class (#419). It writes the device preference (`symbol-setting.ts`), so
 * every wheel, grid, diagram and table follows at once.
 */
/**
 * @module SymbolSetting
 * @purpose Device-preference controls for symbol class (drawn/Unicode/text), glyph line weight, and Uranus/Pluto glyph variants.
 * @conventions Writes shared device preferences via symbol-setting.ts and glyph-variant-setting.ts; uses SymbolSetting.messages.ts for en/nl text via useMessages(). Built on the shared `Select` primitive (#506/#508) so label/control/help anatomy matches every other field in the app, rather than a bespoke inline layout.
 * @exports SymbolSetting
 */
import { isSymbolClass, SYMBOL_CLASSES } from '../chart/symbol-class.js';
import { GLYPH_WEIGHTS, isGlyphWeight } from '../chart/glyph-weight.js';
import { isVariantKey, VARIANT_BODIES, VARIANT_KEYS } from '../chart/glyph-variants.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';
import { useSymbolClass } from './symbol-setting.js';
import { symbolSettingMessages } from './SymbolSetting.messages.js';

export function SymbolSetting({ onChanged }: { readonly onChanged?: () => void } = {}): React.JSX.Element {
  const t = useMessages(symbolSettingMessages);
  const [choice, setChoice] = useSymbolClass();
  const [variants, setVariant, setWeight] = useGlyphVariants();

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
  const symbolDescription = getSymbolDescription();

  return (
    <>
      <Select
        label={t.label}
        value={choice}
        help={t.hint}
        options={SYMBOL_CLASSES.map((option) => ({ value: option, label: t.options[option] }))}
        onChange={(value) => {
          if (isSymbolClass(value)) {
            handleChange(() => {
              setChoice(value);
            });
          }
        }}
      />
      {symbolDescription !== undefined && <p className="symbol-setting-description">{symbolDescription}</p>}

      <Select
        label={t.weightLabel}
        value={variants.weight}
        disabled={choice !== 'drawn'}
        help={choice === 'drawn' ? t.weightHint : t.weightAvailableWhen}
        options={GLYPH_WEIGHTS.map((option) => ({ value: option, label: t.weightOptions[option] }))}
        onChange={(value) => {
          if (isGlyphWeight(value)) {
            handleChange(() => {
              setWeight(value);
            });
          }
        }}
      />
      {choice === 'drawn' && (
        <p className="symbol-setting-description">
          {variants.weight === 'fine' && t.fineWeightDescription}
          {variants.weight === 'regular' && t.regularWeightDescription}
          {variants.weight === 'bold' && t.boldWeightDescription}
        </p>
      )}

      <fieldset className="field-group">
        <legend>{t.variantsLegend}</legend>
        <p className="hint">{t.variantsHint}</p>
        {VARIANT_BODIES.map((body) => (
          <Select
            key={body}
            label={t.variantLabels[body]}
            value={variants[body]}
            // The line weight and the Pluto forms are only visible in the drawn class; Uranus also has a Unicode form.
            disabled={body === 'uranus' ? choice === 'text' : choice !== 'drawn'}
            options={VARIANT_KEYS[body].map((key) => ({
              value: key,
              label: (t.variantOptions[body] as Record<string, string>)[key] ?? key,
            }))}
            onChange={(value) => {
              if (isVariantKey(body, value)) {
                handleChange(() => {
                  setVariant(body, value);
                });
              }
            }}
          />
        ))}
      </fieldset>
    </>
  );
}
