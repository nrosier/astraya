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
  unicodeDescription:
    'Display symbols as Unicode text characters (♅, ♇, ☿, etc.). This uses the font\'s built-in glyphs and is fast and lightweight, but appearance depends on your font.',
  drawnDescription:
    'Display symbols as hand-rolled SVG paths. This gives consistent appearance across all devices and allows fine-tuning of line weight and form variants (e.g., Uranus and Pluto have alternate shapes).',
  textDescription:
    'Display symbols as letter codes (♅ becomes \'U\', ♇ becomes \'P\', etc.). This is compact and always legible, but loses visual distinctiveness.',
  weightLabel: 'Line weight',
  weightOptions: { fine: 'Fine', regular: 'Regular', bold: 'Bold' },
  weightAvailableWhen: '(Only available when Symbols is set to "Drawn")',
  weightHint:
    'How heavy the lines of the drawn planet and aspect symbols are. The zodiac signs are solid shapes and do not change.',
  fineWeightDescription:
    'Fine lines: delicate, minimal visual weight. Good for dense charts or small screens.',
  regularWeightDescription:
    'Regular lines (default): balanced between visibility and elegance.',
  boldWeightDescription:
    'Bold lines: thick, prominent strokes. Good for large printed charts or low-vision accessibility.',
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
  unicodeDescription:
    'Symbolen weergeven als Unicode-teksttekens (♅, ♇, ☿, enz.). Dit gebruikt de ingebouwde glyphen van het lettertype en is snel en licht, maar het uiterlijk is afhankelijk van uw lettertype.',
  drawnDescription:
    'Symbolen weergeven als SVG-paden met de hand getekend. Dit biedt een consistent uiterlijk op alle apparaten en maakt fijnafstelling van lijngewicht en formvarianten mogelijk (bijv. Uranus en Plutt hebben alternatieve vormen).',
  textDescription:
    'Symbolen weergeven als lettercodes (♅ wordt \'U\', ♇ wordt \'P\', enz.). Dit is compact en altijd leesbaar, maar verliest visuele distinctiviteit.',
  weightLabel: 'Lijndikte',
  weightOptions: { fine: 'Fijn', regular: 'Normaal', bold: 'Dik' },
  weightAvailableWhen: '(Alleen beschikbaar als Symbolen is ingesteld op "Getekend")',
  weightHint:
    'Hoe dik de lijnen van de getekende planeet- en aspectsymbolen zijn. De dierenriemtekens zijn massieve vormen en veranderen niet.',
  fineWeightDescription:
    'Fijne lijnen: delicaat, minimaal visueel gewicht. Goed voor dichte grafieken of kleine schermen.',
  regularWeightDescription:
    'Normale lijnen (standaard): gebalanceerd tussen zichtbaarheid en elegantie.',
  boldWeightDescription:
    'Vette lijnen: dikke, opvallende lijnen. Goed voor grote afgedrukte grafieken of toegankelijkheid voor slechtzienden.',
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
