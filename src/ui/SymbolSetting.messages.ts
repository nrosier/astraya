/**
 * Message catalogue for `SymbolSetting.tsx` (#419).
 */
const en = {
  label: 'Symbols',
  options: {
    drawn: 'Drawn symbols',
    unicode: 'Unicode characters',
    text: 'Text only (SUN, MOO, …)',
  },
  weightLabel: 'Line weight',
  weightOptions: { fine: 'Fine', regular: 'Regular', bold: 'Bold' },
  weightHint:
    'How heavy the lines of the drawn planet and aspect symbols are. The zodiac signs are solid shapes and do not change.',
  variantsLegend: 'Forms of a symbol',
  variantLabels: { uranus: 'Uranus', pluto: 'Pluto' },
  variantOptions: {
    uranus: { h: 'H with a ball (♅)', astronomical: 'Circle, dot and arrow (⛢)' },
    pluto: { orb: 'Orb over crescent and cross', monogram: 'PL monogram (♇)' },
  },
  variantsHint:
    'Uranus and Pluto are drawn in two ways. The text characters ♅ ♇ and the text codes do not change with this; the Unicode class can only tell the two Uranus forms apart.',
  hint: 'How planets, signs and aspects are written on the wheel, the grids and in the tables, on this device. Unicode follows your system font, so it looks different on every device; text only suits a reader who finds symbols hard to tell apart.',
};

const nl: typeof en = {
  label: 'Symbolen',
  options: {
    drawn: 'Getekende symbolen',
    unicode: 'Unicode-tekens',
    text: 'Alleen tekst (SUN, MOO, …)',
  },
  weightLabel: 'Lijndikte',
  weightOptions: { fine: 'Fijn', regular: 'Normaal', bold: 'Dik' },
  weightHint:
    'Hoe dik de lijnen van de getekende planeet- en aspectsymbolen zijn. De dierenriemtekens zijn massieve vormen en veranderen niet.',
  variantsLegend: 'Vormen van een symbool',
  variantLabels: { uranus: 'Uranus', pluto: 'Pluto' },
  variantOptions: {
    uranus: { h: 'H met een bal (♅)', astronomical: 'Cirkel, stip en pijl (⛢)' },
    pluto: { orb: 'Bol boven maansikkel en kruis', monogram: 'PL-monogram (♇)' },
  },
  variantsHint:
    'Uranus en Pluto worden op twee manieren getekend. De tekens ♅ ♇ en de lettercodes veranderen hier niet door; de Unicode-klasse kan alleen de twee vormen van Uranus onderscheiden.',
  hint: 'Hoe planeten, tekens en aspecten op het wiel, in de rasters en in de tabellen worden geschreven, op dit apparaat. Unicode volgt het lettertype van je systeem en ziet er dus op elk apparaat anders uit; alleen tekst is voor wie symbolen moeilijk uit elkaar houdt.',
};

export const symbolSettingMessages = { en, nl };
